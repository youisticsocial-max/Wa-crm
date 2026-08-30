import { describe, it, expect } from 'vitest'
import {
  hasDevanagari,
  devanagariToRomanHinglish,
  sanitizeReplyScript,
  formatWhatsAppMessage,
} from './sanitize'
import { buildBridgeMessage } from './handoff'

describe('sanitizeReplyScript', () => {
  it('converts Devanagari reply to Roman script when customer message is Roman Hinglish', () => {
    const customer = 'Hi, hume inventory aur billing ke liye custom ERP chahiye.'
    const aiReply = 'नमस्ते! आपको 3 यूजर्स के लिए कस्टम ERP मिलेगा।'
    const sanitized = sanitizeReplyScript(aiReply, customer)

    expect(hasDevanagari(sanitized)).toBe(false)
    expect(sanitized).toContain('Namaste')
    expect(sanitized).toContain('aapko')
  })

  it('keeps English replies as English when customer writes English', () => {
    const customer = 'Can you build a custom website for my store?'
    const aiReply = 'Yes, we can build a custom e-commerce store for you.'
    const sanitized = sanitizeReplyScript(aiReply, customer)

    expect(sanitized).toBe(aiReply)
    expect(hasDevanagari(sanitized)).toBe(false)
  })

  it('allows Devanagari characters when customer writes in Devanagari script', () => {
    const customer = 'नमस्ते, मुझे नया वेबसाइट बनवाना है।'
    const aiReply = 'नमस्ते! हम आपकी वेबसाइट बनाने में सहायता कर सकते हैं।'
    const sanitized = sanitizeReplyScript(aiReply, customer)

    expect(sanitized).toBe(aiReply)
    expect(hasDevanagari(sanitized)).toBe(true)
  })
})

describe('formatWhatsAppMessage', () => {
  it('formats multi-point replies with paragraph spacing and clean bullets', () => {
    const raw = 'Samajh gaya 👍\n• Timeline: 5 days\n• Budget: ₹1 lakh\nMain requirement team ko forward kar raha hoon.'
    const formatted = formatWhatsAppMessage(raw)

    expect(formatted).toContain('\n\n• Timeline: 5 days')
    expect(formatted).toContain('\n\nMain requirement team ko forward kar raha hoon.')
    const paragraphs = formatted.split('\n\n')
    expect(paragraphs.length).toBeGreaterThanOrEqual(3)
  })

  it('preserves double line breaks and trims extra trailing newlines', () => {
    const raw = 'Header\n\nBody line 1\nBody line 2\n\n\nFooter'
    const formatted = formatWhatsAppMessage(raw)

    expect(formatted).not.toContain('\n\n\n')
    expect(formatted).toContain('Header\n\nBody line 1')
  })
})

describe('buildBridgeMessage formatting', () => {
  it('formats handoff bridge message with paragraph spacing for Roman Hinglish', () => {
    const bridge = buildBridgeMessage([
      { role: 'user', content: 'Hi, hume inventory aur billing ke liye custom ERP chahiye 5 din me.' },
    ])

    expect(hasDevanagari(bridge)).toBe(false)
    expect(bridge).toContain('Samajh gaya 👍')
    expect(bridge).toContain('\n\n')
    const paragraphs = bridge.split('\n\n')
    expect(paragraphs.length).toBeGreaterThanOrEqual(3)
  })

  it('formats handoff bridge message in English when customer writes English', () => {
    const bridge = buildBridgeMessage([
      { role: 'user', content: 'I need a refund for my order.' },
    ])

    expect(hasDevanagari(bridge)).toBe(false)
    expect(bridge).toContain('Got it 👍')
    expect(bridge).toContain('\n\n')
    const paragraphs = bridge.split('\n\n')
    expect(paragraphs.length).toBeGreaterThanOrEqual(2)
  })
})
