"use client"

import { useState } from "react"
import { useAuth } from "./auth-provider"

export function HomePage() {
  const { signIn, isLoading } = useAuth()
  const [signingIn, setSigningIn] = useState<"github" | "google" | null>(null)

  const handleSignIn = async (provider: "github" | "google") => {
    setSigningIn(provider)
    try {
      await signIn(provider)
    } finally {
      setSigningIn(null)
    }
  }

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-content">
          <div className="spinner"></div>
          <div className="loading-text">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="welcome-container">
      <div className="welcome-content">
        <div className="welcome-title">Timeline</div>
        <div className="welcome-subtitle">Plan and visualize your events.</div>

        <div className="auth-buttons">
          <button className="auth-btn" onClick={() => handleSignIn("github")} disabled={signingIn !== null}>
            {signingIn === "github" ? (
              <div className="spinner" style={{ width: 16, height: 16, margin: 0 }}></div>
            ) : (
              "Continue with GitHub"
            )}
          </button>

          <button className="auth-btn" onClick={() => handleSignIn("google")} disabled={signingIn !== null}>
            {signingIn === "google" ? (
              <div className="spinner" style={{ width: 16, height: 16, margin: 0 }}></div>
            ) : (
              "Continue with Google"
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
