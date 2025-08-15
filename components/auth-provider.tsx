"use client"

import type React from "react"
import { createContext, useContext, useEffect, useState } from "react"

interface User {
  id: string
  email: string
  name: string
  displayName: string
  avatar?: string
  provider: "github" | "google"
}

interface Timeline {
  id: string
  name: string
  userId: string
  createdAt: number
  updatedAt: number
  events: Array<{ id: string; title: string; time: number }>
}

interface AuthContextType {
  user: User | null
  timelines: Timeline[]
  currentTimeline: Timeline | null
  isLoading: boolean
  error: string | null
  showDashboard: boolean
  signIn: (provider: "github" | "google") => Promise<void>
  signOut: () => Promise<void>
  updateDisplayName: (name: string) => Promise<void>
  createTimeline: (name: string) => Promise<Timeline>
  selectTimeline: (timelineId: string) => void
  openTimelineDashboard: () => void
  updateTimeline: (timeline: Timeline) => Promise<void>
  deleteTimeline: (timelineId: string) => Promise<void>
  clearError: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

function generateSecureState(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [timelines, setTimelines] = useState<Timeline[]>([])
  const [currentTimeline, setCurrentTimeline] = useState<Timeline | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showDashboard, setShowDashboard] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Check for server-side session first
        const response = await fetch("/api/auth/session")
        const sessionData = await response.json()

        if (sessionData.authenticated && sessionData.user) {
          setUser(sessionData.user)
          await loadUserTimelines(sessionData.user.id)
        } else {
          // Fallback to localStorage for demo mode
          const savedUser = localStorage.getItem("timeline-user")
          if (savedUser) {
            const userData = JSON.parse(savedUser)
            setUser(userData)
            await loadUserTimelines(userData.id)
          }
        }

        // Handle OAuth callback success
        const urlParams = new URLSearchParams(window.location.search)
        if (urlParams.get("auth") === "success") {
          // Remove the auth parameter from URL
          window.history.replaceState({}, document.title, window.location.pathname)
          // Refresh session data
          const refreshResponse = await fetch("/api/auth/session")
          const refreshData = await refreshResponse.json()
          if (refreshData.authenticated) {
            setUser(refreshData.user)
            await loadUserTimelines(refreshData.user.id)
          }
        }

