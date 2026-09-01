import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const { id: contactId } = await params

    const body = await request.json().catch(() => ({}))
    const dismissOnly = body.dismiss === true
    const dismissTarget = body.dismissTarget // 'negotiation' | 'nurture' | undefined
    const targetStage = body.targetStage || 'Negotiation'
    const followUpAt = body.followUpAt

    if (!dismissOnly) {
      // Safely advance the deal stage
      const { error: rpcErr } = await supabase.rpc('advance_deal_stage_safely', {
        p_account_id: accountId,
        p_contact_id: contactId,
        p_pipeline_name: 'Sales Pipeline',
        p_target_stage_name: targetStage,
      })

      if (rpcErr) {
        console.error('[contacts/advance-deal] RPC error:', rpcErr)
        return NextResponse.json(
          { error: 'Failed to advance deal stage' },
          { status: 500 },
        )
      }

      if (targetStage === 'Nurture / Follow-up Later' && followUpAt) {
        const { error: updateErr } = await supabase
          .from('deals')
          .update({ follow_up_at: followUpAt })
          .eq('account_id', accountId)
          .eq('contact_id', contactId)
          .eq('status', 'open')

        if (updateErr) {
          console.error('[contacts/advance-deal] failed to set follow_up_at:', updateErr)
        }
      }
    }

    // Clear the suggestion from the conversation
    const updatePayload: Record<string, any> = {}
    if (dismissTarget === 'nurture' || targetStage === 'Nurture / Follow-up Later') {
      updatePayload.nurture_suggestion = null
    } else if (dismissTarget === 'negotiation' || targetStage === 'Negotiation') {
      updatePayload.negotiation_suggestion = null
    } else {
      updatePayload.negotiation_suggestion = null
      updatePayload.nurture_suggestion = null
    }

    await supabase
      .from('conversations')
      .update(updatePayload)
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .eq('status', 'open')

    return NextResponse.json({ success: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}

