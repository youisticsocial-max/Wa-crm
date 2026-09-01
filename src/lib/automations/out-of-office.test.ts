import { describe, expect, it, vi, afterEach } from 'vitest'
import { triggerMatches } from './engine'
import type { Automation, OutOfOfficeTriggerConfig } from '@/types'

describe('Out of Office Automations', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('matches when outside business hours (late night)', () => {
    vi.useFakeTimers()
    // Wednesday 2026-09-02 23:00:00 UTC
    vi.setSystemTime(new Date('2026-09-02T23:00:00Z'))

    const config: OutOfOfficeTriggerConfig = {
      timezone: 'UTC',
      working_days: [1, 2, 3, 4, 5],
      start_time: '09:00',
      end_time: '17:00'
    }

    const automation = {
      id: 'a1',
      trigger_type: 'out_of_office',
      trigger_config: config
    } as Automation

    // It is 23:00, which is >= 17:00, so it SHOULD match (trigger OOO)
    expect(triggerMatches(automation, {})).toBe(true)
  })

  it('matches when outside business days (weekend)', () => {
    vi.useFakeTimers()
    // Saturday 2026-09-05 12:00:00 UTC
    vi.setSystemTime(new Date('2026-09-05T12:00:00Z'))

    const config: OutOfOfficeTriggerConfig = {
      timezone: 'UTC',
      working_days: [1, 2, 3, 4, 5],
      start_time: '09:00',
      end_time: '17:00'
    }
    const automation = { trigger_type: 'out_of_office', trigger_config: config } as Automation

    // It is Saturday, so it SHOULD match
    expect(triggerMatches(automation, {})).toBe(true)
  })

  it('does NOT match during business hours', () => {
    vi.useFakeTimers()
    // Wednesday 2026-09-02 12:00:00 UTC
    vi.setSystemTime(new Date('2026-09-02T12:00:00Z'))

    const config: OutOfOfficeTriggerConfig = {
      timezone: 'UTC',
      working_days: [1, 2, 3, 4, 5],
      start_time: '09:00',
      end_time: '17:00'
    }
    const automation = { trigger_type: 'out_of_office', trigger_config: config } as Automation

    expect(triggerMatches(automation, {})).toBe(false)
  })

  it('suppresses trigger if cooldown is active', () => {
    vi.useFakeTimers()
    // Wednesday 2026-09-02 23:00:00 UTC (Outside hours)
    vi.setSystemTime(new Date('2026-09-02T23:00:00Z'))

    const config: OutOfOfficeTriggerConfig = {
      timezone: 'UTC',
      working_days: [1, 2, 3, 4, 5],
      start_time: '09:00',
      end_time: '17:00'
    }
    const automation = { trigger_type: 'out_of_office', trigger_config: config } as Automation

    // Sent 2 hours ago
    const ctx1 = { last_ooo_sent_at: new Date('2026-09-02T21:00:00Z').toISOString() }
    expect(triggerMatches(automation, ctx1)).toBe(false) // Cooldown active

    // Sent 13 hours ago
    const ctx2 = { last_ooo_sent_at: new Date('2026-09-02T10:00:00Z').toISOString() }
    expect(triggerMatches(automation, ctx2)).toBe(true) // Cooldown expired
  })
})
