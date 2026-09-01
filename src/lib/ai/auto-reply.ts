import { supabaseAdmin } from './admin-client'
import { loadAiConfig } from './config'
import { buildConversationContext } from './context'
import { retrieveKnowledge } from './knowledge'
import { generateReply } from './generate'
import { buildSystemPrompt } from './defaults'
import { buildHandoffSummary, buildBridgeMessage, extractHandoffBrief } from './handoff'
import { sanitizeReplyScript, formatWhatsAppMessage } from './sanitize'
import { logAiUsage } from './usage'
import { latestCustomerBurst, latestUserMessage } from './query'
import { classifyNegotiation } from './classifier'
import { engineSendText } from '@/lib/flows/meta-send'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { sendPushToUser, sendPushToQueue } from '@/lib/push/send'

interface DispatchArgs {
  /** Tenancy key — drives config, contact, and whatsapp_config lookups. */
  accountId: string
  conversationId: string
  contactId: string
  /** The account's WhatsApp config owner, used for the outbound send's
   *  audit columns (mirrors how the flow runner passes it through). */
  configOwnerUserId: string
}

/**
 * AI auto-reply for a freshly-arrived inbound message.
 *
 * Invoked from the WhatsApp webhook's `after()` block, only when no
 * deterministic flow consumed the message (flows win). Mirrors the flow
 * runner's contract: it owns its try/catch and NEVER throws — a failing
 * or slow LLM call must not affect the webhook's 200 to Meta.
 *
 * Eligibility gates (any → silent no-op):
 *   - AI off / auto-reply disabled for the account
 *   - a human agent is assigned (they own the thread)
 *   - auto-reply was disabled for this conversation (prior handoff)
 *   - there's nothing to reply to
 *
 * The 24h WhatsApp session window is inherently open here — we're
 * reacting to a customer message that just landed — so no separate
 * window check is needed.
 */
