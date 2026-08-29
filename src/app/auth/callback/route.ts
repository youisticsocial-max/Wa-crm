import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * GET /auth/callback
 *
 * Supabase emails this URL as the recovery / magic-link / OAuth callback.
 * It receives a one-time `code` (PKCE flow) in the query string, exchanges
 * it for a session, writes the session cookies, then redirects the browser
 * to `next` (default: /update-password for the password-reset flow).
 *
 * The `next` param is set by the caller — e.g. forgot-password page passes
 * `?next=/update-password` via the `redirectTo` option of
 * `resetPasswordForEmail`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/update-password'

  if (code) {
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          },
        },
      },
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Session established — send the browser to the target page.
      // Use the request origin so this works on localhost, Vercel preview
      // URLs, and production without any hardcoded host.
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Code missing or exchange failed — redirect to login with an error hint.
  return NextResponse.redirect(`${origin}/login?error=invalid_reset_link`)
}
