import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const { id: contactId } = await params

    const body = await request.json().catch(() => ({}))
    const dismissOnly = body.dismiss === true

    if (!dismissOnly) {
      // Safely advance the deal stage
      const { error: rpcErr } = await supabase.rpc('advance_deal_stage_safely', {
        p_account_id: accountId,
        p_contact_id: contactId,
        p_pipeline_name: 'Sales Pipeline',
        p_target_stage_name: 'Negotiation',
      })

      if (rpcErr) {
        console.error('[contacts/advance-deal] RPC error:', rpcErr)
        return NextResponse.json(
          { error: 'Failed to advance deal stage' },
          { status: 500 },
        )
      }
    }

    // Clear the suggestion from the conversation
    await supabase
      .from('conversations')
      .update({ negotiation_suggestion: null })
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .eq('status', 'open')

    return NextResponse.json({ success: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
