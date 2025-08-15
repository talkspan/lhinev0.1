"use client"

import type React from "react"
import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { drawTimeline, drawMinimap, DAY } from "../lib/timeline-canvas"
import { CustomDateTimePicker } from "../components/custom-date-time-picker"
import { useAuth } from "../components/auth-provider"

// Enhanced helper for contextual time formatting
function formatSuggestedTime(timestamp: number) {
  const date = new Date(timestamp)
  const now = new Date()

  // Get start of today for comparison
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const eventDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  const daysDiff = Math.floor((eventDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
  const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

  // Today
  if (daysDiff === 0) {
    return `Today at ${timeStr}`
  }

  // Tomorrow
  if (daysDiff === 1) {
    return `Tomorrow at ${timeStr}`
  }

  // This week (within 7 days and same week)
  if (daysDiff > 1 && daysDiff <= 6) {
    const dayName = date.toLocaleDateString([], { weekday: "long" })
    return `This ${dayName} at ${timeStr}`
  }

  // Next week (7-13 days)
  if (daysDiff >= 7 && daysDiff <= 13) {
    const dayName = date.toLocaleDateString([], { weekday: "long" })
    return `Next ${dayName} at ${timeStr}`
  }

  // Same year but more than 2 weeks away
  if (date.getFullYear() === now.getFullYear() && daysDiff > 13) {
    return (
      date.toLocaleDateString([], {
        month: "long",
        day: "numeric",
      }) + ` at ${timeStr}`
    )
  }

  // Different year
  return (
    date.toLocaleDateString([], {
      month: "long",
      day: "numeric",
      year: "numeric",
    }) + ` at ${timeStr}`
  )
}

// Enhanced helper for event time display in sidebar
function formatEventTime(timestamp: number) {
  const date = new Date(timestamp)
  const now = new Date()

  // Get start of today for comparison
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const eventDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  const daysDiff = Math.floor((eventDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
  const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

  // Today
  if (daysDiff === 0) {
    return `Today ${timeStr}`
  }

  // Tomorrow
  if (daysDiff === 1) {
    return `Tomorrow ${timeStr}`
  }

  // This week (within 7 days)
  if (daysDiff > 1 && daysDiff <= 6) {
    const dayName = date.toLocaleDateString([], { weekday: "long" })
    return `This ${dayName} ${timeStr}`
  }

  // Next week (7-13 days)
  if (daysDiff >= 7 && daysDiff <= 13) {
    const dayName = date.toLocaleDateString([], { weekday: "long" })
    return `Next ${dayName} ${timeStr}`
  }

  // Same year but more than 2 weeks away
  if (date.getFullYear() === now.getFullYear() && daysDiff > 13) {
    return (
      date.toLocaleDateString([], {
        month: "short",
        day: "numeric",
      }) + ` ${timeStr}`
    )
  }

  // Different year
  return (
    date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
    }) + ` ${timeStr}`
  )
}

/* helpers */
function formatEta(ms: number) {
  let s = Math.max(0, Math.round(ms / 1000))
  const parts: string[] = []
  const push = (label: string, value: number) => {
    if (value > 0 || parts.length) parts.push(value + label)
  }
  const w = Math.floor(s / (7 * 24 * 3600))
  s -= w * 7 * 24 * 3600
  push("w", w)
  const d = Math.floor(s / (24 * 3600))
  s -= d * 24 * 3600
  push("d", d)
  const h = Math.floor(s / 3600)
  s -= h * 3600
  push("h", h)
  const m = Math.floor(s / 60)
  s -= m * 60
  push("m", m)
  if (!parts.length) parts.push(s + "s")
  return parts.join(" ")
}

function cryptoRandomId() {
  const r =
    typeof window !== "undefined" && window.crypto && crypto.getRandomValues
      ? crypto.getRandomValues(new Uint32Array(2))
      : [Math.random() * 2 ** 32, Math.random() * 2 ** 32]
  return Array.from(r, (n) => n.toString(36)).join("")
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

export function TimelinePlanner() {
  const { user, currentTimeline, updateTimeline, signOut, openTimelineDashboard } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const controlsRef = useRef<HTMLDivElement | null>(null)

  // Timeline state
  const [events, setEvents] = useState(currentTimeline?.events || [])
  const [newEventTitle, setNewEventTitle] = useState("")
  const [newEventTime, setNewEventTime] = useState(Date.now())
  const [showEventForm, setShowEventForm] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Canvas state
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const minimapRef = useRef<HTMLCanvasElement>(null)
  const [viewStart, setViewStart] = useState(Date.now() - 7 * DAY)
  const [viewEnd, setViewEnd] = useState(Date.now() + 7 * DAY)
  const [zoom, setZoom] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, time: 0 })

  // Update events when currentTimeline changes
  useEffect(() => {
    if (currentTimeline) {
      setEvents(currentTimeline.events || [])
    }
  }, [currentTimeline])

  // Canvas animation loop
  useEffect(() => {
    const canvas = canvasRef.current
    const minimap = minimapRef.current
    if (!canvas || !minimap) return

    const ctx = canvas.getContext("2d")
    const minimapCtx = minimap.getContext("2d")
    if (!ctx || !minimapCtx) return

    let animationId: number

    const animate = () => {
      // Set canvas size with device pixel ratio
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.scale(dpr, dpr)

      const minimapRect = minimap.getBoundingClientRect()
      minimap.width = minimapRect.width * dpr
      minimap.height = minimapRect.height * dpr
      minimapCtx.scale(dpr, dpr)

      // Draw timeline
      drawTimeline(ctx, {
        width: rect.width,
        height: rect.height,
        viewStart,
        viewEnd,
        events,
        now: Date.now(),
      })

      // Draw minimap
      drawMinimap(minimapCtx, {
        width: minimapRect.width,
        height: minimapRect.height,
        viewStart,
        viewEnd,
        events,
        now: Date.now(),
        totalStart: Math.min(viewStart, ...events.map((e) => e.time)) - DAY,
        totalEnd: Math.max(viewEnd, ...events.map((e) => e.time)) + DAY,
      })

      animationId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
    }
  }, [viewStart, viewEnd, events])

  // Handle canvas interactions
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left

      setIsDragging(true)
      setDragStart({ x, time: viewStart })
    },
    [viewStart],
  )

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return

      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const deltaX = x - dragStart.x
      const timeRange = viewEnd - viewStart
      const deltaTime = -(deltaX / rect.width) * timeRange

      const newViewStart = dragStart.time + deltaTime
      const newViewEnd = newViewStart + timeRange

      setViewStart(newViewStart)
      setViewEnd(newViewEnd)
    },
    [isDragging, dragStart, viewEnd, viewStart],
  )

  const handleCanvasMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Handle zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()

      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseTimeRatio = mouseX / rect.width
      const mouseTime = viewStart + (viewEnd - viewStart) * mouseTimeRatio

      const zoomFactor = e.deltaY > 0 ? 1.2 : 0.8
      const newTimeRange = (viewEnd - viewStart) * zoomFactor
      const newViewStart = mouseTime - newTimeRange * mouseTimeRatio
      const newViewEnd = newViewStart + newTimeRange

      setViewStart(newViewStart)
      setViewEnd(newViewEnd)
    },
    [viewStart, viewEnd],
  )

  // Add event
  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEventTitle.trim() || !currentTimeline) return

    const newEvent = {
      id: cryptoRandomId(),
      title: newEventTitle.trim(),
      time: newEventTime,
      completed: false,
    }

    const updatedEvents = [...events, newEvent]
    setEvents(updatedEvents)

    // Update timeline in storage
    const updatedTimeline = {
      ...currentTimeline,
      events: updatedEvents,
      updatedAt: Date.now(),
    }

    await updateTimeline(updatedTimeline)

    setNewEventTitle("")
    setNewEventTime(Date.now())
    setShowEventForm(false)
  }

  // Get upcoming events for sidebar
  const upcomingEvents = useMemo(() => {
    const now = Date.now()
    return events
      .filter((event) => event.time > now)
      .sort((a, b) => a.time - b.time)
      .slice(0, 10)
  }, [events])

  if (!currentTimeline) {
    return <div>No timeline selected</div>
  }

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-left">
          <input
            type="text"
            className="event-input"
            placeholder="Event title..."
            value={newEventTitle}
            onChange={(e) => setNewEventTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newEventTitle.trim()) {
                handleAddEvent(e as any)
              }
            }}
          />

          <CustomDateTimePicker
            value={newEventTime}
            onChange={setNewEventTime}
            formatSuggestedTime={formatSuggestedTime}
          />

          <button className="add-event-btn" onClick={handleAddEvent} disabled={!newEventTitle.trim()}>
            Add Event
          </button>
        </div>

        <div className="header-right">
          <div className="timeline-info">
            <span className="timeline-name">{currentTimeline.name}</span>
            <span className="event-count">{events.length} events</span>
          </div>

          <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} title="Toggle events sidebar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="15" y1="9" x2="21" y2="9" />
              <line x1="15" y1="15" x2="21" y2="15" />
              <line x1="3" y1="9" x2="9" y2="9" />
              <line x1="3" y1="15" x2="9" y2="15" />
            </svg>
            Events
          </button>

          <div className="user-menu" ref={controlsRef}>
            <button className="user-trigger" onClick={() => setMenuOpen(!menuOpen)}>
              <div className="user-avatar">{user?.displayName?.charAt(0) || "?"}</div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6,9 12,15 18,9" />
              </svg>
            </button>

            {menuOpen && (
              <div className="user-dropdown" ref={menuRef}>
                <div className="user-info">
                  <div className="user-name">{user?.displayName}</div>
                  <div className="user-email">{user?.email}</div>
                </div>
                <button
                  className="menu-item"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    openTimelineDashboard()
                  }}
                >
                  Manage timelines
                </button>
                <button
                  className="menu-item"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    signOut()
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16,17 21,12 16,7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="timeline-container">
          <canvas
            ref={canvasRef}
            className="timeline-canvas"
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
            onWheel={handleWheel}
          />

          <div className="minimap-container">
            <canvas ref={minimapRef} className="minimap-canvas" />
          </div>
        </div>

        {sidebarOpen && (
          <div className="events-sidebar">
            <div className="sidebar-header">
              <h3>Upcoming Events</h3>
              <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>
                ×
              </button>
            </div>

            <div className="events-list">
              {upcomingEvents.length === 0 ? (
                <div className="no-events">No upcoming events</div>
              ) : (
                upcomingEvents.map((event) => (
                  <div key={event.id} className="event-item">
                    <div className="event-title">{event.title}</div>
                    <div className="event-time">{formatEventTime(event.time)}</div>
                    <div className="event-eta">in {formatEta(event.time - Date.now())}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
