import webpush from 'web-push'
import { SupabaseClient } from '@supabase/supabase-js'

export interface PushPayload {
  title: string
  body: string
  type: string
  conversationId: string
  url: string
  tag?: string
  requireInteraction?: boolean
  renotify?: boolean
}

// Lazy init so we don't crash on boot if env vars are missing
let vapidInitialized = false
function initVapid() {
  if (vapidInitialized) return
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (publicKey && privateKey) {
    webpush.setVapidDetails(
      'mailto:admin@youistic.com',
      publicKey,
      privateKey
    )
    vapidInitialized = true
  }
}

/**
 * Send a push notification to all active devices for a specific user.
 */
export async function sendPushToUser(
  db: SupabaseClient,
  userId: string,
  payload: PushPayload
): Promise<void> {
  initVapid()
  if (!vapidInitialized) {
    console.warn('[push] VAPID keys missing, cannot send push')
    return
  }

  const { data: subs, error } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)
    .eq('enabled', true)

  if (error) {
    console.error('[push] error fetching subscriptions:', error)
    return
  }
  if (!subs || subs.length === 0) return

  await firePushToSubscriptions(db, subs, payload)
}

/**
 * Send a push notification to all workspace admins/owners.
 */
export async function sendPushToQueue(
  db: SupabaseClient,
  accountId: string,
  payload: PushPayload
): Promise<void> {
  initVapid()
  if (!vapidInitialized) {
    console.warn('[push] VAPID keys missing, cannot send push')
    return
  }

  // Get all admins and owners in the account
  const { data: profiles, error: profileErr } = await db
    .from('profiles')
    .select('user_id')
    .eq('account_id', accountId)
    .in('account_role', ['owner', 'admin'])

  if (profileErr) {
    console.error('[push] error fetching queue users:', profileErr)
    return
  }
  if (!profiles || profiles.length === 0) return

  const userIds = profiles.map(p => p.user_id)

  const { data: subs, error: subErr } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', userIds)
    .eq('enabled', true)

  if (subErr) {
    console.error('[push] error fetching subscriptions for queue:', subErr)
    return
  }
  if (!subs || subs.length === 0) return

  await firePushToSubscriptions(db, subs, payload)
}

/**
 * Internal helper to send push payloads and handle cleanup of expired devices.
 */
async function firePushToSubscriptions(
  db: SupabaseClient,
  subscriptions: Array<{
    id: string
    endpoint: string
    p256dh: string
    auth: string
  }>,
  payload: PushPayload
) {
  const payloadString = JSON.stringify(payload)

  const promises = subscriptions.map(async (sub) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        payloadString
      )
    } catch (err: any) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        // Subscription expired or was revoked by the user on the device
        console.log(`[push] Subscription expired (${err.statusCode}), cleaning up ${sub.id}`)
        await db
          .from('push_subscriptions')
          .delete()
          .eq('id', sub.id)
      } else {
        console.error('[push] Error sending to device:', err)
      }
    }
  })

  // We await Promise.allSettled so one failed device does not block others
  await Promise.allSettled(promises)
}
