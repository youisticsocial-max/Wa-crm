import type { ChatMessage } from './types'

/**
 * The text to retrieve knowledge against: the most recent customer
 * (`user`) turn in the conversation context. Falls back to the last
 * message of any role, then empty string. Shared by the draft route and
 * the auto-reply bot so both query the knowledge base the same way.
 */
export function latestUserMessage(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content
  }
  return messages.length > 0 ? messages[messages.length - 1].content : ''
}

/**
 * Consecutive customer turns at the end of the transcript are the current
 * inbound burst. Older turns remain available as history, but callers can
 * give this slice stronger intent/language/retrieval weight.
 */
export function latestCustomerBurst(messages: ChatMessage[]): string[] {
  const burst: string[] = []
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role !== 'user') break
    if (message.content.trim()) burst.push(message.content.trim())
  }
  return burst.reverse()
}