export async function dispatchInboundToAiReply(
  args: DispatchArgs,
): Promise<void> {
  const { accountId, conversationId, contactId, configOwnerUserId } = args

  try {
    const db = supabaseAdmin()

    const config = await loadAiConfig(db, accountId)
    if (!config || !config.autoReplyEnabled) return

    // The webhook has already given deterministic flows/automations first
    // refusal and atomically claimed the latest debounce generation. Recheck
    // ownership here because a human may take over during the 8-second wait.
    const { data: conv, error: convErr } = await db
      .from('conversations')
      .select('assigned_agent_id, ai_autoreply_disabled, ai_reply_count')
      .eq('id', conversationId)
      .maybeSingle()
    if (convErr || !conv) return
    if (conv.assigned_agent_id) return // a human owns this thread
    if (conv.ai_autoreply_disabled) return // handed off / turned off here
    const messages = await buildConversationContext(db, conversationId)
    if (messages.length === 0) return

    // Account-wide throttle on the shared BYO key. Durable inbound
    // debounce bounds one thread; this bounds a burst across many threads
    // (a marketing blast landing 200 replies at once) so we never run the
    // owner's key past the provider's rate limit. Over the limit → skip
    // this dispatch; a later inbound can schedule another one.
    const acctLimit = checkRateLimit(
      `ai-autoreply:${accountId}`,
      RATE_LIMITS.aiAutoReplyAccount,
    )
    if (!acctLimit.success) {
      console.warn(
        `[ai auto-reply] account ${accountId} hit the per-account rate limit — skipping this inbound.`,
      )
      return
    }

    const currentBurst = latestCustomerBurst(messages)
    const customerText = currentBurst.join('\n') || latestUserMessage(messages)
    // Ground the reply in the account's knowledge base (best-effort).
    const knowledge = await retrieveKnowledge(
      db,
      accountId,
      config,
      customerText,
    )

    const systemPrompt = buildSystemPrompt({
      userPrompt: config.systemPrompt,
      mode: 'auto_reply',
      knowledge,
      currentCustomerBurst: currentBurst,
    })

    const { text, handoff, usage } = await generateReply({
      config,
      systemPrompt,
      messages,
    })

    // Record token spend on the account's BYO key. Fire-and-forget so it
    // never adds latency to the customer-facing send: `logAiUsage`
    // swallows its own errors, so the floating promise can't reject.
    // Logged regardless of handoff — the provider call happened either
    // way.
    void logAiUsage(db, {
      accountId,
      conversationId,
      mode: 'auto_reply',
      provider: config.provider,
      model: config.model,
      usage,
    })

    if (handoff || !text) {
      // Ensure the customer gets a natural bridge message rather than an abrupt silence.
      const rawBridge = text && text.trim() ? text.trim() : buildBridgeMessage(messages)
      const bridgeText = formatWhatsAppMessage(sanitizeReplyScript(rawBridge, customerText))
      const hasBridge = Boolean(bridgeText)

      // The model can't (or shouldn't) answer — stop auto-replying on
      // this thread and hand it to a human. We (a) pause the bot here
      // (sticky until re-enabled), (b) route the conversation to the
      // configured handoff agent — null leaves it in the shared queue —
      // and (c) leave a structured internal brief so whoever picks it up has
      // context. Assigning fires the `on_conversation_assigned` trigger,
      // which notifies the agent.
      const summary = buildHandoffSummary({
        messages,
        replyCount: conv.ai_reply_count ?? 0,
        hasBridgeMessage: hasBridge,
      })
      const update: Record<string, unknown> = {
        ai_handoff_summary: summary,
      }
      // Only set the assignee when a target is configured AND the thread
      // isn't already owned — never stomp an existing human assignment.
      if (config.handoffAgentId && !conv.assigned_agent_id) {
        update.assigned_agent_id = config.handoffAgentId
      }
      await db.from('conversations').update(update).eq('id', conversationId)

      // Send push notification for handoff
      const targetAgentId = config.handoffAgentId && !conv.assigned_agent_id 
        ? config.handoffAgentId 
        : conv.assigned_agent_id
      
      const pushPayload = {
        title: 'Human review needed',
        body: 'Customer needs human confirmation',
        type: 'ai_handoff',
        conversationId: conversationId,
        url: `/inbox?c=${conversationId}`,
        tag: `ai-handoff-${conversationId}`,
        requireInteraction: true,
        renotify: true,
      }
      
      if (targetAgentId) {
        await sendPushToUser(db, targetAgentId, pushPayload)
      } else {
        await sendPushToQueue(db, accountId, pushPayload)
      }

      if (bridgeText) {
        await engineSendText({
          accountId,
          userId: configOwnerUserId,
          conversationId,
          contactId,
          text: bridgeText,
          aiGenerated: true,
        })
        await recordAiReplySent(db, conversationId)
      }
      return
    }

    const replyText = formatWhatsAppMessage(sanitizeReplyScript(text, customerText))

    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      text: replyText,
      aiGenerated: true,
    })
    await recordAiReplySent(db, conversationId)

    // Evaluate qualification silently
    try {
      const brief = extractHandoffBrief(messages)
      if (brief.service && brief.need && (brief.budget || brief.timeline)) {
        await db.rpc('advance_deal_stage_safely', {
          p_account_id: accountId,
          p_contact_id: contactId,
          p_pipeline_name: 'Sales Pipeline',
          p_target_stage_name: 'Qualified',
        })
      }
    } catch (err) {
      console.error('[ai auto-reply] qualification evaluation failed:', err)
    }

    // Evaluate negotiation silently
    try {
      const { data: activeDeal } = await db
        .from('deals')
        .select('id, stage:pipeline_stages(name)')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .eq('status', 'open')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      // @ts-ignore - Supabase type generation doesn't know about the join alias structure here
      const stageName = activeDeal?.stage?.name
      
      if (activeDeal && stageName === 'Proposal Sent') {
        const negotiation = await classifyNegotiation(customerText, config)
        if (negotiation?.negotiation_detected && negotiation.confidence >= 0.80) {
          await db.from('conversations').update({
            negotiation_suggestion: {
              detected: true,
              reason: negotiation.reason,
              confidence: negotiation.confidence,
              message_burst: customerText
            }
          }).eq('id', conversationId)
        }
      }
    } catch (err) {
      console.error('[ai auto-reply] negotiation evaluation failed:', err)
    }
  } catch (err) {
    console.error('[ai auto-reply] dispatch failed:', err)
  }
}

async function recordAiReplySent(
  db: ReturnType<typeof supabaseAdmin>,
  conversationId: string,
): Promise<void> {
  const { error } = await db.rpc('record_ai_reply_sent', {
    target_conversation_id: conversationId,
  })
  if (error) {
    console.warn('[ai auto-reply] failed to record sent reply:', error)
  }
}
