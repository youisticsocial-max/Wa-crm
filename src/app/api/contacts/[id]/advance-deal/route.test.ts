import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import * as accountAuth from '@/lib/auth/account'

vi.mock('@/lib/auth/account', () => ({
  requireRole: vi.fn(),
  toErrorResponse: vi.fn((err) => new Response(JSON.stringify({ error: err.message }), { status: 500 }))
}))

describe('advance-deal API', () => {
  let supabaseMock: any

  beforeEach(() => {
    supabaseMock = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'deal-1' } }),
      update: vi.fn().mockReturnThis(),
      rpc: vi.fn().mockResolvedValue({ error: null }),
      then: function(resolve: any) { resolve({ error: null, data: [] }); }
    }

    vi.mocked(accountAuth.requireRole).mockResolvedValue({
      supabase: supabaseMock,
      accountId: 'account-1'
    } as any)
  })

  it('resolves active deal and calls resolve_deal_terminal_state for won', async () => {
    const req = new Request('http://localhost/api/contacts/contact-1/advance-deal', {
      method: 'POST',
      body: JSON.stringify({ status: 'won' })
    })

    const res = await POST(req, { params: Promise.resolve({ id: 'contact-1' }) })
    expect(res.status).toBe(200)

    expect(supabaseMock.rpc).toHaveBeenCalledWith('resolve_deal_terminal_state', {
      p_deal_id: 'deal-1',
      p_target_status: 'won'
    })
  })

  it('resolves active deal and calls resolve_deal_terminal_state for lost', async () => {
    const req = new Request('http://localhost/api/contacts/contact-1/advance-deal', {
      method: 'POST',
      body: JSON.stringify({ status: 'lost' })
    })

    const res = await POST(req, { params: Promise.resolve({ id: 'contact-1' }) })
    expect(res.status).toBe(200)

    expect(supabaseMock.rpc).toHaveBeenCalledWith('resolve_deal_terminal_state', {
      p_deal_id: 'deal-1',
      p_target_status: 'lost'
    })
  })

  it('safely advances deal stage when status is not provided', async () => {
    const req = new Request('http://localhost/api/contacts/contact-1/advance-deal', {
      method: 'POST',
      body: JSON.stringify({ targetStage: 'Proposal Sent' })
    })

    const res = await POST(req, { params: Promise.resolve({ id: 'contact-1' }) })
    expect(res.status).toBe(200)

    expect(supabaseMock.rpc).toHaveBeenCalledWith('advance_deal_stage_safely', {
      p_account_id: 'account-1',
      p_contact_id: 'contact-1',
      p_pipeline_name: 'Sales Pipeline',
      p_target_stage_name: 'Proposal Sent'
    })
  })
})
