'use client';

import { useState, useEffect } from 'react';
import { SettingsPanelHead } from './settings-panel-head';
import { SECTION_META } from './settings-sections';
import { Switch } from '@/components/ui/switch';
import { ShieldAlert } from 'lucide-react';
import { savePushSubscription, deletePushSubscription, getPushSubscriptionStatus } from '@/app/actions/push-subscriptions';
import { toast } from 'sonner';

export function NotificationsPanel() {
  const meta = SECTION_META['notifications'];
  const [isSupported, setIsSupported] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const checkSupport = async () => {
      const supported = 'serviceWorker' in navigator && 'PushManager' in window;
      setIsSupported(supported);
      const standalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
      setIsStandalone(standalone);
      setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream);

      if (supported) {
        setPermission(Notification.permission);
        if (Notification.permission === 'granted') {
          try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) {
              const status = await getPushSubscriptionStatus(subscription.endpoint);
              setIsSubscribed(status.isSubscribed);
            }
          } catch (e) {
            console.error('Failed to check subscription:', e);
          }
        }
      }
      setLoading(false);
    };
    checkSupport();
  }, []);

  const handleToggle = async (checked: boolean) => {
    if (checked) {
      await subscribe();
    } else {
      await unsubscribe();
    }
  };

  const subscribe = async () => {
    setLoading(true);
    try {
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);

      if (permissionResult !== 'granted') {
        toast.error('Notification permission denied.');
        setLoading(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        throw new Error('VAPID public key is not configured.');
      }

      const applicationServerKey = urlB64ToUint8Array(vapidKey);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      await savePushSubscription(subscription, navigator.userAgent);
      setIsSubscribed(true);
      toast.success('Push notifications enabled');
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Failed to enable notifications');
    } finally {
      setLoading(false);
    }
  };

  const unsubscribe = async () => {
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await deletePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setIsSubscribed(false);
      toast.success('Push notifications disabled');
    } catch (e: any) {
      console.error(e);
      toast.error('Failed to disable notifications');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-6">
      <SettingsPanelHead title={meta.label} />
      <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6 space-y-6">
        <div>
          <h3 className="text-lg font-medium">Desktop & Mobile Push</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Receive push notifications when a customer sends a message or when the AI hands off a conversation.
          </p>
        </div>

        {!loading && !isSupported && (
          <div className="rounded-lg bg-amber-500/10 p-4 flex items-start gap-3 border border-amber-500/20">
            <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-500/90">
              Your browser does not support Web Push notifications.
            </div>
          </div>
        )}

        {!loading && isSupported && isIOS && !isStandalone && (
          <div className="rounded-lg bg-blue-500/10 p-4 flex items-start gap-3 border border-blue-500/20">
            <ShieldAlert className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-500/90">
              <p className="font-medium text-blue-500">Install WA-CRM to Home Screen</p>
              <p className="mt-1">
                To receive notifications on iOS, you must first add this app to your Home Screen using the Share menu, and then open it from there.
              </p>
            </div>
          </div>
        )}

        {!loading && isSupported && (!isIOS || isStandalone) && (
          <div className="flex items-center justify-between border-t pt-6">
            <div className="space-y-0.5">
              <div className="font-medium">Enable Notifications</div>
              <div className="text-sm text-muted-foreground">
                {permission === 'denied' 
                  ? 'Permission denied in browser settings.' 
                  : 'Turn on background notifications for this device.'}
              </div>
            </div>
            <Switch
              checked={isSubscribed}
              onCheckedChange={handleToggle}
              disabled={loading || permission === 'denied'}
            />
          </div>
        )}
      </div>
    </section>
  );
}

function urlB64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
