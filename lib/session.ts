import { cookies } from "next/headers"
import type { OAuthUser } from "./oauth-utils"

export interface SessionData {
  user: OAuthUser
  expiresAt: number
  createdAt: number
}

const SESSION_COOKIE_NAME = "auth-session"
const SESSION_DURATION = 60 * 60 * 24 * 7 * 1000 // 7 days in milliseconds

export async function createSession(user: OAuthUser): Promise<string> {
  const sessionData: SessionData = {
    user,
    expiresAt: Date.now() + SESSION_DURATION,
    createdAt: Date.now(),
  }

  // In a production app, you'd encrypt this data
  const sessionToken = Buffer.from(JSON.stringify(sessionData)).toString("base64")

  return sessionToken
}

export async function getSession(): Promise<SessionData | null> {
  try {
    const cookieStore = cookies()
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)

    if (!sessionCookie) {
      return null
    }

    const sessionData: SessionData = JSON.parse(Buffer.from(sessionCookie.value, "base64").toString())

    // Check if session is expired
    if (Date.now() > sessionData.expiresAt) {
      return null
    }

    return sessionData
  } catch (error) {
    console.error("[v0] Session validation error:", error)
    return null
  }
}

export async function refreshSession(sessionData: SessionData): Promise<string> {
  const refreshedSession: SessionData = {
    ...sessionData,
    expiresAt: Date.now() + SESSION_DURATION,
  }

  return Buffer.from(JSON.stringify(refreshedSession)).toString("base64")
}

export async function destroySession(): Promise<void> {
  const cookieStore = cookies()
  cookieStore.delete(SESSION_COOKIE_NAME)
}

export function setSessionCookie(sessionToken: string): {
  name: string
  value: string
  options: {
    httpOnly: boolean
    secure: boolean
    sameSite: "lax"
    maxAge: number
    path: string
  }
} {
  return {
    name: SESSION_COOKIE_NAME,
    value: sessionToken,
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_DURATION / 1000, // Convert to seconds
      path: "/",
    },
  }
}
