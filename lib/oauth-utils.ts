import { randomBytes } from "crypto"

export interface OAuthUser {
  id: string
  name: string
  displayName: string
  email: string
  avatar: string
  provider: "github" | "google"
}

export function generateOAuthState(): string {
  return randomBytes(32).toString("hex")
}

export function validateOAuthState(receivedState: string, expectedState: string): boolean {
  return receivedState === expectedState && receivedState.length === 64
}

export async function exchangeGitHubToken(code: string): Promise<{ access_token: string } | null> {
  try {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    })

    const data = await response.json()

    if (data.error || !data.access_token) {
      console.error("[v0] GitHub token exchange failed:", data.error)
      return null
    }

    return data
  } catch (error) {
    console.error("[v0] GitHub token exchange error:", error)
    return null
  }
}

export async function fetchGitHubUser(accessToken: string): Promise<OAuthUser | null> {
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    })

    if (!response.ok) {
      console.error("[v0] GitHub user fetch failed:", response.status)
      return null
    }

    const userData = await response.json()

    return {
      id: userData.id.toString(),
      name: userData.name || userData.login,
      displayName: userData.name || userData.login,
      email: userData.email,
      avatar: userData.avatar_url,
      provider: "github",
    }
  } catch (error) {
    console.error("[v0] GitHub user fetch error:", error)
    return null
  }
}

export async function exchangeGoogleToken(code: string, redirectUri: string): Promise<{ access_token: string } | null> {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    })

    const data = await response.json()

    if (data.error || !data.access_token) {
      console.error("[v0] Google token exchange failed:", data.error)
      return null
    }

    return data
  } catch (error) {
    console.error("[v0] Google token exchange error:", error)
    return null
  }
}

export async function fetchGoogleUser(accessToken: string): Promise<OAuthUser | null> {
  try {
    const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      console.error("[v0] Google user fetch failed:", response.status)
      return null
    }

    const userData = await response.json()

    return {
      id: userData.id,
      name: userData.name,
      displayName: userData.name,
      email: userData.email,
      avatar: userData.picture,
      provider: "google",
    }
  } catch (error) {
    console.error("[v0] Google user fetch error:", error)
    return null
  }
}

export function validateEnvironmentVariables(): { isValid: boolean; missing: string[] } {
  const required = [
    "NEXT_PUBLIC_GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
  ]

  const missing = required.filter((key) => !process.env[key])

  return {
    isValid: missing.length === 0,
    missing,
  }
}
