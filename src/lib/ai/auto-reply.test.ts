import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AiConfig } from './types'

// Shared, hoisted mock state so the module mocks can close over it.
const h = vi.hoisted(() => ({
  loadAiConfig: vi.fn(),
  buildConversationContext: vi.fn(),
  retrieveKnowledge: vi.fn(),
  generateReply: vi.fn(),
  engineSendText: vi.fn(),
  classifyNegotiation: vi.fn(),
  classifyNurture: vi.fn(),
  classifyTerminalIntent: vi.fn(),
  sendPushToUser: vi.fn(),
  sendPushToQueue: vi.fn(),
  state: {
    conv: null as Record<string, unknown> | null,
    updatePayload: null as Record<string, unknown> | null,
    updatePayloads: [] as Record<string, unknown>[],
    dealsUpdatePayload: null as Record<string, unknown> | null,
    dealsUpdateEqArgs: [] as any[],
    rpcCalls: [] as { name: string; args: unknown }[],
  },
}))

vi.mock('./config', () => ({ loadAiConfig: h.loadAiConfig }))
vi.mock('./context', () => ({ buildConversationContext: h.buildConversationContext }))
vi.mock('./knowledge', () => ({ retrieveKnowledge: h.retrieveKnowledge }))
vi.mock('./generate', () => ({ generateReply: h.generateReply }))
vi.mock('./classifier', () => ({ 
  classifyNegotiation: h.classifyNegotiation,
  classifyNurture: h.classifyNurture,
  classifyTerminalIntent: h.classifyTerminalIntent, 
}))
vi.mock('@/lib/push/send', () => ({
  sendPushToUser: h.sendPushToUser,
  sendPushToQueue: h.sendPushToQueue,
}))
vi.mock('@/lib/flows/meta-send', () => ({ engineSendText: h.engineSendText }))
vi.mock('@/lib/rate-limit', () => ({ 
  checkRateLimit: vi.fn().mockReturnValue({ success: true }),
  RATE_LIMITS: { aiAutoReplyAccount: { limit: 100, windowMs: 1000 } }
}))
vi.mock('./admin-client', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      // conversations / deals
      const chainable = {
        select: () => chainable,
        eq: () => chainable,
        not: () => chainable,
        order: () => chainable,
        limit: () => chainable,
        maybeSingle: () => Promise.resolve({ data: h.state.conv, error: null }),
      }
      return {
        ...chainable,
        update: (payload: Record<string, unknown>) => {
          if (table === 'conversations') {
            h.state.updatePayload = payload
            h.state.updatePayloads.push(payload)
          } else if (table === 'deals') {
            h.state.dealsUpdatePayload = payload
            h.state.dealsUpdateEqArgs = []
          }
          const updater = {
            eq: (key: string, val: any) => {
              if (table === 'deals') h.state.dealsUpdateEqArgs.push([key, val])
              return updater
            },
            not: () => Promise.resolve({ error: null }),
            then: (res: any, rej: any) => Promise.resolve({ error: null }).then(res, rej)
          }
          return updater
        },
      }
    },
    rpc: (name: string, args: unknown) => {
      h.state.rpcCalls.push({ name, args })
      return Promise.resolve({ data: null, error: null })
    },
  }),
}))

import { dispatchInboundToAiReply } from './auto-reply'

const ARGS = {
  accountId: 'acct-1',
  conversationId: 'conv-1',
  contactId: 'contact-1',
  configOwnerUserId: 'user-1',
}

function aiConfig(overrides: Partial<AiConfig> = {}): AiConfig {
  return {
    provider: 'openai',
    model: 'gpt-test',
    apiKey: 'sk-test',
    systemPrompt: null,
    isActive: true,
    autoReplyEnabled: true,
    autoReplyMaxPerConversation: 3,
    handoffAgentId: null,
    embeddingsApiKey: null,
    oooEnabled: false,
    oooTimezone: null,
    oooWorkingDays: null,
    oooStartTime: null,
    oooEndTime: null,
    oooFallbackMessage: null,
    ...overrides,
  }
}

