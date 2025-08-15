import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true })
  response.cookies.set("auth-session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0, // Expire immediately
    path: "/",
  })

  return response
}
