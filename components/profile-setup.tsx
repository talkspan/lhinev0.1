"use client"

import type React from "react"

import { useState } from "react"
import { useAuth } from "./auth-provider"

export function ProfileSetup() {
  const { user, updateDisplayName } = useAuth()
  const [displayName, setDisplayName] = useState("")
  const [isUpdating, setIsUpdating] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!displayName.trim()) return
    setIsUpdating(true)
    try {
      await updateDisplayName(displayName.trim())
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="setup-container">
      <div className="setup-content">
        <div className="setup-header">
          <div className="setup-title">Welcome to Timeline</div>
          <div className="setup-subtitle">Let's set up your workspace</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="displayName" className="form-label">
              Display name
            </label>
            <input
              id="displayName"
              type="text"
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your name"
              maxLength={50}
              required
              autoFocus
            />
            <div className="form-help">This is how you'll appear in your timelines</div>
          </div>

          <button type="submit" disabled={!displayName.trim() || isUpdating} className="btn btn-primary">
            {isUpdating ? "Setting up..." : "Continue"}
          </button>
        </form>

        <div className="separator"></div>

        <div style={{ fontSize: 12, color: "var(--muted-foreground)", textAlign: "center" }}>
          Signed in with {user?.provider === "github" ? "GitHub" : "Google"} • {user?.email}
        </div>
      </div>
    </div>
  )
}