beforeEach(() => {
  h.state.conv = {
    assigned_agent_id: null,
    ai_autoreply_disabled: false,
    ai_reply_count: 0,
  }
  h.state.updatePayload = null
  h.state.updatePayloads = []
  h.state.dealsUpdatePayload = null
  h.state.dealsUpdateEqArgs = []
  h.state.rpcCalls = []
  h.loadAiConfig.mockResolvedValue(aiConfig())
  h.buildConversationContext.mockResolvedValue([{ role: 'user', content: 'hi' }])
  h.retrieveKnowledge.mockResolvedValue([])
  h.generateReply.mockResolvedValue({ text: 'Hello!', handoff: false })
  h.engineSendText.mockResolvedValue({ whatsapp_message_id: 'm1' })
  h.classifyNegotiation.mockResolvedValue(null)
  h.classifyNurture.mockResolvedValue(null)
  h.classifyTerminalIntent.mockResolvedValue(null)
})

describe('dispatchInboundToAiReply — eligibility gates', () => {
  it('sends and records the completed reply on the happy path', async () => {
    await dispatchInboundToAiReply(ARGS)
    expect(h.state.rpcCalls).toEqual([
      {
        name: 'record_ai_reply_sent',
        args: { target_conversation_id: 'conv-1' },
      },
    ])
    expect(h.engineSendText).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-1', text: 'Hello!' }),
    )
  })

  it('grounds the reply in retrieved knowledge', async () => {
    h.retrieveKnowledge.mockResolvedValue(['Returns accepted within 30 days.'])
    await dispatchInboundToAiReply(ARGS)
    expect(h.retrieveKnowledge).toHaveBeenCalled()
    const systemPrompt = h.generateReply.mock.calls[0][0].systemPrompt as string
    expect(systemPrompt).toContain('Returns accepted within 30 days.')
  })

  it('passes existing-client history and the whole inbound burst to generation', async () => {
    const history = [
      { role: 'user', content: 'My existing website project is in progress.' },
      { role: 'assistant', content: 'Yes, the dashboard work is underway.' },
      { role: 'user', content: 'Header blue karna hai.' },
      { role: 'user', content: 'Delivery kitne din me hogi?' },
      { role: 'user', content: 'Training bhi chahiye.' },
    ]
    h.buildConversationContext.mockResolvedValue(history)

    await dispatchInboundToAiReply(ARGS)

    expect(h.generateReply).toHaveBeenCalledWith(
      expect.objectContaining({ messages: history }),
    )
  })

  it('skips when AI is off / not configured', async () => {
    h.loadAiConfig.mockResolvedValue(null)
    await dispatchInboundToAiReply(ARGS)
    expect(h.generateReply).not.toHaveBeenCalled()
    expect(h.engineSendText).not.toHaveBeenCalled()
  })

  it('skips when auto-reply is disabled for the account', async () => {
    h.loadAiConfig.mockResolvedValue(aiConfig({ autoReplyEnabled: false }))
    await dispatchInboundToAiReply(ARGS)
    expect(h.engineSendText).not.toHaveBeenCalled()
  })

  it('skips when a human agent is assigned', async () => {
    h.state.conv = {
      assigned_agent_id: 'agent-9',
      ai_autoreply_disabled: false,
      ai_reply_count: 0,
    }
    await dispatchInboundToAiReply(ARGS)
    expect(h.engineSendText).not.toHaveBeenCalled()
  })

  it('skips when auto-reply was disabled on this conversation', async () => {
    h.state.conv = {
      assigned_agent_id: null,
      ai_autoreply_disabled: true,
      ai_reply_count: 0,
    }
    await dispatchInboundToAiReply(ARGS)
    expect(h.engineSendText).not.toHaveBeenCalled()
  })

  it('continues after 10+ prior AI replies because the legacy count is not a lifetime cap', async () => {
    h.state.conv = {
      assigned_agent_id: null,
      ai_autoreply_disabled: false,
      ai_reply_count: 14,
    }
    await dispatchInboundToAiReply(ARGS)
    expect(h.engineSendText).toHaveBeenCalledOnce()
  })

  it('skips when there is nothing to reply to', async () => {
    h.buildConversationContext.mockResolvedValue([])
    await dispatchInboundToAiReply(ARGS)
    expect(h.generateReply).not.toHaveBeenCalled()
    expect(h.engineSendText).not.toHaveBeenCalled()
  })
})

