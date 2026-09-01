import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { sendPushToUser, sendPushToQueue } from '@/lib/push/send'

export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }
  const supplied = request.headers.get('x-cron-secret') ?? ''
  const suppliedBuf = Buffer.from(supplied)
  const expectedBuf = Buffer.from(expected)
  if (
    suppliedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(suppliedBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = supabaseAdmin()
  const { data: deals, error } = await admin
    .from('deals')
    .select('id, account_id, contact_id, contacts(name)')
    .eq('status', 'open')
    .lte('follow_up_at', new Date().toISOString())
    .not('follow_up_at', 'is', null)
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!deals || deals.length === 0) return NextResponse.json({ processed: 0 })

  let processed = 0
  for (const deal of deals) {
    // Attempt to claim/clear follow_up_at atomically
    const { data: claim, error: claimErr } = await admin
      .from('deals')
      .update({ follow_up_at: null })
      .eq('id', deal.id)
      .not('follow_up_at', 'is', null)
      .select('id')
      .maybeSingle()
      
    if (!claim || claimErr) continue

    // Find the conversation to get assigned agent
    const { data: conv } = await admin
      .from('conversations')
      .select('id, assigned_agent_id')
      .eq('account_id', deal.account_id)
      .eq('contact_id', deal.contact_id)
      .eq('status', 'open')
      .maybeSingle()

    const conversationId = conv?.id
    const assignedUserId = conv?.assigned_agent_id
    
    // Type extraction bypass since Supabase typed returns can be tricky with joins
    // @ts-ignore
    const contactName = deal.contacts?.name || 'Contact'

    // Create an internal notification
    await admin.from('notifications').insert({
      account_id: deal.account_id,
      user_id: assignedUserId || null,
      type: 'conversation_assigned',
      title: 'Follow-up reminder',
      body: `Follow up with ${contactName}`,
      link: conversationId ? `/inbox?c=${conversationId}` : '/inbox',
      read: false
    })

    // Send push
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

  return NextResponse.json({ processed })
}
