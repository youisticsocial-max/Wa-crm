import { describe, it, expect, vi } from 'vitest'
import { parseMessageContent } from './route'
// No WhatsAppMessage import

// Mock the getMediaUrl which is called inside verifyAndBuildUrl
vi.mock('@/lib/whatsapp/meta-api', () => ({
  getMediaUrl: vi.fn().mockResolvedValue('https://mock.meta/media'),
}))

describe('parseMessageContent', () => {
  it('parses normal text messages', async () => {
    const msg = { type: 'text', text: { body: 'hello' } } as any
    const res = await parseMessageContent(msg, 'token')
    expect(res.contentText).toBe('hello')
  })

  it('parses template quick reply buttons (type=button)', async () => {
    const msg = {
      type: 'button',
      button: { text: 'Yes, continue', payload: 'action_continue' },
    } as any

    const res = await parseMessageContent(msg, 'token')
    expect(res.contentText).toBe('Yes, continue')
    expect(res.interactiveReplyId).toBe('action_continue')
  })

  it('preserves interactive.button_reply', async () => {
    const msg = {
      type: 'interactive',
      interactive: { button_reply: { id: 'btn_1', title: 'Buy Now' } },
    } as any

    const res = await parseMessageContent(msg, 'token')
    expect(res.contentText).toBe('Buy Now')
    expect(res.interactiveReplyId).toBe('btn_1')
  })

  it('preserves interactive.list_reply', async () => {
    const msg = {
      type: 'interactive',
      interactive: { list_reply: { id: 'list_1', title: 'Option A', description: 'Desc A' } },
    } as any

    const res = await parseMessageContent(msg, 'token')
    expect(res.contentText).toBe('Option A')
    expect(res.interactiveReplyId).toBe('list_1')
  })

  it('returns [Unsupported message type: unknown] for unknown types', async () => {
    const msg = { type: 'unknown_type' } as any
    const res = await parseMessageContent(msg, 'token')
    expect(res.contentText).toBe('[Unsupported message type: unknown_type]')
  })
})