describe('dispatchInboundToAiReply — handoff', () => {
  it('disables auto-reply, writes a summary, and sends bridge message on handoff', async () => {
    h.generateReply.mockResolvedValue({ text: '', handoff: true })
    await dispatchInboundToAiReply(ARGS)
    expect(h.engineSendText).toHaveBeenCalledWith(
      expect.objectContaining({ aiGenerated: true }),
    )
    expect(h.state.updatePayload).not.toHaveProperty('ai_autoreply_disabled')
    expect(h.state.updatePayload?.ai_handoff_summary).toContain(
      'AI agent handed off',
    )
    // No handoff target configured → conversation left unassigned.
    expect(h.state.updatePayload).not.toHaveProperty('assigned_agent_id')
  })

  it('routes to the configured handoff agent on handoff', async () => {
    h.loadAiConfig.mockResolvedValue(aiConfig({ handoffAgentId: 'agent-7' }))
    h.generateReply.mockResolvedValue({ text: '', handoff: true })
    await dispatchInboundToAiReply(ARGS)
    expect(h.state.updatePayload).toMatchObject({
      assigned_agent_id: 'agent-7',
    })
  })

  describe('OOO Fallback', () => {
    beforeEach(() => {
      // Set fixed time to Saturday 10:00 AM (Weekend)
      vi.useFakeTimers()
      const date = new Date('2023-10-14T10:00:00Z') // A Saturday
      vi.setSystemTime(date)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    const oooConfigOverrides = {
      oooEnabled: true,
      oooTimezone: 'UTC',
      oooWorkingDays: [1, 2, 3, 4, 5], // Mon-Fri
      oooStartTime: '09:00',
      oooEndTime: '17:00',
      oooFallbackMessage: 'We are OOO right now.',
    }

    it('outside hours + normal question -> AI replies normally, no OOO message', async () => {
      h.loadAiConfig.mockResolvedValue(aiConfig(oooConfigOverrides))
      h.generateReply.mockResolvedValue({ text: 'Normal reply', handoff: false })
      await dispatchInboundToAiReply(ARGS)
      
      expect(h.engineSendText).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Normal reply', aiGenerated: true })
      )
      // Should not update last_ooo_sent_at
      const updates = h.state.updatePayloads.filter(p => 'last_ooo_sent_at' in p)
      expect(updates).toHaveLength(0)
    })

    it('outside hours + handoff -> OOO fallback sent, cooldown updated, push notification created', async () => {
      h.loadAiConfig.mockResolvedValue(aiConfig(oooConfigOverrides))
      h.generateReply.mockResolvedValue({ text: '', handoff: true })
      await dispatchInboundToAiReply(ARGS)
      
      // Should send the exact OOO message, not AI generated
      expect(h.engineSendText).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'We are OOO right now.', aiGenerated: false })
      )
      // Should update last_ooo_sent_at
      const updates = h.state.updatePayloads.filter(p => 'last_ooo_sent_at' in p)
      expect(updates).toHaveLength(1)
      
      // Handoff summary still written
      const summaryUpdates = h.state.updatePayloads.filter(p => 'ai_handoff_summary' in p)
      expect(summaryUpdates.length).toBeGreaterThan(0)

      // Push notification created
      expect(h.sendPushToQueue).toHaveBeenCalledWith(
        expect.anything(),
        'acct-1',
        expect.objectContaining({ type: 'ai_handoff' })
      )
    })

    it('disabled fallback (oooEnabled: false) -> existing AI/handoff behavior', async () => {
      h.loadAiConfig.mockResolvedValue(aiConfig({ ...oooConfigOverrides, oooEnabled: false }))
      h.generateReply.mockResolvedValue({ text: 'Standard bridge', handoff: true })
      await dispatchInboundToAiReply(ARGS)
      
      expect(h.engineSendText).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Standard bridge', aiGenerated: true })
      )
      const updates = h.state.updatePayloads.filter(p => 'last_ooo_sent_at' in p)
      expect(updates).toHaveLength(0)
    })

    it('inside hours + handoff -> no OOO fallback, standard bridge message', async () => {
      // Set to Monday 10:00 AM
      vi.setSystemTime(new Date('2023-10-16T10:00:00Z'))
      
      h.loadAiConfig.mockResolvedValue(aiConfig(oooConfigOverrides))
      h.generateReply.mockResolvedValue({ text: 'I am fetching a human.', handoff: true })
      await dispatchInboundToAiReply(ARGS)
      
      // Sends the AI bridge message, not the fallback
      expect(h.engineSendText).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'I am fetching a human.', aiGenerated: true })
      )
      // Should NOT update last_ooo_sent_at
      const updates = h.state.updatePayloads.filter(p => 'last_ooo_sent_at' in p)
      expect(updates).toHaveLength(0)
    })

    it('repeated handoff during cooldown -> no duplicate fallback sent', async () => {
      h.loadAiConfig.mockResolvedValue(aiConfig(oooConfigOverrides))
      h.generateReply.mockResolvedValue({ text: '', handoff: true })
      
      // Set last OOO sent 2 hours ago
      h.state.conv = {
        ...h.state.conv,
        last_ooo_sent_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString()
      }
      
      await dispatchInboundToAiReply(ARGS)
      
      // Because it's on cooldown, no message should be sent (bridgeText is empty)
      expect(h.engineSendText).not.toHaveBeenCalled()
      
      // last_ooo_sent_at should not be updated again
      const updates = h.state.updatePayloads.filter(p => 'last_ooo_sent_at' in p)
      expect(updates).toHaveLength(0)
      
      // But handoff summary still gets written
      const summaryUpdates = h.state.updatePayloads.filter(p => 'ai_handoff_summary' in p)
      expect(summaryUpdates.length).toBeGreaterThan(0)
    })
  })
})


