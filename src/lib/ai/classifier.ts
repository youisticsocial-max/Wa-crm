import { type AiConfig, type ChatMessage } from './types'
import { generateOpenAi } from './providers/openai'
import { generateAnthropic } from './providers/anthropic'
import { AI_PROVIDER_DEFAULT_ENDPOINT, aiRequestTimeoutMs } from './defaults'

export interface NegotiationClassification {
  negotiation_detected: boolean
  reason: string
  confidence: number
}

const NEGOTIATION_SYSTEM_PROMPT = `You are a strict classifier analyzing a customer's WhatsApp message to determine if it indicates a genuine commercial negotiation.
Return ONLY valid JSON matching this schema exactly:
{
  "negotiation_detected": boolean,
  "reason": "string (short explanation)",
  "confidence": number (0.0 to 1.0)
}

RULES FOR DETECTION:
- Signals that MAY count: discount requests, counter-offers, payment terms negotiation (e.g. installments), scope-vs-price trade-offs, commercial delivery conditions.
- DO NOT count: simple price inquiries ("price kya hai?", "kitna cost hai?"), budget statements ("budget 50k hai"), or generic service/timeline questions.
- Examples of TRUE: "10% discount kar sakte ho?", "50k ki jagah 40k me ho jayega?", "50% advance chalega?", "payment 3 parts me kar sakte hain?", "ye feature hata du to price kam hoga?".
- Be conservative. If uncertain, negotiation_detected MUST be false.

Analyze ONLY the customer's intent in the provided message burst.`

export async function classifyNegotiation(
  customerBurstText: string,
  config: AiConfig,
): Promise<NegotiationClassification | null> {
  if (!customerBurstText.trim()) return null

  const timeoutMs = aiRequestTimeoutMs()
  const resolvedBaseUrl =
    config.baseUrl && config.baseUrl.trim()
      ? config.baseUrl.trim()
      : (AI_PROVIDER_DEFAULT_ENDPOINT[config.provider] ?? null)

  const messages: ChatMessage[] = [
    { role: 'user', content: customerBurstText }
  ]

  const providerArgs = {
    apiKey: config.apiKey,
    model: config.model,
    baseUrl: resolvedBaseUrl,
    systemPrompt: NEGOTIATION_SYSTEM_PROMPT,
    messages,
    timeoutMs,
  }

  let text: string
  try {
    if (config.provider === 'anthropic') {
      const res = await generateAnthropic(providerArgs)
      text = res.text
    } else {
      // For OpenAI, Groq, etc. we can pass a system prompt and expect JSON text.
      // We rely on the prompt to format as JSON.
      const res = await generateOpenAi(providerArgs)
      text = res.text
    }
  } catch (err) {
    console.error('[ai classifier] provider error:', err)
    return null
  }

  try {
    // Extract JSON block in case model wraps it in markdown
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0]) as Partial<NegotiationClassification>

    if (
      typeof parsed.negotiation_detected === 'boolean' &&
      typeof parsed.reason === 'string' &&
      typeof parsed.confidence === 'number'
    ) {
      return parsed as NegotiationClassification
    }
  } catch (err) {
    console.error('[ai classifier] failed to parse classification:', err)
  }

  return null
}
