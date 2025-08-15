import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const userCookie = request.cookies.get("auth-user")

    if (!userCookie) {
      return NextResponse.json({ user: null })
    }

    const user = JSON.parse(userCookie.value)
    return NextResponse.json({ user })
  } catch (error) {
    console.error("[v0] Error reading user session:", error)
    return NextResponse.json({ user: null })
  }
}
