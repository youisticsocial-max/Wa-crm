import { SupabaseClient } from '@supabase/supabase-js'
import { sendPushToUser, sendPushToQueue } from '@/lib/push/send'

/**
 * Scans for due Nurture follow-up reminders, invokes the atomic
 * process_due_follow_up RPC (which guarantees exactly-once internal
 * notification creation), and sends a best-effort Web Push notification.
 */
export async function processDueFollowUps(admin: SupabaseClient) {
  // 1. Find deals that are due, open, and not yet successfully notified.
  // We use follow_up_claimed_at to prevent overlapping cron runs from picking up the same deal concurrently.
  // A claim times out after 5 minutes in case the process hard-crashed before RPC could run.
  const claimTimeout = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  
  const { data: deals, error } = await admin
    .from('deals')
    .select('id, account_id, contact_id, contacts(name), conversation_id')
    .eq('status', 'open')
    .lte('follow_up_at', new Date().toISOString())
    .is('follow_up_notified_at', null)
    .or(`follow_up_claimed_at.is.null,follow_up_claimed_at.lt.${claimTimeout}`)
    .limit(50)

  if (error) {
    console.error('[deals-cron] Error fetching due deals:', error)
    return { processed: 0, error: error.message }
  }
  
  if (!deals || deals.length === 0) return { processed: 0 }

  let processed = 0
  for (const deal of deals) {
    // 2. Lock the row for this Node process
    const { data: claim, error: claimErr } = await admin
      .from('deals')
      .update({ follow_up_claimed_at: new Date().toISOString() })
      .eq('id', deal.id)
      .is('follow_up_claimed_at', null) // only claim if no one else has
      .select('id')
      .maybeSingle()
      
    if (!claim || claimErr) continue // Another runner claimed it, or it was just processed

    // 3. Atomically create the internal notification and mark it as notified
    // The RPC will fail and return false if it's already notified or locked by another RPC call.
    const { data: rpcSuccess, error: rpcErr } = await admin.rpc('process_due_follow_up', {
      p_deal_id: deal.id
    })

    if (rpcErr) {
      console.error(`[deals-cron] RPC failed for deal ${deal.id}:`, rpcErr)
      continue
    }

    if (!rpcSuccess) {
      // Row might have been concurrently processed or follow_up_at cleared by early reply
      continue
    }

    // 4. Best-effort push notification
    // Resolve conversation and assigned agent to send the push
    let conversationId = deal.conversation_id
    let assignedUserId: string | null = null

    // If conversation_id is not explicitly on the deal, fallback to the latest open conversation for this contact
    if (!conversationId) {
       const { data: conv } = await admin
        .from('conversations')
        .select('id, assigned_agent_id')
        .eq('account_id', deal.account_id)
        .eq('contact_id', deal.contact_id)
        .eq('status', 'open')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        
       conversationId = conv?.id
       assignedUserId = conv?.assigned_agent_id
    } else {
       const { data: conv } = await admin
        .from('conversations')
        .select('assigned_agent_id')
        .eq('id', conversationId)
        .maybeSingle()
        
       assignedUserId = conv?.assigned_agent_id
    }

    // @ts-ignore
    const contactName = deal.contacts?.name || 'Contact'
    
    const pushPayload = {
      title: 'Follow-up reminder',
      body: `Follow up with ${contactName}`,
      type: 'follow_up',
      conversationId: conversationId || '',
      url: conversationId ? `/inbox?c=${conversationId}` : '/inbox',
      tag: `followup-${deal.id}`,
    }

    if (assignedUserId) {
      await sendPushToUser(admin, assignedUserId, pushPayload)
    } else {
      await sendPushToQueue(admin, deal.account_id, pushPayload)
    }

    processed++
  }

  return { processed }
}
