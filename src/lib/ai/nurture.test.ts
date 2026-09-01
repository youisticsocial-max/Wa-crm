
describe('dispatchInboundToAiReply — nurture detection', () => {
  it('Qualified stage + genuine deferral => nurture_suggestion created', async () => {
    h.state.conv = { assigned_agent_id: null, ai_autoreply_disabled: false, ai_reply_count: 0 }
    h.state.rpcCalls = []
    // stage is Qualified
    h.state.conv.stage = { name: 'Qualified' }
    
    // We need to mock the active deal in the db response.
    // The query is `from('deals').select(...)`. 
    // In our mock, `maybeSingle` resolves to `h.state.conv`.
    // So if we set `h.state.conv.stage.name = 'Qualified'`, it thinks it's a Qualified deal.
    
    h.classifyNurture.mockResolvedValue({
      nurture_detected: true,
      reason: 'User asked to contact next month',
      raw_follow_up_phrase: 'next month',
      confidence: 0.95
    })

    await dispatchInboundToAiReply(ARGS)

    expect(h.classifyNurture).toHaveBeenCalled()
    expect(h.state.updatePayload).toMatchObject({
      nurture_suggestion: {
        detected: true,
        reason: 'User asked to contact next month',
        raw_follow_up_phrase: 'next month',
        confidence: 0.95,
      }
    })
  })

  it('New Lead stage => classifier not run', async () => {
    h.state.conv = { assigned_agent_id: null, ai_autoreply_disabled: false, ai_reply_count: 0, stage: { name: 'New Lead' } }
    
    await dispatchInboundToAiReply(ARGS)

    expect(h.classifyNurture).not.toHaveBeenCalled()
  })

  it('Proposal Sent stage + negotiation takes precedence over nurture', async () => {
    h.state.conv = { assigned_agent_id: null, ai_autoreply_disabled: false, ai_reply_count: 0, stage: { name: 'Proposal Sent' } }
    
    h.classifyNegotiation.mockResolvedValue({
      negotiation_detected: true,
      reason: 'Negotiation',
      confidence: 0.9
    })
    
    await dispatchInboundToAiReply(ARGS)

    expect(h.classifyNegotiation).toHaveBeenCalled()
    expect(h.classifyNurture).not.toHaveBeenCalled()
    expect(h.state.updatePayload).toMatchObject({
      negotiation_suggestion: { detected: true }
    })
  })

  it('early reply clears follow_up_at', async () => {
    h.state.dealsUpdatePayload = null
    await dispatchInboundToAiReply(ARGS)
    
    expect(h.state.dealsUpdatePayload).toMatchObject({
      follow_up_at: null
    })
  })
})