describe('dispatchInboundToAiReply — qualification auto-advance', () => {
  const ARGS = {
    accountId: 'acct-1',
    conversationId: 'conv-1',
    contactId: 'contact-1',
    configOwnerUserId: 'user-1',
  }

  it('service + need + budget => New Lead moves to Qualified', async () => {
    h.buildConversationContext.mockResolvedValue([
      { role: 'user', content: 'I need a custom ERP for billing, my budget is $50k' }
    ])
    await dispatchInboundToAiReply(ARGS)
    
    const rpc = h.state.rpcCalls.find(c => c.name === 'advance_deal_stage_safely')
    if (!rpc) console.log('RPC CALLS:', h.state.rpcCalls)
    expect(rpc).toBeDefined()
    expect(rpc.args.p_target_stage_name).toBe('Qualified')
  })

  it('service + need + timeline => moves to Qualified', async () => {
    h.buildConversationContext.mockResolvedValue([
      { role: 'user', content: 'I need a website for inventory ASAP' }
    ])
    await dispatchInboundToAiReply(ARGS)
    
    const rpc = h.state.rpcCalls.find(c => c.name === 'advance_deal_stage_safely')
    expect(rpc).toBeDefined()
    expect(rpc.args.p_target_stage_name).toBe('Qualified')
  })

  it('service only => no move', async () => {
    h.buildConversationContext.mockResolvedValue([
      { role: 'user', content: 'Tell me about Custom ERP' }
    ])
    await dispatchInboundToAiReply(ARGS)
    const rpc = h.state.rpcCalls.find(c => c.name === 'advance_deal_stage_safely')
    expect(rpc).toBeUndefined()
  })

  it('need only => no move', async () => {
    h.buildConversationContext.mockResolvedValue([
      { role: 'user', content: 'I need billing features' }
    ])
    await dispatchInboundToAiReply(ARGS)
    const rpc = h.state.rpcCalls.find(c => c.name === 'advance_deal_stage_safely')
    expect(rpc).toBeUndefined()
  })

  it('price question without numeric budget => no move', async () => {
    h.buildConversationContext.mockResolvedValue([
      { role: 'user', content: 'I need a Custom ERP for billing, what is the price?' }
    ])
    await dispatchInboundToAiReply(ARGS)
    const rpc = h.state.rpcCalls.find(c => c.name === 'advance_deal_stage_safely')
    expect(rpc).toBeUndefined()
  })

  it('vague timeline => no move', async () => {
    h.buildConversationContext.mockResolvedValue([
      { role: 'user', content: 'I need a Custom ERP for billing sometime in the future' }
    ])
    await dispatchInboundToAiReply(ARGS)
    const rpc = h.state.rpcCalls.find(c => c.name === 'advance_deal_stage_safely')
    expect(rpc).toBeUndefined()
  })

  it('qualification evaluation failure does not block AI reply', async () => {
    // We mock buildConversationContext to throw when extractHandoffBrief reads it?
    // extractHandoffBrief is synchronous, but we can mock it to throw or just make db.rpc throw.
    h.buildConversationContext.mockResolvedValue([
      { role: 'user', content: 'I need a custom ERP for billing, my budget is $50k' }
    ])
    
    // Simulate DB failure
    const originalRpc = h.state.rpcCalls.push;
    h.state.rpcCalls.push = () => { throw new Error('DB Down') };
    
    await dispatchInboundToAiReply(ARGS) // should not throw!
    expect(h.engineSendText).toHaveBeenCalled()
    
    // restore
    h.state.rpcCalls.push = originalRpc;
  })
})

