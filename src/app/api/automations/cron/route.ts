import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { resumePendingExecution } from '@/lib/automations/engine'
import type { AutomationContext } from '@/lib/automations/engine'
import { processDueFollowUps } from '@/lib/deals/cron'

/**
 * Drain due `automation_pending_executions` rows. Meant to be hit
 * on a schedule (Vercel Cron / external pinger) — requires a shared
 * secret via the `x-cron-secret` header to match
 * `AUTOMATION_CRON_SECRET`.
 *
 * The claim step (status = 'running') serves as a simple lock so
 * overlapping invocations don't double-process rows. Best-effort
 * only; expensive SELECT ... FOR UPDATE is avoided in favor of a
 * two-step UPDATE-by-id.
 */
export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }
  const supplied = request.headers.get('x-cron-secret') ?? ''
  const suppliedBuf = Buffer.from(supplied)
  const expectedBuf = Buffer.from(expected)
  if (
    suppliedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(suppliedBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = supabaseAdmin()
  const { data: due, error } = await admin
    .from('automation_pending_executions')
    .select('*')
    .eq('status', 'pending')
    .lte('run_at', new Date().toISOString())
    .order('run_at', { ascending: true })
    .limit(50)

  let automationsProcessed = 0
  if (error) {
    console.error('[cron] automations fetch error:', error.message)
  } else if (due && due.length > 0) {
    for (const row of due) {
      try {
        const { data: claim } = await admin
          .from('automation_pending_executions')
          .update({ status: 'running' })
          .eq('id', row.id)
          .eq('status', 'pending')
          .select('id')
          .maybeSingle()
        if (!claim) continue

        await resumePendingExecution({
          id: row.id as string,
          automation_id: row.automation_id as string,
          account_id: row.account_id as string,
          user_id: row.user_id as string,
          contact_id: (row.contact_id as string | null) ?? null,
          log_id: (row.log_id as string | null) ?? null,
          parent_step_id: (row.parent_step_id as string | null) ?? null,
          branch: (row.branch as 'yes' | 'no' | null) ?? null,
          next_step_position: row.next_step_position as number,
          context: (row.context as AutomationContext) ?? {},
        })
        automationsProcessed++
      } catch (err) {
        console.error(`[cron] error processing automation ${row.id}:`, err)
      }
    }
  }

  // Also process due Nurture follow-up reminders
  let followupsProcessed = 0
  try {
    const res = await processDueFollowUps(admin)
    followupsProcessed = res.processed
  } catch (err) {
    console.error('[cron] error processing follow-ups:', err)
  }

  return NextResponse.json({ 
    automations_processed: automationsProcessed,
    followups_processed: followupsProcessed
  })
}
