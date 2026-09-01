import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { resumePendingExecution } from '@/lib/automations/engine'
import { processDueFollowUps } from '@/lib/deals/cron'

vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: vi.fn(),
}))

vi.mock('@/lib/automations/engine', () => ({
  resumePendingExecution: vi.fn(),
}))

vi.mock('@/lib/deals/cron', () => ({
  processDueFollowUps: vi.fn(),
}))

describe('GET /api/automations/cron', () => {
  let mockAdmin: any

  beforeEach(() => {
    vi.resetAllMocks()
    process.env.AUTOMATION_CRON_SECRET = 'test-secret'

    mockAdmin = {
      from: vi.fn(),
    }
    vi.mocked(supabaseAdmin).mockReturnValue(mockAdmin)
    vi.mocked(processDueFollowUps).mockResolvedValue({ processed: 0 })
    vi.mocked(resumePendingExecution).mockResolvedValue(undefined as any)
  })

  function createMockRequest(secret = 'test-secret') {
    return new Request('http://localhost/api/automations/cron', {
      headers: { 'x-cron-secret': secret }
    })
  }

  function mockAutomations(rows: any[], error: any = null) {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: rows, error }),
      update: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'some-id' }, error: null }),
    }
    mockAdmin.from.mockReturnValue(chain)
  }

  it('1. no due automations + due follow-up => follow-up STILL processes', async () => {
    mockAutomations([])
    vi.mocked(processDueFollowUps).mockResolvedValue({ processed: 2 })

    const req = createMockRequest()
    const res = await GET(req)
    const json = await res.json()

    expect(json).toEqual({
      automations_processed: 0,
      followups_processed: 2,
    })
    expect(processDueFollowUps).toHaveBeenCalled()
    expect(resumePendingExecution).not.toHaveBeenCalled()
  })

  it('2. due automations + due follow-up => both process', async () => {
    mockAutomations([{ id: 'a1', automation_id: 'auto1' }])
    vi.mocked(processDueFollowUps).mockResolvedValue({ processed: 1 })

    const req = createMockRequest()
    const res = await GET(req)
    const json = await res.json()

    expect(json).toEqual({
      automations_processed: 1,
      followups_processed: 1,
    })
    expect(processDueFollowUps).toHaveBeenCalled()
    expect(resumePendingExecution).toHaveBeenCalled()
  })

  it('3. no due automations + no follow-up => clean zero result', async () => {
    mockAutomations([])
    vi.mocked(processDueFollowUps).mockResolvedValue({ processed: 0 })

    const req = createMockRequest()
    const res = await GET(req)
    const json = await res.json()

    expect(json).toEqual({
      automations_processed: 0,
      followups_processed: 0,
    })
  })

  it('4. automation processing error => follow-up still attempted', async () => {
    mockAutomations([{ id: 'a1', automation_id: 'auto1' }])
    vi.mocked(resumePendingExecution).mockRejectedValue(new Error('auto error'))
    vi.mocked(processDueFollowUps).mockResolvedValue({ processed: 1 })

    const req = createMockRequest()
    const res = await GET(req)
    const json = await res.json()

    expect(json).toEqual({
      automations_processed: 0, // failed
      followups_processed: 1,
    })
    expect(processDueFollowUps).toHaveBeenCalled()
  })

  it('5. follow-up processing error => automation result preserved', async () => {
    mockAutomations([{ id: 'a1', automation_id: 'auto1' }])
    vi.mocked(processDueFollowUps).mockRejectedValue(new Error('followup error'))

    const req = createMockRequest()
    const res = await GET(req)
    const json = await res.json()

    expect(json).toEqual({
      automations_processed: 1,
      followups_processed: 0, // failed
    })
    expect(resumePendingExecution).toHaveBeenCalled()
  })

  it('6. auth failure blocks both', async () => {
    const req = createMockRequest('wrong-secret')
    const res = await GET(req)

    expect(res.status).toBe(401)
    expect(processDueFollowUps).not.toHaveBeenCalled()
    expect(mockAdmin.from).not.toHaveBeenCalled()
  })
})
