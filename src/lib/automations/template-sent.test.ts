import { describe, expect, it, vi, beforeEach } from "vitest"
import { runAutomationsForTrigger } from "./engine"
import { supabaseAdmin } from "./admin-client"

// Mock supabaseAdmin
vi.mock("./admin-client", () => ({
  supabaseAdmin: vi.fn(),
}))

describe("Template Sent Automation - Deal Progression", () => {
  const accountId = "acct-1"
  const contactId = "contact-1"
  const automationId = "auto-1"
  const pipelineId = "pipe-1"
  const stageId = "stage-proposal-sent"

  let mockDb: any

  beforeEach(() => {
    vi.resetAllMocks()
    ;(globalThis as any).__mockActiveDealStage = null

    // Setup robust mock Supabase client chain
    mockDb = {
      from: vi.fn(),
      rpc: vi.fn().mockResolvedValue({ error: null }),
    }
    ;(supabaseAdmin as any).mockReturnValue(mockDb)

    mockDb.from.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
      }
      
      if (table === 'contacts') {
        const sChain: any = {
          eq: () => sChain,
          maybeSingle: () => Promise.resolve({ data: { id: "contact-1" }, error: null })
        }
        chain.select = () => sChain
      }
      else if (table === 'automations') {
        const sChain: any = {
          eq: (c1: string) => {
            const innerChain = {
              eq: (c2: string) => {
                const finalChain = {
                  eq: (c3: string) => Promise.resolve({
                    data: [{
                      id: automationId,
                      account_id: accountId,
                      user_id: "user-1",
                      trigger_type: "template_sent",
                      trigger_config: { template_name: "proposal_v1" },
                      is_active: true
                    }],
                    error: null
                  }),
                  single: () => Promise.resolve({ data: null, error: null })
                }
                return finalChain
              }
            }
            return innerChain
          }
        }
        chain.select = () => sChain
      }
      else if (table === 'automation_steps') {
        const sChain: any = {
          eq: () => sChain,
          gte: () => sChain,
          is: () => sChain,
          order: () => sChain,
          then: (res: any, rej: any) => Promise.resolve({
            data: [{
              id: "step-1",
              automation_id: automationId,
              step_type: "update_deal_stage",
              step_config: { pipeline_id: pipelineId, stage_id: stageId },
              position: 1
            }],
            error: null
          }).then(res, rej)
        }
        chain.select = () => sChain
      }
      else if (table === 'automation_logs') {
        chain.insert = () => ({
          select: () => ({
            single: () => Promise.resolve({ data: { id: "log-1" }, error: null })
          })
        })
      }
      else if (table === 'pipelines') {
        const sChain: any = {
          eq: () => sChain,
          maybeSingle: () => Promise.resolve({ data: { name: 'Main' }, error: null })
        }
        chain.select = () => sChain
      }
      else if (table === 'pipeline_stages') {
        const sChain: any = {
          eq: () => sChain,
          maybeSingle: () => Promise.resolve({ data: { name: 'Proposal Sent' }, error: null })
        }
        chain.select = () => sChain
      }
      else if (table === 'deals') {
        const sChain: any = {
          eq: () => sChain,
          not: () => sChain,
          order: () => sChain,
          limit: () => sChain,
          maybeSingle: () => {
             const stageName = (globalThis as any).__mockActiveDealStage
             if (!stageName) return Promise.resolve({ data: null, error: null })
             return Promise.resolve({ data: { id: 'deal-1', stage: { name: stageName } }, error: null })
          }
        }
        chain.select = () => sChain
        
        // update_deal_stage also performs an update on the deal table if the target stage is different
        // engine.ts: const { error: updErr } = await db.from('deals').update(...).eq(...)
        const updChain: any = {
          eq: () => updChain,
          not: () => updChain,
          then: (res: any, rej: any) => Promise.resolve({ error: null }).then(res, rej)
        }
        chain.update = () => updChain
      }
      
      return chain
    })
  })

  const mockActiveDealStage = (stageName: string | null) => {
    ;(globalThis as any).__mockActiveDealStage = stageName
  }

  it("advances deal from Qualified to Proposal Sent on matching template", async () => {
    mockActiveDealStage('Qualified')

    await runAutomationsForTrigger({
      accountId,
      triggerType: "template_sent",
      contactId,
      context: { template_name: "proposal_v1" }
    })

    expect(mockDb.rpc).toHaveBeenCalledWith('advance_deal_stage_safely', {
      p_account_id: accountId,
      p_contact_id: contactId,
      p_pipeline_name: 'Main',
      p_target_stage_name: 'Proposal Sent'
    })
  })

  it("does not advance if current stage is New Lead (call-side protection)", async () => {
    mockActiveDealStage('New Lead')

    await runAutomationsForTrigger({
      accountId,
      triggerType: "template_sent",
      contactId,
      context: { template_name: "proposal_v1" }
    })

    expect(mockDb.rpc).not.toHaveBeenCalledWith('advance_deal_stage_safely', expect.anything())
  })

  it("does not advance if current stage is Negotiation (regression check)", async () => {
    mockActiveDealStage('Negotiation')

    await runAutomationsForTrigger({
      accountId,
      triggerType: "template_sent",
      contactId,
      context: { template_name: "proposal_v1" }
    })

    expect(mockDb.rpc).not.toHaveBeenCalledWith('advance_deal_stage_safely', expect.anything())
  })

  it("does not trigger automation for unrelated template", async () => {
    mockActiveDealStage('Qualified')

    await runAutomationsForTrigger({
      accountId,
      triggerType: "template_sent",
      contactId,
      context: { template_name: "marketing_blast_1" }
    })

    expect(mockDb.rpc).not.toHaveBeenCalled()
  })

  it("handles no active deal gracefully (no-op)", async () => {
    mockActiveDealStage(null)

    await runAutomationsForTrigger({
      accountId,
      triggerType: "template_sent",
      contactId,
      context: { template_name: "proposal_v1" }
    })

    expect(mockDb.rpc).not.toHaveBeenCalledWith('advance_deal_stage_safely', expect.anything())
  })
})
