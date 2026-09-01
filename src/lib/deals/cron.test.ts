import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processDueFollowUps } from './cron'

describe('processDueFollowUps', () => {
  let mockDb: any

  beforeEach(() => {
    mockDb = {
      from: vi.fn(),
      rpc: vi.fn()
    }
  })

  it('claims due reminders, calls RPC, and handles Push notification', async () => {
    const mockDeals = [{
      id: 'deal-1',
      account_id: 'account-1',
      contact_id: 'contact-1',
      contacts: { name: 'Alice' },
      conversation_id: 'conv-1'
    }]

    const selectChain: any = {
      select: vi.fn().mockImplementation(() => selectChain),
      eq: vi.fn().mockImplementation(() => selectChain),
      lte: vi.fn().mockImplementation(() => selectChain),
      is: vi.fn().mockImplementation(() => selectChain),
      or: vi.fn().mockImplementation(() => selectChain),
      limit: vi.fn().mockResolvedValue({ data: mockDeals, error: null })
    }

    // 2. UPDATE claim returns success
    const updateChain: any = {
      update: vi.fn().mockImplementation(() => updateChain),
      eq: vi.fn().mockImplementation(() => updateChain),
      is: vi.fn().mockImplementation(() => updateChain),
      select: vi.fn().mockImplementation(() => updateChain),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'deal-1' }, error: null })
    }

    // fallback select for conversation resolution
    const convSelectChain: any = {
      select: vi.fn().mockImplementation(() => convSelectChain),
      eq: vi.fn().mockImplementation(() => convSelectChain),
      order: vi.fn().mockImplementation(() => convSelectChain),
      limit: vi.fn().mockImplementation(() => convSelectChain),
      maybeSingle: vi.fn().mockResolvedValue({ data: { assigned_agent_id: 'agent-1' }, error: null })
    }

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'deals') {
        // Return updateChain if update was called, else selectChain
        return {
          select: selectChain.select,
          update: updateChain.update
        }
      }
      if (table === 'conversations') {
        return convSelectChain
      }
    })

    // 3. RPC succeeds
    mockDb.rpc.mockResolvedValue({ data: true, error: null })

    const result = await processDueFollowUps(mockDb)

    expect(result.processed).toBe(1)
    expect(mockDb.rpc).toHaveBeenCalledWith('process_due_follow_up', { p_deal_id: 'deal-1' })
  })

  it('skips deals that fail to be claimed', async () => {
    const mockDeals = [{ id: 'deal-1' }]

    const selectChain: any = {
      select: vi.fn().mockImplementation(() => selectChain),
      eq: vi.fn().mockImplementation(() => selectChain),
      lte: vi.fn().mockImplementation(() => selectChain),
      is: vi.fn().mockImplementation(() => selectChain),
      or: vi.fn().mockImplementation(() => selectChain),
      limit: vi.fn().mockResolvedValue({ data: mockDeals, error: null })
    }
    const updateChain: any = {
      update: vi.fn().mockImplementation(() => updateChain),
      eq: vi.fn().mockImplementation(() => updateChain),
      is: vi.fn().mockImplementation(() => updateChain),
      select: vi.fn().mockImplementation(() => updateChain),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) // Claim failed!
    }

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'deals') {
        return {
          select: selectChain.select,
          update: updateChain.update
        }
      }
    })

    const result = await processDueFollowUps(mockDb)

    expect(result.processed).toBe(0)
    expect(mockDb.rpc).not.toHaveBeenCalled()
  })

  it('skips deals if the atomic RPC fails', async () => {
    const mockDeals = [{ id: 'deal-1' }]

    const selectChain: any = {
      select: vi.fn().mockImplementation(() => selectChain),
      eq: vi.fn().mockImplementation(() => selectChain),
      lte: vi.fn().mockImplementation(() => selectChain),
      is: vi.fn().mockImplementation(() => selectChain),
      or: vi.fn().mockImplementation(() => selectChain),
      limit: vi.fn().mockResolvedValue({ data: mockDeals, error: null })
    }
    const updateChain: any = {
      update: vi.fn().mockImplementation(() => updateChain),
      eq: vi.fn().mockImplementation(() => updateChain),
      is: vi.fn().mockImplementation(() => updateChain),
      select: vi.fn().mockImplementation(() => updateChain),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'deal-1' }, error: null })
    }

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'deals') {
        return {
          select: selectChain.select,
          update: updateChain.update
        }
      }
    })

    // RPC returns false indicating it was already processed or no longer due
    mockDb.rpc.mockResolvedValue({ data: false, error: null })

    const result = await processDueFollowUps(mockDb)

    // processed is 0 because the push notification phase was skipped
    expect(result.processed).toBe(0)
    expect(mockDb.rpc).toHaveBeenCalled()
  })
})
