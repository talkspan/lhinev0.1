import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  // Handle session refresh for authenticated routes
  if (request.nextUrl.pathname.startsWith("/api/auth/")) {
    return NextResponse.next()
  }

  // Check for session cookie and refresh if needed
  const sessionCookie = request.cookies.get("auth-session")

  if (sessionCookie) {
    try {
      const sessionData = JSON.parse(Buffer.from(sessionCookie.value, "base64").toString())

      // If session expires within 24 hours, refresh it
      const timeUntilExpiry = sessionData.expiresAt - Date.now()
      const oneDayInMs = 24 * 60 * 60 * 1000

      if (timeUntilExpiry < oneDayInMs && timeUntilExpiry > 0) {
        const refreshedSession = {
          ...sessionData,
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
        }

        const response = NextResponse.next()
        response.cookies.set("auth-session", Buffer.from(JSON.stringify(refreshedSession)).toString("base64"), {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 7, // 7 days
          path: "/",
        })

        return response
      }
    } catch (error) {
      // Invalid session cookie, clear it
      const response = NextResponse.next()
      response.cookies.delete("auth-session")
      return response
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
}
