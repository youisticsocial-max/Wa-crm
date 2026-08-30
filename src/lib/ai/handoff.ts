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
 * Scans customer turns in REVERSE order (newest to oldest) so that the
 * LATEST explicit customer value (budget, timeline, requirement updates)
 * overrides older values.
 */
export function extractHandoffBrief(messages: ChatMessage[]): StructuredHandoffBrief {
  const userTurns = messages.filter((m) => m.role === 'user' && m.content.trim())
  const assistantTurns = messages.filter((m) => m.role === 'assistant' && m.content.trim())
  const reversedUserTurns = [...userTurns].reverse()
  const lastCustomer = userTurns.length > 0 ? userTurns[userTurns.length - 1].content.trim() : ''
  const allUserText = userTurns.map((m) => m.content).join(' ')

  // 1. Service / Category Detection (newest explicit match wins)
  let service: string | undefined
  for (const turn of reversedUserTurns) {
    const text = turn.content
    if (/erp|inventory|creditor|billing|workshop|accountant|accounting/i.test(text)) {
      service = 'Custom ERP'
      break
    } else if (/website|e-?commerce|online store|web dev|web app/i.test(text)) {
      service = 'Website / Store'
      break
    } else if (/branding|logo|founder branding|design/i.test(text)) {
      service = 'Founder Branding Package'
      break
    } else if (/crm|whatsapp crm|leads/i.test(text)) {
      service = 'WhatsApp CRM'
      break
    } else if (/software|custom app|mobile app/i.test(text)) {
      service = 'Custom Software'
      break
    } else if (/refund|return|order status/i.test(text)) {
      service = 'Order / Refund Support'
      break
    }
  }

  // Fallback service scan on entire combined text if specific turn missed
  if (!service) {
    if (/erp|inventory|creditor|billing|workshop|accountant|accounting/i.test(allUserText)) {
      service = 'Custom ERP'
    } else if (/website|e-?commerce|online store|web dev|web app/i.test(allUserText)) {
      service = 'Website / Store'
    } else if (/refund|return|order status/i.test(allUserText)) {
      service = 'Order / Refund Support'
    }
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

  // 3. Explicit Budget Detection (LATEST customer value wins!)
  let budget: string | undefined
  const budgetRegex =
    /(?:₹|\$|€|£|INR|USD)\s*\d+[\d,.]*\s*(?:k|lakh|lac|lkh|m|thousand)?|\b\d+[\d,.]*\s*(?:k|lakh|lac|lkh|m|thousand|rupees|dollars)\b/gi
  for (const turn of reversedUserTurns) {
    const matches = turn.content.match(budgetRegex)
    if (matches && matches.length > 0) {
      budget = matches[matches.length - 1].trim()
      break
    }
  }

  // 4. Explicit Timeline Detection (LATEST customer value wins!)
  let timeline: string | undefined
  const timelineRegex =
    /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:day|days|din|week|weeks|month|months|hr|hrs|hour|hours)\b|\b(?:asap|urgently|immediately|this week|next week|this month)\b/gi
  for (const turn of reversedUserTurns) {
    const matches = turn.content.match(timelineRegex)
    if (matches && matches.length > 0) {
      timeline = matches[matches.length - 1].trim()
      break
    }
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
  } else if (/quote|quotation|price|pricing|cost|how much|rate|kitna/i.test(lastCustomer || allUserText)) {
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
  hasBridgeMessage?: boolean
}): string {
  const { messages, replyCount, hasBridgeMessage = false } = args
  const brief = extractHandoffBrief(messages)

  const effectiveReplyCount = replyCount + (hasBridgeMessage ? 1 : 0)

  const repliesText =
    effectiveReplyCount === 0
      ? 'without replying'
      : `after ${effectiveReplyCount} ${effectiveReplyCount === 1 ? 'reply' : 'replies'}`

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
 * formatted cleanly into 2-4 short scannable paragraphs with blank lines.
 */
export function buildBridgeMessage(messages: ChatMessage[]): string {
  const brief = extractHandoffBrief(messages)
  const isHindi = /samajh|aap|karne|karna|taki|hai|hoga|karein|bhi|nahi|chaiye|chahiye|din|din me|hum|hume|ho/i.test(
    messages.map((m) => m.content).join(' '),
  )

  if (isHindi) {
    const blocks: string[] = ['Samajh gaya 👍']

    if (brief.service === 'Custom ERP' && brief.need) {
      blocks.push(
        `Aapko ${brief.need} ke liye custom ERP requirement hai${
          brief.timeline ? `, aur timeline ${brief.timeline} ki hai` : ''
        }.`,
      )
    } else if (brief.need) {
      blocks.push(
        `Aapko ${brief.need} ke liye solution requirement hai${
          brief.timeline ? `, aur timeline ${brief.timeline} ki hai` : ''
        }.`,
      )
    } else {
      blocks.push(`Aapki requirement note kar li gayi hai.`)
    }

    if (brief.timeline || brief.budget) {
      blocks.push(
        `Tight timeline ya budget requirement me exact commitment se pehle hume scope aur feasibility check karni hoti hai.`,
      )
    }

    if (brief.reason === 'Refund / complaint escalation') {
      blocks.push(
        `Main aapki chat senior agent ko transfer kar raha hoon taaki issue ko jald resolve kiya ja sake.`,
      )
    } else {
      blocks.push(
        `Main requirement team ko forward kar raha hoon taki wo final estimate aur availability confirm kar saken.`,
      )
    }

    return blocks.join('\n\n')
  }

  const blocks: string[] = ['Got it 👍']

  if (brief.service === 'Custom ERP' && brief.need) {
    blocks.push(
      `I have noted your requirements for ${brief.need}${
        brief.timeline ? ` with a timeline of ${brief.timeline}` : ''
      }.`,
    )
  } else if (brief.need) {
    blocks.push(`I have noted your requirement: ${brief.need}.`)
  } else {
    blocks.push(`Your request has been recorded.`)
  }

  if (brief.reason === 'Refund / complaint escalation') {
    blocks.push(
      `I am transferring your thread to a senior support agent right now to resolve this.`,
    )
  } else {
    blocks.push(
      `I am forwarding your details to our team so they can review the scope and confirm exact pricing and timeline.`,
    )
  }

  return blocks.join('\n\n')
}

function truncate(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, ' ')
  if (collapsed.length <= max) return collapsed
  return `${collapsed.slice(0, max - 1).trimEnd()}…`
}
