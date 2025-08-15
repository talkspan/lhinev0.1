import { type NextRequest, NextResponse } from "next/server"
import { exchangeGitHubToken, fetchGitHubUser, validateEnvironmentVariables } from "@/lib/oauth-utils"
import { createSession, setSessionCookie } from "@/lib/session"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  const envCheck = validateEnvironmentVariables()
  if (!envCheck.isValid) {
    console.error("[v0] Missing environment variables:", envCheck.missing)
    return NextResponse.redirect(new URL("/?error=config_error", request.url))
  }

  if (error) {
    console.error("[v0] GitHub OAuth error:", error)
    return NextResponse.redirect(new URL("/?error=oauth_denied", request.url))
  }

  if (!code) {
    console.error("[v0] Missing authorization code")
    return NextResponse.redirect(new URL("/?error=missing_code", request.url))
  }

  try {
    const tokenData = await exchangeGitHubToken(code)
    if (!tokenData) {
      return NextResponse.redirect(new URL("/?error=token_exchange_failed", request.url))
    }

    const user = await fetchGitHubUser(tokenData.access_token)
    if (!user) {
      return NextResponse.redirect(new URL("/?error=user_fetch_failed", request.url))
    }

    const sessionToken = await createSession(user)
    const sessionCookie = setSessionCookie(sessionToken)

    const response = NextResponse.redirect(new URL("/?auth=success", request.url))
    response.cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.options)

    return response
  } catch (error) {
    console.error("[v0] GitHub OAuth callback error:", error)
    return NextResponse.redirect(new URL("/?error=server_error", request.url))
  }
}
