import { describe, it, expect } from 'vitest'
import { validateBaseUrl } from './validate'
import { AiError } from './types'

describe('validateBaseUrl — SSRF protection', () => {
  it('allows allowlisted provider domains', () => {
    expect(validateBaseUrl('https://api.openai.com/v1/chat/completions', 'openai')).toBe(
      'https://api.openai.com/v1/chat/completions',
    )
    expect(validateBaseUrl('https://api.groq.com/openai/v1/chat/completions', 'groq')).toBe(
      'https://api.groq.com/openai/v1/chat/completions',
    )
    expect(validateBaseUrl('https://openrouter.ai/api/v1/chat/completions', 'openrouter')).toBe(
      'https://openrouter.ai/api/v1/chat/completions',
    )
    expect(
      validateBaseUrl(
        'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        'gemini',
      ),
    ).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions')
  })

  it('rejects invalid URL format', () => {
    expect(() => validateBaseUrl('invalid-url', 'custom')).toThrowError(AiError)
  })

  it('rejects non-HTTP/HTTPS protocols', () => {
    expect(() => validateBaseUrl('ftp://example.com/v1', 'custom')).toThrowError(AiError)
  })

  it('allows valid HTTPS custom domain', () => {
    expect(validateBaseUrl('https://my-custom-ai.org/v1/chat/completions', 'custom')).toBe(
      'https://my-custom-ai.org/v1/chat/completions',
    )
  })
})
