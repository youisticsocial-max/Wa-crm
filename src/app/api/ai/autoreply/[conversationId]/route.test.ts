import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  update: null as Record<string, unknown> | null,
  userId: 'agent-1',
}))

vi.mock('@/lib/auth/account', () => ({
  requireRole: vi.fn(async () => ({
    accountId: 'acct-1',
    userId: h.userId,
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: 'conv-1' }, error: null }),
            }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          h.update = payload
          return {
            eq: () => ({ eq: async () => ({ error: null }) }),
          }
        },
      }),
    },
  })),
  toErrorResponse: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: () => ({ success: true }),
  rateLimitResponse: vi.fn(),
  RATE_LIMITS: { send: { limit: 1, windowMs: 1 } },
}))

import { POST } from './route'

beforeEach(() => {
  h.update = null
})

async function post(body: Record<string, unknown>) {
  return POST(
    new Request('http://localhost/api/ai/autoreply/conv-1', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ conversationId: 'conv-1' }) },
  )
}

describe('Take Over / Resume AI', () => {
  it('Take Over pauses AI and assigns the acting human', async () => {
    const response = await post({ paused: true, assign_to_me: true })
    expect(response.status).toBe(200)
    expect(h.update).toEqual({
      ai_autoreply_disabled: true,
      assigned_agent_id: 'agent-1',
    })
  })

  it('Resume restores AI ownership and preserves the historical handoff brief', async () => {
    const response = await post({ paused: false })
    expect(response.status).toBe(200)
    expect(h.update).toEqual({
      ai_autoreply_disabled: false,
      assigned_agent_id: null,
      ai_reply_count: 0,
    })
    expect(h.update).not.toHaveProperty('ai_handoff_summary')
  })
})
