import type { ChatMessage } from './types'

export interface StructuredHandoffBrief {
  service?: string
  need?: string
  budget?: string
  timeline?: string
  clarified?: string
  reason: string
  nextAction: string
}

/**
 * Extract structured information from a conversation context for handoff.
 * Strictly avoids guessing or hallucinating missing fields:
 * - budget is only populated if explicitly present in customer text
 * - timeline is only populated if explicitly present in customer text
 * - service/category is derived from explicit customer keywords
 */
export function extractHandoffBrief(messages: ChatMessage[]): StructuredHandoffBrief {
  const userTurns = messages.filter((m) => m.role === 'user' && m.content.trim())
  const assistantTurns = messages.filter((m) => m.role === 'assistant' && m.content.trim())
  const lastCustomer = userTurns.length > 0 ? userTurns[userTurns.length - 1].content.trim() : ''
  const allUserText = userTurns.map((m) => m.content).join(' ')

  // 1. Service / Category Detection (strictly from user text)
  let service: string | undefined
  if (/erp|inventory|creditor|billing|workshop|accountant|accounting/i.test(allUserText)) {
    service = 'Custom ERP'
  } else if (/website|e-?commerce|online store|web dev|web app/i.test(allUserText)) {
    service = 'Website / Store'
  } else if (/branding|logo|founder branding|design/i.test(allUserText)) {
    service = 'Founder Branding Package'
  } else if (/crm|whatsapp crm|leads/i.test(allUserText)) {
    service = 'WhatsApp CRM'
  } else if (/software|custom app|mobile app/i.test(allUserText)) {
    service = 'Custom Software'
  } else if (/refund|return|order status/i.test(allUserText)) {
    service = 'Order / Refund Support'
  }

  // 2. Need / Requirement Extraction
  let need: string | undefined
  const featureMatches: string[] = []
  if (/inventory/i.test(allUserText)) featureMatches.push('inventory')
  if (/creditor/i.test(allUserText)) featureMatches.push('creditors')
  if (/billing/i.test(allUserText)) featureMatches.push('billing')
  if (/workshop/i.test(allUserText)) featureMatches.push('workshop')

  if (featureMatches.length >= 2) {
    const formatted = featureMatches.map((f, i) => (i === 0 ? f.charAt(0).toUpperCase() + f.slice(1) : f))
    need = formatted.join(' + ')
  } else if (lastCustomer) {
    const cleaned = lastCustomer
      .replace(/^(hi|hello|hey|good morning|good afternoon|namaste)\b[,\s!]*/i, '')
      .trim()
    need = truncate(cleaned || lastCustomer, 120)
  }

  // 3. Explicit Budget Detection (Do NOT guess if missing!)
  let budget: string | undefined
  const budgetMatch = allUserText.match(
    /(?:₹|\$|€|£|INR|USD)\s*\d+[\d,.]*\s*(?:k|lakh|lac|m|thousand)?|\b\d+[\d,.]*\s*(?:k|lakh|lac|m|thousand|rupees|dollars)\b/i,
  )
  if (budgetMatch) {
    budget = budgetMatch[0].trim()
  }

  // 4. Explicit Timeline Detection (Do NOT guess if missing!)
  let timeline: string | undefined
  const timelineMatch = allUserText.match(
    /\b(?:\d+|one|two|three|four)\s*(?:day|days|week|weeks|month|months)\b|\b(?:asap|urgently|immediately|this week|next week|this month)\b/i,
  )
  if (timelineMatch) {
    timeline = timelineMatch[0].trim()
  }

  // 5. Clarified Info (from assistant turns)
  let clarified: string | undefined
  if (assistantTurns.length > 0) {
    const lastAssistant = assistantTurns[assistantTurns.length - 1].content.trim()
    if (lastAssistant) {
      clarified = truncate(lastAssistant, 120)
    }
  }

  // 6. Handoff Reason Detection
  let reason = 'Complex query needing human assistance'
  if (/human|agent|person|manager|representative|speak to|talk to/i.test(lastCustomer || allUserText)) {
    reason = 'Customer requested human agent'
  } else if (/quote|quotation|price|pricing|cost|how much/i.test(lastCustomer || allUserText)) {
    reason = 'Exact quotation requested'
  } else if (/refund|cancel|wrong|complaint|dispute/i.test(lastCustomer || allUserText)) {
    reason = 'Refund / complaint escalation'
  }

  // 7. Recommended Next Human Action
  let nextAction = 'Review customer requirement and respond'
  if (reason === 'Exact quotation requested') {
    nextAction = 'Review scope and confirm price/timeline'
  } else if (reason === 'Refund / complaint escalation') {
    nextAction = 'Review order details and process resolution'
  } else if (reason === 'Customer requested human agent') {
    nextAction = 'Greet customer and assist with their inquiry'
  }

  return {
    service,
    need,
    budget,
    timeline,
    clarified,
    reason,
    nextAction,
  }
}

/**
 * Build a compact, structured handoff brief for the inbox thread.
 */
export function buildHandoffSummary(args: {
  messages: ChatMessage[]
  replyCount: number
}): string {
  const { messages, replyCount } = args
  const brief = extractHandoffBrief(messages)

  const repliesText =
    replyCount === 0
      ? 'without replying'
      : `after ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`

  const lines: string[] = [`🤖 AI agent handed off (${repliesText}):`]

  if (brief.service) lines.push(`Service: ${brief.service}`)
  if (brief.need) lines.push(`Need: ${brief.need}`)
  if (brief.budget) lines.push(`Budget: ${brief.budget}`)
  if (brief.timeline) lines.push(`Timeline: ${brief.timeline}`)
  lines.push(`Handoff reason: ${brief.reason}`)
  lines.push(`Next action: ${brief.nextAction}`)

  return lines.join('\n')
}

/**
 * Context-aware bridge message sent to the customer on WhatsApp when handoff occurs,
 * ensuring the bot never hands off abruptly without responding.
 */
export function buildBridgeMessage(messages: ChatMessage[]): string {
  const brief = extractHandoffBrief(messages)
  const isHindi = /samajh|aap|karne|karna|taki|hai|hoga|karein|bhi|nahi/i.test(
    messages.map((m) => m.content).join(' '),
  )

  if (isHindi) {
    if (brief.service === 'Custom ERP' && brief.need) {
      return `Samajh gaya — aapko ${brief.need} ko manage karne ke liye ERP requirement hai. Exact estimate ke liye main ye query human team ko forward kar raha hoon, wo jald hi connect karenge.`
    }
    if (brief.reason === 'Refund / complaint escalation') {
      return `Aapki issue note kar li gayi hai. Main aapki chat senior agent ko transfer kar raha hoon taaki issue ko jald resolve kiya ja sake.`
    }
    return `Main aapki query hamari human support team ko forward kar raha hoon. Ek agent jald hi aap se connect karega.`
  }

  if (brief.service === 'Custom ERP' && brief.need) {
    return `Understood — I have noted your requirements for ${brief.need}. I am transferring your request to our team so they can review the scope and provide an exact quote.`
  }
  if (brief.reason === 'Refund / complaint escalation') {
    return `I understand your concern. I am transferring your thread to a support agent right now to assist you with this.`
  }
  return `I am forwarding your conversation to our team so a human agent can assist you right away.`
}

function truncate(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, ' ')
  if (collapsed.length <= max) return collapsed
  return `${collapsed.slice(0, max - 1).trimEnd()}…`
}
