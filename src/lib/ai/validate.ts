import { generateReply } from './generate'
import { AiError, type AiConfig, type AiProvider } from './types'

const ALLOWLISTED_HOSTS = new Set([
  'api.openai.com',
  'api.anthropic.com',
  'api.groq.com',
  'openrouter.ai',
  'generativelanguage.googleapis.com',
])

/**
 * Validate Base URL to protect against SSRF (Server-Side Request Forgery).
 * Rejects invalid protocols and restricts private IP/local access in production
 * unless ALLOW_PRIVATE_AI_ENDPOINTS is enabled for self-hosted instances.
 */
export function validateBaseUrl(urlStr: string, provider: AiProvider): string {
  const trimmed = urlStr.trim()
  if (!trimmed) return ''

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new AiError('Invalid Base URL format. Must be a valid URL (e.g. https://api.groq.com/openai/v1/chat/completions).', {
      code: 'invalid_url',
      status: 400,
    })
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AiError('Base URL must use http:// or https:// protocol.', {
      code: 'invalid_protocol',
      status: 400,
    })
  }

  const hostname = parsed.hostname.toLowerCase()

  // Pre-approved official provider domains
  if (ALLOWLISTED_HOSTS.has(hostname)) {
    return trimmed
  }

  // Production SSRF guard: Block localhost / private IP ranges unless explicitly enabled
  const isLocalOrPrivate =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '169.254.169.254' ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    (hostname.startsWith('172.') &&
      (() => {
        const parts = hostname.split('.')
        const second = parseInt(parts[1] ?? '0', 10)
        return second >= 16 && second <= 31
      })())

  const isProduction = process.env.NODE_ENV === 'production'
  const allowPrivate = process.env.ALLOW_PRIVATE_AI_ENDPOINTS === 'true'

  if (isProduction && isLocalOrPrivate && !allowPrivate) {
    throw new AiError(
      'Access to local or internal private network endpoints is restricted in production. Set ALLOW_PRIVATE_AI_ENDPOINTS=true to enable self-hosted Ollama/local endpoints.',
      {
        code: 'ssrf_blocked',
        status: 400,
      },
    )
  }

  return trimmed
}

/**
 * Cheap liveness + auth check: one tiny generation against the
 * configured provider/model with the caller's key. Throws `AiError`
 * (invalid_key / rate_limited / network / timeout) on failure, resolves
 * on success. Used by the settings "Test key" button and before
 * persisting a config — the same "verify before save" discipline the
 * WhatsApp config uses with Meta.
 */
export async function validateAiCredentials(config: AiConfig): Promise<void> {
  if (config.baseUrl) {
    validateBaseUrl(config.baseUrl, config.provider)
  }

  await generateReply({
    config,
    systemPrompt: 'You are a connectivity check. Reply with the single word: OK.',
    messages: [{ role: 'user', content: 'ping' }],
  })
}
