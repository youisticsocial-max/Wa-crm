import { describe, expect, it } from 'vitest'
import { shouldScheduleInboundAi } from './inbound-eligibility'

const BASE = {
  flowConsumed: false,
  deterministicAutomationReplied: false,
  interactiveReply: false,
  inboundText: 'Need help with my project',
}

describe('inbound AI eligibility', () => {
  it('avoids a duplicate reply when the welcome automation answered this inbound', () => {
    expect(
      shouldScheduleInboundAi({ ...BASE, deterministicAutomationReplied: true }),
    ).toBe(false)
  })

  it('allows AI on a later inbound after the one-time welcome no longer replies', () => {
    expect(shouldScheduleInboundAi(BASE)).toBe(true)
  })

  it('keeps deterministic flows and interactive replies ahead of AI', () => {
    expect(shouldScheduleInboundAi({ ...BASE, flowConsumed: true })).toBe(false)
    expect(shouldScheduleInboundAi({ ...BASE, interactiveReply: true })).toBe(false)
  })
})
