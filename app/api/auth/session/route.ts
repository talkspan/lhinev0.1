import { type NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()

    if (!session) {
      return NextResponse.json({ user: null, authenticated: false })
    }

    return NextResponse.json({
      user: session.user,
      authenticated: true,
      expiresAt: session.expiresAt,
    })
  } catch (error) {
    console.error("[v0] Session check error:", error)
    return NextResponse.json({ user: null, authenticated: false })
  }
}
