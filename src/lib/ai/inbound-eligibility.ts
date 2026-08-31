export interface InboundAiEligibility {
  flowConsumed: boolean
  deterministicAutomationReplied: boolean
  interactiveReply: boolean
  inboundText: string
}

/** Webhook-level gates evaluated before durable AI debounce is scheduled. */
export function shouldScheduleInboundAi(input: InboundAiEligibility): boolean {
  return (
    !input.flowConsumed &&
    !input.deterministicAutomationReplied &&
    !input.interactiveReply &&
    Boolean(input.inboundText.trim())
  )
}
