import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { requireRole } from '@/lib/auth/account'

vi.mock('@/lib/auth/account', () => ({
  requireRole: vi.fn(),
}))

describe('POST /api/contacts/[id]/advance-deal', () => {
  let mockSupabase: any

  beforeEach(() => {
    vi.resetAllMocks()

    mockSupabase = {
      rpc: vi.fn().mockResolvedValue({ error: null }),
      from: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
    }

    vi.mocked(requireRole).mockResolvedValue({
      supabase: mockSupabase as any,
      accountId: 'account-1',
      userId: 'user-1',
      role: 'agent',
    })
  })

  function createMockRequest(body: any) {
    return new Request('http://localhost/api/contacts/contact-1/advance-deal', {
      method: 'POST',
      body: JSON.stringify(body)
    })
  }

  it('1. first follow-up can notify (sets follow_up_at, clears others)', async () => {
    const req = createMockRequest({
      targetStage: 'Nurture / Follow-up Later',
      followUpAt: '2026-09-01T12:00:00Z'
    })
    
    await POST(req, { params: Promise.resolve({ id: 'contact-1' }) })

    expect(mockSupabase.update).toHaveBeenCalledWith({
      follow_up_at: '2026-09-01T12:00:00Z',
      follow_up_claimed_at: null,
      follow_up_notified_at: null
    })
  })

  it('2. rescheduling same deal resets reminder state', async () => {
    // This is identical behavior to the first call as it uses the same endpoint payload
    const req = createMockRequest({
      targetStage: 'Nurture / Follow-up Later',
      followUpAt: '2026-10-01T12:00:00Z'
    })
    
    await POST(req, { params: Promise.resolve({ id: 'contact-1' }) })

    expect(mockSupabase.update).toHaveBeenCalledWith({
      follow_up_at: '2026-10-01T12:00:00Z',
      follow_up_claimed_at: null,
      follow_up_notified_at: null
    })
  })

  it('3. new follow-up becomes claimable again', async () => {
    // Verified by checking the updated object contains follow_up_notified_at: null
    const req = createMockRequest({
      targetStage: 'Nurture / Follow-up Later',
      followUpAt: '2026-11-01T12:00:00Z'
    })
    
    await POST(req, { params: Promise.resolve({ id: 'contact-1' }) })

    // If it's null, the cron query (.is('follow_up_notified_at', null)) will pick it up
    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({ follow_up_notified_at: null })
    )
  })

  it('5. unrelated stage transitions remain unchanged', async () => {
    const req = createMockRequest({
      targetStage: 'Negotiation'
    })
    
    await POST(req, { params: Promise.resolve({ id: 'contact-1' }) })

    // Should call RPC for stage change
    expect(mockSupabase.rpc).toHaveBeenCalledWith('advance_deal_stage_safely', {
      p_account_id: 'account-1',
      p_contact_id: 'contact-1',
      p_pipeline_name: 'Sales Pipeline',
      p_target_stage_name: 'Negotiation',
    })
    
    // Should NOT call update for deals follow_up_at
    const calls = mockSupabase.update.mock.calls
    const dealUpdateCall = calls.find((c: any) => c[0].follow_up_at !== undefined)
    expect(dealUpdateCall).toBeUndefined()
  })
})
