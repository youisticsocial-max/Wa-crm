import { describe, it, expect } from 'vitest'
import { buildHandoffSummary, extractHandoffBrief, buildBridgeMessage } from './handoff'

describe('extractHandoffBrief', () => {
  it('extracts service, requirements, budget, timeline, and reason when present', () => {
    const brief = extractHandoffBrief([
      { role: 'user', content: 'Need a custom ERP with inventory, creditors, billing and workshop modules.' },
      { role: 'assistant', content: 'We can build that. What is your budget and timeline?' },
      { role: 'user', content: 'My budget is ₹80k and timeline is 1 month. Can I get an exact quote?' },
    ])

    expect(brief.service).toBe('Custom ERP')
    expect(brief.need).toBe('Inventory + creditors + billing + workshop')
    expect(brief.budget).toBe('₹80k')
    expect(brief.timeline).toBe('1 month')
    expect(brief.reason).toBe('Exact quotation requested')
    expect(brief.nextAction).toBe('Review scope and confirm price/timeline')
  })

  it('prioritizes latest explicit timeline over earlier timeline', () => {
    const brief = extractHandoffBrief([
      { role: 'user', content: 'Need a custom ERP with inventory and billing. Timeline 1 month.' },
      { role: 'user', content: 'Urgent correction: mujhe 5 din me chahiye bht urgent he. 1lkh paise le lena.' },
    ])

    expect(brief.timeline).toBe('5 din')
    expect(brief.budget).toBe('1lkh')
  })

  it('prioritizes latest explicit budget over earlier budget', () => {
    const brief = extractHandoffBrief([
      { role: 'user', content: 'Looking for custom software. Budget is 80k.' },
      { role: 'user', content: 'Actually my budget is 1lakh now.' },
    ])

    expect(brief.budget).toBe('1lakh')
  })

  it('omits budget and timeline when not explicitly mentioned in user text (no hallucination)', () => {
    const brief = extractHandoffBrief([
      { role: 'user', content: 'Can I speak to a human manager about my refund?' },
    ])

    expect(brief.service).toBe('Order / Refund Support')
    expect(brief.budget).toBeUndefined()
    expect(brief.timeline).toBeUndefined()
    expect(brief.reason).toBe('Customer requested human agent')
    expect(brief.nextAction).toBe('Greet customer and assist with their inquiry')
  })
})

describe('buildHandoffSummary', () => {
  it('builds a multiline structured brief for ERP quote request', () => {
    const summary = buildHandoffSummary({
      messages: [
        { role: 'user', content: 'Looking for a Custom ERP with inventory and billing.' },
        { role: 'user', content: 'Budget is ₹80k within 1 month. Send quotation.' },
      ],
      replyCount: 2,
    })

    expect(summary).toContain('🤖 AI agent handed off (after 2 replies):')
    expect(summary).toContain('Service: Custom ERP')
    expect(summary).toContain('Need: Inventory + billing')
    expect(summary).toContain('Budget: ₹80k')
    expect(summary).toContain('Timeline: 1 month')
    expect(summary).toContain('Handoff reason: Exact quotation requested')
    expect(summary).toContain('Next action: Review scope and confirm price/timeline')
  })

  it('does not say "without replying" when a bridge message is dispatched during handoff', () => {
    const summary = buildHandoffSummary({
      messages: [{ role: 'user', content: 'Need custom ERP in 5 days' }],
      replyCount: 0,
      hasBridgeMessage: true,
    })

    expect(summary).not.toContain('(without replying)')
    expect(summary).toContain('🤖 AI agent handed off (after 1 reply):')
  })

  it('omits budget and timeline lines cleanly when missing', () => {
    const summary = buildHandoffSummary({
      messages: [{ role: 'user', content: 'I need a refund for my order.' }],
      replyCount: 0,
    })

    expect(summary).toContain('🤖 AI agent handed off (without replying):')
    expect(summary).toContain('Service: Order / Refund Support')
    expect(summary).not.toContain('Budget:')
    expect(summary).not.toContain('Timeline:')
    expect(summary).toContain('Handoff reason: Refund / complaint escalation')
    expect(summary).toContain('Next action: Review order details and process resolution')
  })

  it('degrades gracefully when there is no customer message', () => {
    const summary = buildHandoffSummary({
      messages: [{ role: 'assistant', content: 'greeting' }],
      replyCount: 0,
    })
    expect(summary).toContain('🤖 AI agent handed off (without replying):')
    expect(summary).toContain('Handoff reason: Complex query needing human assistance')
  })
})

describe('buildBridgeMessage', () => {
  it('formats bridge messages into short readable paragraphs with double line breaks', () => {
    const msg = buildBridgeMessage([
      { role: 'user', content: 'Hi, hume inventory aur billing ke liye custom ERP chahiye, 5 din me deliver ho jayega?' },
    ])
    expect(msg).toContain('Inventory + billing')
    expect(msg).toContain('ERP')
    expect(msg).toContain('\n\n')
    const paragraphs = msg.split('\n\n')
    expect(paragraphs.length).toBeGreaterThanOrEqual(2)
  })

  it('generates a clear bridge message for refund requests in English', () => {
    const msg = buildBridgeMessage([
      { role: 'user', content: 'I need a refund for my order.' },
    ])
    expect(msg).toContain('transferring your thread')
  })
})
