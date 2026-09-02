import { describe, expect, it } from 'vitest'
import { buildSystemPrompt } from './defaults'

describe('auto-reply system prompt', () => {
  it('treats a multi-message burst as one structured response', () => {
    const prompt = buildSystemPrompt({ userPrompt: null, mode: 'auto_reply' })
    expect(prompt).toContain('one combined request')
    expect(prompt).toContain('compact bullet list')
    expect(prompt).toContain('2–4 short paragraphs')
  })

  it('preserves returning-client context and customer language/script', () => {
    const prompt = buildSystemPrompt({ userPrompt: null, mode: 'auto_reply' })
    expect(prompt).toContain('full conversation history')
    expect(prompt).toContain('do not repeat a greeting')
    expect(prompt).toContain('same language and tone')
  })

  it('limits handoff to genuine human confirmation or action', () => {
    const prompt = buildSystemPrompt({ userPrompt: null, mode: 'auto_reply' })
    expect(prompt).toContain('final price or quotation commitment')
    expect(prompt).toContain('refund or dispute')
    expect(prompt).toContain('explicit request for a human')
  })

  it('makes a later change/delivery/training burst dominate an older unrelated inquiry', () => {
    const currentBurst = [
      'Header blue karna hai.',
      'Delivery kitne din me hogi?',
      'Mere bete ko use karna sikhana hai.',
    ]
    const prompt = buildSystemPrompt({
      userPrompt: null,
      mode: 'auto_reply',
      currentCustomerBurst: currentBurst,
    })

    expect(prompt).toContain('HIGHEST PRIORITY')
    expect(prompt).toContain('Never carry an unrelated older project')
    expect(prompt).toContain('existing-project request')
    expect(prompt).toContain(JSON.stringify(currentBurst))
    expect(prompt).not.toContain('Mobile app banana hai')
  })

  describe('business hours grounding', () => {
    const configuredHours = {
      timezone: 'Asia/Calcutta',
      workingDays: [1, 2, 3, 4, 5, 6], // Mon-Sat
      startTime: '15:00',
      endTime: '21:00',
    }

    it('injects exactly configured hours and prevents hallucination', () => {
      const prompt = buildSystemPrompt({
        userPrompt: null,
        mode: 'auto_reply',
        businessHours: configuredHours,
      })
      expect(prompt).toContain('Authoritative business availability')
      expect(prompt).toContain('Monday, Tuesday, Wednesday, Thursday, Friday, Saturday')
      expect(prompt).toContain('15:00-21:00')
      expect(prompt).toContain('Asia/Calcutta')
      expect(prompt).toContain('The assistant MUST use these exact values')
      expect(prompt).toContain('must not invent different hours')
    })

    it('does not inject fake business hours when unconfigured', () => {
      const prompt = buildSystemPrompt({
        userPrompt: null,
        mode: 'auto_reply',
        businessHours: null,
      })
      expect(prompt).not.toContain('Authoritative business availability')
      expect(prompt).not.toContain('Working days:')
    })
  })
})