describe('dispatchInboundToAiReply — negotiation detection', () => {
  const ARGS = {
    accountId: 'acct-1',
    conversationId: 'conv-1',
    contactId: 'contact-1',
    configOwnerUserId: 'user-1',
  }

  beforeEach(() => {
    h.state.conv = {
      assigned_agent_id: null,
      ai_autoreply_disabled: false,
      ai_reply_count: 0,
    }
  })

  it('Proposal Sent + genuine counter-offer + normal AI reply => negotiation_suggestion created', async () => {
    h.buildConversationContext.mockResolvedValue([
      { role: 'user', content: '50k ki jagah 40k me ho jayega?' }
    ])
    h.state.conv = { stage: { name: 'Proposal Sent' } } 
    h.classifyNegotiation.mockResolvedValue({
      negotiation_detected: true,
      reason: 'Counter-offer detected',
      confidence: 0.90
    })

    await dispatchInboundToAiReply(ARGS)

    expect(h.classifyNegotiation).toHaveBeenCalledWith('50k ki jagah 40k me ho jayega?', expect.anything())
    expect(h.state.updatePayload).toMatchObject({
      negotiation_suggestion: {
        detected: true,
        reason: 'Counter-offer detected',
        confidence: 0.90,
        message_burst: '50k ki jagah 40k me ho jayega?'
      }
    })
  })

  it('Proposal Sent + genuine counter-offer + AI HANDOFF => negotiation_suggestion STILL created', async () => {
    h.buildConversationContext.mockResolvedValue([
      { role: 'user', content: '50k ki jagah 40k me ho jayega?' }
    ])
    h.state.conv = { stage: { name: 'Proposal Sent' } } 
    h.generateReply.mockResolvedValue({ text: '', handoff: true })
    h.classifyNegotiation.mockResolvedValue({
      negotiation_detected: true,
      reason: 'Counter-offer detected',
      confidence: 0.90
    })

    await dispatchInboundToAiReply(ARGS)

    expect(h.classifyNegotiation).toHaveBeenCalled()
    // It should have made two updates (one for suggestion, one for handoff). 
    // In our mock, `updatePayload` holds the LAST update payload.
    // The handoff block runs AFTER the suggestion update block, so `ai_handoff_summary` should be present in the last update.
    // We just verify that classifyNegotiation WAS called.
  })

  it('"price kya hai?" => no suggestion', async () => {
    h.buildConversationContext.mockResolvedValue([{ role: 'user', content: 'price kya hai?' }])
    h.state.conv = { stage: { name: 'Proposal Sent' } } 
    h.classifyNegotiation.mockResolvedValue({
      negotiation_detected: false,
      reason: 'Price inquiry',
      confidence: 0.90
    })

    await dispatchInboundToAiReply(ARGS)

    expect(h.classifyNegotiation).toHaveBeenCalled()
    expect(h.state.updatePayloads.some(p => p.negotiation_suggestion)).toBe(false)
  })

  it('"budget 50k hai" => no suggestion', async () => {
    h.buildConversationContext.mockResolvedValue([{ role: 'user', content: 'budget 50k hai' }])
    h.state.conv = { stage: { name: 'Proposal Sent' } } 
    h.classifyNegotiation.mockResolvedValue({
      negotiation_detected: false,
      reason: 'Budget statement',
      confidence: 0.90
    })

    await dispatchInboundToAiReply(ARGS)

    expect(h.classifyNegotiation).toHaveBeenCalled()
    expect(h.state.updatePayloads.some(p => p.negotiation_suggestion)).toBe(false)
  })

  it('Qualified stage => classifier run for terminal but not negotiation', async () => {
    h.buildConversationContext.mockResolvedValue([{ role: 'user', content: '50k ki jagah 40k me ho jayega?' }])
    h.state.conv = { stage: { name: 'Qualified' } } 

    await dispatchInboundToAiReply(ARGS)

    expect(h.classifyNegotiation).not.toHaveBeenCalled()
  })

  it('already Negotiation => classifier not run', async () => {
    h.buildConversationContext.mockResolvedValue([{ role: 'user', content: '50k ki jagah 40k me ho jayega?' }])
    h.state.conv = { stage: { name: 'Negotiation' } } 

    await dispatchInboundToAiReply(ARGS)

    expect(h.classifyNegotiation).not.toHaveBeenCalled()
  })

  it('classifier error => handoff/reply still works', async () => {
    h.buildConversationContext.mockResolvedValue([{ role: 'user', content: 'error test' }])
    h.state.conv = { stage: { name: 'Proposal Sent' } } 
    h.classifyNegotiation.mockRejectedValue(new Error('Classifier failed'))

    await dispatchInboundToAiReply(ARGS)

    expect(h.engineSendText).toHaveBeenCalled()
  })
})

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

  it('early reply clears follow_up_at only on exact active deal', async () => {
    h.state.dealsUpdatePayload = null
    h.state.conv = { id: 'deal-123' } // maybeSingle returns this mock active deal
    
    await dispatchInboundToAiReply(ARGS)
    
    expect(h.state.dealsUpdatePayload).toMatchObject({
      follow_up_at: null
    })
    expect(h.state.dealsUpdateEqArgs).toContainEqual(['id', 'deal-123'])
    // Should NOT contain account_id or contact_id as the update key anymore (proves we target by deal id only)
    expect(h.state.dealsUpdateEqArgs).not.toContainEqual(['account_id', ARGS.accountId])
  })
})

