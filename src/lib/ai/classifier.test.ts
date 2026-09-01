import { describe, it, expect, vi } from 'vitest'
import { classifyNegotiation } from './classifier'

const mockConfig = {
  provider: 'openai',
  model: 'gpt-4o',
  api_key: 'test-key',
} as any

vi.mock('./providers/openai', () => ({
  generateOpenAi: vi.fn().mockResolvedValue({ text: `\`\`\`json
{
  "negotiation_detected": true,
  "reason": "Customer is asking for a discount.",
  "confidence": 0.85
}
\`\`\`` }),
}))

vi.mock('./providers/anthropic', () => ({
  generateAnthropic: vi.fn().mockResolvedValue({ text: `{
  "negotiation_detected": false,
  "reason": "General inquiry about product features.",
  "confidence": 0.90
}` }),
}))

describe('classifyNegotiation', () => {
  it('parses markdown-wrapped JSON successfully (OpenAI)', async () => {
    const result = await classifyNegotiation('Can you give me a 10% discount?', mockConfig)
    expect(result).toEqual({
      negotiation_detected: true,
      reason: 'Customer is asking for a discount.',
      confidence: 0.85,
    })
  })

  it('parses raw JSON successfully (Anthropic)', async () => {
    const anthropicConfig = { ...mockConfig, provider: 'anthropic' }
    const result = await classifyNegotiation('What does the pro plan include?', anthropicConfig)
    expect(result).toEqual({
      negotiation_detected: false,
      reason: 'General inquiry about product features.',
      confidence: 0.90,
    })
  })
})
