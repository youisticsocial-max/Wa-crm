'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Duplicate to avoid dependency cycles and keep server action lightweight
function createClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async getAll() {
          return (await cookies()).getAll();
        },
        async setAll(cookiesToSet) {
          try {
            const cookieStore = await cookies();
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Can be ignored if called from a Server Component
          }
        },
      },
    }
  );
}

export async function savePushSubscription(
  subscription: PushSubscription,
  userAgent?: string,
  deviceLabel?: string
) {
  const supabase = createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error('Unauthorized');
  }

  // The client passes a native PushSubscription object which becomes JSON here
  const subData = JSON.parse(JSON.stringify(subscription));
  
  if (!subData.endpoint || !subData.keys?.p256dh || !subData.keys?.auth) {
    throw new Error('Invalid subscription payload');
  }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: subData.endpoint,
      p256dh: subData.keys.p256dh,
      auth: subData.keys.auth,
      user_agent: userAgent,
      device_label: deviceLabel,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' }
  );

  if (error) {
    console.error('Failed to save push subscription:', error);
    throw new Error('Database error');
  }

  return { success: true };
}

export async function deletePushSubscription(endpoint: string) {
  const supabase = createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error('Unauthorized');
  }

  if (!endpoint) {
    throw new Error('Invalid endpoint');
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', user.id);

  if (error) {
    console.error('Failed to delete push subscription:', error);
    throw new Error('Database error');
  }

  return { success: true };
}

export async function getPushSubscriptionStatus(endpoint: string) {
  const supabase = createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return { isSubscribed: false };
  }

  if (!endpoint) {
    return { isSubscribed: false };
  }

  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('id, enabled')
    .eq('endpoint', endpoint)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data) {
    return { isSubscribed: false };
  }

  return { isSubscribed: true, isEnabled: data.enabled };
}