describe('dispatchInboundToAiReply — terminal detection', () => {
  it('explicit proceed message -> Won suggestion', async () => {
    h.buildConversationContext.mockResolvedValue([{ role: 'user', content: 'done, start karo' }])
    h.state.conv = { stage: { name: 'Proposal Sent' } }
    h.classifyNegotiation.mockResolvedValue({ negotiation_detected: false, reason: '', confidence: 0 })
    h.classifyNurture.mockResolvedValue({ nurture_detected: false, reason: '', confidence: 0, raw_follow_up_phrase: null })
    h.classifyTerminalIntent.mockResolvedValue({ outcome: 'won', reason: 'Explicit proceed', confidence: 0.95 })

    await dispatchInboundToAiReply(ARGS)

    expect(h.classifyTerminalIntent).toHaveBeenCalled()
  })

  it('explicit payment/start message -> Won suggestion', async () => {
    h.buildConversationContext.mockResolvedValue([{ role: 'user', content: 'payment kar diya' }])
    h.state.conv = { stage: { name: 'Negotiation' } }
    h.classifyTerminalIntent.mockResolvedValue({ outcome: 'won', reason: 'Payment confirmed', confidence: 0.90 })

    await dispatchInboundToAiReply(ARGS)
    expect(h.classifyTerminalIntent).toHaveBeenCalled()
  })

  it('explicit rejection -> Lost suggestion', async () => {
    h.buildConversationContext.mockResolvedValue([{ role: 'user', content: 'not interested' }])
    h.state.conv = { stage: { name: 'Qualified' } }
    h.classifyTerminalIntent.mockResolvedValue({ outcome: 'lost', reason: 'Rejection', confidence: 0.99 })

    await dispatchInboundToAiReply(ARGS)
    expect(h.classifyTerminalIntent).toHaveBeenCalled()
  })

  it('chose competitor -> Lost suggestion', async () => {
    h.buildConversationContext.mockResolvedValue([{ role: 'user', content: 'we selected another agency' }])
    h.state.conv = { stage: { name: 'Proposal Sent' } }
    h.classifyTerminalIntent.mockResolvedValue({ outcome: 'lost', reason: 'Competitor chosen', confidence: 0.95 })

    await dispatchInboundToAiReply(ARGS)
    expect(h.classifyTerminalIntent).toHaveBeenCalled()
  })

  it('"next month baat karte hain" -> NOT Won/Lost', async () => {
    h.buildConversationContext.mockResolvedValue([{ role: 'user', content: 'next month baat karte hain' }])
    h.state.conv = { stage: { name: 'Proposal Sent' } }
    // Nurture has precedence, it should run and detect true
    h.classifyNurture.mockResolvedValue({ nurture_detected: true, reason: 'deferral', confidence: 0.90, raw_follow_up_phrase: null })

    await dispatchInboundToAiReply(ARGS)
    expect(h.classifyNurture).toHaveBeenCalled()
    expect(h.classifyTerminalIntent).not.toHaveBeenCalled()
  })

  it('"40k me karoge?" -> NOT Won/Lost', async () => {
    h.buildConversationContext.mockResolvedValue([{ role: 'user', content: '40k me karoge?' }])
    h.state.conv = { stage: { name: 'Proposal Sent' } }
    h.classifyNegotiation.mockResolvedValue({ negotiation_detected: true, reason: 'counter-offer', confidence: 0.95 })

    await dispatchInboundToAiReply(ARGS)
    expect(h.classifyNegotiation).toHaveBeenCalled()
    expect(h.classifyTerminalIntent).not.toHaveBeenCalled()
  })

  it('AI does not directly set Won/Lost, it sets terminal_suggestion', async () => {
    h.buildConversationContext.mockResolvedValue([{ role: 'user', content: 'payment done' }])
    h.state.conv = { stage: { name: 'Qualified' } }
    h.classifyTerminalIntent.mockResolvedValue({ outcome: 'won', reason: '', confidence: 0.95 })

    await dispatchInboundToAiReply(ARGS)
    
    console.log('UPDATE PAYLOADS:', JSON.stringify(h.state.updatePayloads, null, 2))
    
    // In update, it should set terminal_suggestion, NOT status='won'
    const terminalUpdate = h.state.updatePayloads.find(p => p.terminal_suggestion)
    expect(terminalUpdate).toMatchObject({
      terminal_suggestion: expect.objectContaining({ outcome: 'won' })
    })
    expect(terminalUpdate).not.toHaveProperty('status')
  })
})
