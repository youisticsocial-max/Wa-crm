import { describe, it, expect } from 'vitest'
import { latestCustomerBurst, latestUserMessage } from './query'

describe('latestUserMessage', () => {
  it('returns the most recent user turn', () => {
    expect(
      latestUserMessage([
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'reply' },
        { role: 'user', content: 'latest' },
      ]),
    ).toBe('latest')
  })

  it('falls back to the last message when none are user', () => {
    expect(
      latestUserMessage([{ role: 'assistant', content: 'only assistant' }]),
    ).toBe('only assistant')
  })

  it('returns empty string for no messages', () => {
    expect(latestUserMessage([])).toBe('')
  })
})

describe('latestCustomerBurst', () => {
  it('keeps older history but isolates the latest consecutive customer intent', () => {
    const messages = [
      { role: 'user' as const, content: 'Mobile app banana hai, kya costing ayegi?' },
      { role: 'assistant' as const, content: 'Please share the app scope.' },
      { role: 'user' as const, content: 'Header blue karna hai.' },
      { role: 'user' as const, content: 'Delivery kitne din me hogi?' },
      { role: 'user' as const, content: 'Mere bete ko use karna sikhana hai.' },
    ]

    expect(latestCustomerBurst(messages)).toEqual([
      'Header blue karna hai.',
      'Delivery kitne din me hogi?',
      'Mere bete ko use karna sikhana hai.',
    ])
    expect(messages[0].content).toContain('Mobile app')
  })
})
