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
})