        // Handle OAuth errors
        const errorParam = urlParams.get("error")
        if (errorParam) {
          const errorMessages: Record<string, string> = {
            oauth_denied: "Authentication was cancelled",
            config_error: "OAuth configuration error",
            token_exchange_failed: "Failed to exchange authorization code",
            user_fetch_failed: "Failed to fetch user information",
            server_error: "Server error during authentication",
          }
          setError(errorMessages[errorParam] || "Authentication failed")
          window.history.replaceState({}, document.title, window.location.pathname)
        }
      } catch (error) {
        console.error("Auth check failed:", error)
        setError("Failed to restore session")
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [])

  const loadUserTimelines = async (userId: string) => {
    try {
      const savedTimelines = localStorage.getItem(`timeline-timelines-${userId}`)
      const savedCurrentId = localStorage.getItem(`timeline-current-${userId}`)

      if (savedTimelines) {
        const timelinesData = JSON.parse(savedTimelines)
        setTimelines(timelinesData)

        if (savedCurrentId) {
          const current = timelinesData.find((t: Timeline) => t.id === savedCurrentId)
          setCurrentTimeline(current || null)
        }
      }
    } catch (error) {
      console.error("Failed to load user timelines:", error)
    }
  }

  const signIn = async (provider: "github" | "google") => {
    setIsLoading(true)
    setError(null)

    try {
      const githubClientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
      const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

      if (provider === "github" && githubClientId) {
        const state = generateSecureState()
        const redirectUri = encodeURIComponent(`${window.location.origin}/api/auth/github/callback`)

        sessionStorage.setItem("oauth_state", state)
        sessionStorage.setItem("oauth_provider", provider)

        const authUrl = `https://github.com/login/oauth/authorize?client_id=${githubClientId}&scope=user:email&redirect_uri=${redirectUri}&state=${state}&response_type=code`
        window.location.href = authUrl
        return
      }

      if (provider === "google" && googleClientId) {
        const state = generateSecureState()
        const redirectUri = encodeURIComponent(`${window.location.origin}/api/auth/google/callback`)

        sessionStorage.setItem("oauth_state", state)
        sessionStorage.setItem("oauth_provider", provider)

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${googleClientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid%20email%20profile&state=${state}&access_type=offline&prompt=consent`
        
        // =================================================
        // ADD THE NEW LINE RIGHT HERE
        console.log("Generated Google Auth URL:", authUrl);
        // =================================================

        window.location.href = authUrl
        return
      }

      const missingConfig = []
      if (provider === "github" && !githubClientId) missingConfig.push("GitHub OAuth client ID")
      if (provider === "google" && !googleClientId) missingConfig.push("Google OAuth client ID")

      if (missingConfig.length > 0) {
        setError(`Missing ${missingConfig.join(", ")}. Using demo mode.`)
        await mockSignIn(provider)
      }
    } catch (error) {
      console.error("Sign in failed:", error)
      setError("Authentication failed. Please try again.")
      await mockSignIn(provider)
    } finally {
      setIsLoading(false)
    }
  }

  const mockSignIn = async (provider: "github" | "google") => {
    await new Promise((resolve) => setTimeout(resolve, 800))

    const mockUser: User = {
      id: `demo_${provider}_${Date.now()}`,
      email: provider === "github" ? "demo@github.com" : "demo@gmail.com",
      name: "Demo User",
      displayName: "",
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${provider}`,
      provider,
    }

    setUser(mockUser)
    localStorage.setItem("timeline-user", JSON.stringify(mockUser))
  }

  const signOut = async () => {
    try {
      // Call server-side logout to clear session cookie
      await fetch("/api/auth/logout", { method: "POST" })
    } catch (error) {
      console.error("Server logout failed:", error)
    }

    // Clear client-side state
    const userId = user?.id
    setUser(null)
    setTimelines([])
    setCurrentTimeline(null)
    setError(null)
    setShowDashboard(false)

    // Clear user-specific localStorage
    if (userId) {
      localStorage.removeItem(`timeline-timelines-${userId}`)
      localStorage.removeItem(`timeline-current-${userId}`)
    }
    localStorage.removeItem("timeline-user")
    sessionStorage.removeItem("oauth_state")
    sessionStorage.removeItem("oauth_provider")
  }

  const updateDisplayName = async (displayName: string) => {
    if (!user) return

    const updatedUser = { ...user, displayName }
    setUser(updatedUser)
    localStorage.setItem("timeline-user", JSON.stringify(updatedUser))

    const defaultTimeline: Timeline = {
      id: `timeline_${Date.now()}`,
      name: "My Timeline",
      userId: updatedUser.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      events: [],
    }

    setTimelines([defaultTimeline])
    setCurrentTimeline(defaultTimeline)
    setShowDashboard(false)
    localStorage.setItem(`timeline-timelines-${updatedUser.id}`, JSON.stringify([defaultTimeline]))
    localStorage.setItem(`timeline-current-${updatedUser.id}`, defaultTimeline.id)
  }

  const createTimeline = async (name: string): Promise<Timeline> => {
    if (!user) throw new Error("Not authenticated")

    const newTimeline: Timeline = {
      id: `timeline_${Date.now()}`,
      name,
      userId: user.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      events: [],
    }

    const updatedTimelines = [...timelines, newTimeline]
    setTimelines(updatedTimelines)
    localStorage.setItem(`timeline-timelines-${user.id}`, JSON.stringify(updatedTimelines))

    setCurrentTimeline(newTimeline)
    setShowDashboard(false)
    localStorage.setItem(`timeline-current-${user.id}`, newTimeline.id)

    return newTimeline
  }

  const selectTimeline = (timelineId: string) => {
    if (!user) return

    const timeline = timelines.find((t) => t.id === timelineId)
    if (timeline) {
      setCurrentTimeline(timeline)
      setShowDashboard(false)
      localStorage.setItem(`timeline-current-${user.id}`, timelineId)
    }
  }

  const updateTimeline = async (updatedTimeline: Timeline) => {
    if (!user) return

    const updatedTimelines = timelines.map((t) =>
      t.id === updatedTimeline.id ? { ...updatedTimeline, updatedAt: Date.now() } : t,
    )
    setTimelines(updatedTimelines)

    if (currentTimeline?.id === updatedTimeline.id) {
      setCurrentTimeline({ ...updatedTimeline, updatedAt: Date.now() })
    }

    localStorage.setItem(`timeline-timelines-${user.id}`, JSON.stringify(updatedTimelines))
  }

  const openTimelineDashboard = () => {
    setShowDashboard(true)
  }

  const deleteTimeline = async (timelineId: string) => {
    if (!user) return

    const updatedTimelines = timelines.filter((t) => t.id !== timelineId)
    setTimelines(updatedTimelines)

    if (currentTimeline?.id === timelineId) {
      setCurrentTimeline(updatedTimelines[0] || null)
      setShowDashboard(false)
      localStorage.setItem(`timeline-current-${user.id}`, updatedTimelines[0]?.id || "")
    }

    localStorage.setItem(`timeline-timelines-${user.id}`, JSON.stringify(updatedTimelines))
  }

  const clearError = () => setError(null)

  return (
    <AuthContext.Provider
      value={{
        user,
        timelines,
        currentTimeline,
        isLoading,
        error,
        showDashboard,
        signIn,
        signOut,
        updateDisplayName,
        createTimeline,
        selectTimeline,
        openTimelineDashboard,
        updateTimeline,
        deleteTimeline,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
