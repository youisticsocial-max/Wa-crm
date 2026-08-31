import type { SupabaseClient } from '@supabase/supabase-js'

export const AI_INBOUND_DEBOUNCE_MS = 8_000
const DATABASE_CLOCK_GRACE_MS = 100

export interface ScheduledAiDispatch {
  version: number
  dueAt: string
}

export type DeferWork = (work: () => Promise<void>) => void

interface ScheduleRow {
  version?: number | string
  due_at?: string
}

export async function scheduleAiDispatch(
  db: SupabaseClient,
  conversationId: string,
  debounceMs: number = AI_INBOUND_DEBOUNCE_MS,
): Promise<ScheduledAiDispatch | null> {
  const { data, error } = await db.rpc('schedule_ai_reply_dispatch', {
    target_conversation_id: conversationId,
    debounce_milliseconds: debounceMs,
  })
  if (error) throw error

  const row = data as ScheduleRow | null
  const version = Number(row?.version)
  if (!row?.due_at || !Number.isSafeInteger(version) || version < 1) return null
  return { version, dueAt: row.due_at }
}

export async function claimAiDispatch(
  db: SupabaseClient,
  conversationId: string,
  version: number,
): Promise<boolean> {
  const { data, error } = await db.rpc('claim_ai_reply_dispatch', {
    target_conversation_id: conversationId,
    expected_version: version,
  })
  if (error) throw error
  return data === true
}

export async function cancelAiDispatch(
  db: SupabaseClient,
  conversationId: string,
): Promise<void> {
  const { error } = await db.rpc('cancel_ai_reply_dispatch', {
    target_conversation_id: conversationId,
  })
  if (error) throw error
}

export async function waitUntilDue(
  dueAt: string,
  sleep: (milliseconds: number) => Promise<void> = defaultSleep,
): Promise<void> {
  const remaining = Math.max(0, new Date(dueAt).getTime() - Date.now())
  if (remaining > 0) await sleep(remaining + DATABASE_CLOCK_GRACE_MS)
}

/**
 * Schedule one durable debounce generation and register its waiter with
 * the host runtime. Superseded waiters still wake up, but the atomic DB
 * claim makes them no-ops; only the latest generation runs `dispatch`.
 */
export async function deferAiDispatch(args: {
  db: SupabaseClient
  conversationId: string
  defer: DeferWork
  dispatch: () => Promise<void>
  debounceMs?: number
  sleep?: (milliseconds: number) => Promise<void>
}): Promise<ScheduledAiDispatch | null> {
  const scheduled = await scheduleAiDispatch(
    args.db,
    args.conversationId,
    args.debounceMs,
  )
  if (!scheduled) return null

  args.defer(async () => {
    await waitUntilDue(scheduled.dueAt, args.sleep)
    if (!(await claimAiDispatch(args.db, args.conversationId, scheduled.version))) {
      return
    }
    await args.dispatch()
  })

  return scheduled
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
