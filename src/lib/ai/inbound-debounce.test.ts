import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { deferAiDispatch } from './inbound-debounce'

function harness() {
  let latestVersion = 0
  let claimedVersion = 0
  let now = Date.now()
  const deferred: Array<() => Promise<void>> = []
  const waits: number[] = []

  const db = {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'schedule_ai_reply_dispatch') {
        latestVersion += 1
        now += Number(args.debounce_milliseconds)
        return {
          data: { version: latestVersion, due_at: new Date(now).toISOString() },
          error: null,
        }
      }
      if (name === 'claim_ai_reply_dispatch') {
        const expected = Number(args.expected_version)
        const claimed = expected === latestVersion && claimedVersion < expected
        if (claimed) claimedVersion = expected
        return { data: claimed, error: null }
      }
      throw new Error(`unexpected RPC: ${name}`)
    }),
  } as unknown as SupabaseClient

  return {
    db,
    deferred,
    waits,
    defer: (work: () => Promise<void>) => deferred.push(work),
    sleep: async (milliseconds: number) => {
      waits.push(milliseconds)
    },
  }
}

describe('durable inbound AI debounce', () => {
  it('combines three inbounds into one dispatch and prevents racing sends', async () => {
    const h = harness()
    const dispatch = vi.fn(async () => undefined)

    for (let i = 0; i < 3; i += 1) {
      await deferAiDispatch({
        db: h.db,
        conversationId: 'conv-1',
        defer: h.defer,
        dispatch,
        debounceMs: 8_000,
        sleep: h.sleep,
      })
    }

    await Promise.all(h.deferred.map((work) => work()))
    expect(dispatch).toHaveBeenCalledOnce()
  })

  it('extends the due time when a second message arrives', async () => {
    const h = harness()
    const dispatch = vi.fn(async () => undefined)
    const first = await deferAiDispatch({
      db: h.db,
      conversationId: 'conv-1',
      defer: h.defer,
      dispatch,
      debounceMs: 8_000,
      sleep: h.sleep,
    })
    const second = await deferAiDispatch({
      db: h.db,
      conversationId: 'conv-1',
      defer: h.defer,
      dispatch,
      debounceMs: 8_000,
      sleep: h.sleep,
    })

    expect(new Date(second!.dueAt).getTime()).toBeGreaterThan(
      new Date(first!.dueAt).getTime(),
    )
    await h.deferred[0]()
    expect(dispatch).not.toHaveBeenCalled()
    await h.deferred[1]()
    expect(dispatch).toHaveBeenCalledOnce()
  })

  it('creates a separate response for a message after the previous debounce dispatched', async () => {
    const h = harness()
    const dispatch = vi.fn(async () => undefined)
    await deferAiDispatch({
      db: h.db,
      conversationId: 'conv-1',
      defer: h.defer,
      dispatch,
      sleep: h.sleep,
    })
    await h.deferred[0]()

    await deferAiDispatch({
      db: h.db,
      conversationId: 'conv-1',
      defer: h.defer,
      dispatch,
      sleep: h.sleep,
    })
    await h.deferred[1]()
    expect(dispatch).toHaveBeenCalledTimes(2)
  })
})
