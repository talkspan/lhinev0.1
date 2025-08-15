"use client"

import type React from "react"
import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { drawTimeline, drawMinimap, getScaleMeta, DAY, chooseStep } from "../lib/timeline-canvas"
import { CustomDateTimePicker } from "./custom-date-time-picker"
import { useAuth } from "./auth-provider"

export function TimelinePlanner() {
  const { user, signOut, openTimelineDashboard, currentTimeline, updateTimeline } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const controlsRef = useRef<HTMLDivElement | null>(null)
  const [headerHeight, setHeaderHeight] = useState(56)
  const shellRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const miniRef = useRef<HTMLCanvasElement>(null)
  const fabRef = useRef<HTMLButtonElement>(null)
  const trayRef = useRef<HTMLDivElement>(null)

  // viewport
  const [size, setSize] = useState({ width: 1200, height: 800 })

  // camera — refs for drawing, state for UI readouts
  const INITIAL_MSPERPX = 60000 / 60 // ~1s/px
  const [centerTime, _setCenterTime] = useState(() => Date.now())
  const centerRef = useRef(centerTime)
  const [msPerPx, _setMsPerPx] = useState(INITIAL_MSPERPX)
  const msPerPxRef = useRef(msPerPx)
  const [msPerPxTargetState, _setMsPerPxTargetState] = useState(INITIAL_MSPERPX)
  const msPerPxTargetRef = useRef(msPerPxTargetState)

  const syncCenter = (v: number | ((prev: number) => number)) => {
    const nv = typeof v === "function" ? v(centerRef.current) : v
    centerRef.current = nv
    _setCenterTime(nv)
  }
  const syncMsPerPx = (v: number | ((prev: number) => number)) => {
    const nv = typeof v === "function" ? v(msPerPxRef.current) : v
    msPerPxRef.current = nv
    _setMsPerPx(nv)
  }
  const setMsPerPxTarget = (v: number | ((prev: number) => number)) => {
    const nv = typeof v === "function" ? v(msPerPxTargetRef.current) : v
    msPerPxTargetRef.current = nv
    _setMsPerPxTargetState(nv)
  }

  const [followNow, setFollowNow] = useState(true)

  // events - use currentTimeline events
  const [events, setEvents] = useState<Array<{ id: string; title: string; time: number }>>(() => {
    return currentTimeline?.events || []
  })

  // Update events when currentTimeline changes
  useEffect(() => {
    if (currentTimeline) {
      setEvents(currentTimeline.events || [])
    }
  }, [currentTimeline])

  // Save events to timeline when events change
  useEffect(() => {
    if (currentTimeline && events !== currentTimeline.events) {
      const updatedTimeline = {
        ...currentTimeline,
        events,
        updatedAt: Date.now(),
      }
      updateTimeline(updatedTimeline)
    }
  }, [events, currentTimeline, updateTimeline])

  // notifications – prevent duplicates and track active notifications
  const [notified, setNotified] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("planner.notified")
        return raw ? new Set(JSON.parse(raw)) : new Set()
      } catch {
        return new Set()
      }
    }
    return new Set()
  })

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("planner.notified", JSON.stringify(Array.from(notified)))
    }
  }, [notified])

  // interaction
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ time: number; x: number; y: number } | null>(null)
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const [hoveringCenterline, setHoveringCenterline] = useState(false)
  const [eventGroupTooltip, setEventGroupTooltip] = useState<{
    x: number
    y: number
    events: Array<{ id: string; title: string; time: number }>
    visible: boolean
  } | null>(null)

  // sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // touch/mouse state
  const [touchState, setTouchState] = useState({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    startCenter: 0,
    startMsPerPx: 0,
  })

  const lastAnchorX = useRef(size.width / 2)

  // form state
  const [title, setTitle] = useState("")
  const [whenOption, setWhenOption] = useState("now")
  const [at, setAt] = useState("")

  const meta = useMemo(() => getScaleMeta(msPerPx), [msPerPx])

  // upcoming events for sidebar
  const upcomingEvents = useMemo(() => {
    const now = Date.now()
    return events
      .filter((e) => e.time > now)
      .sort((a, b) => a.time - b.time)
      .slice(0, 10)
  }, [events])

  // resize observer
  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setSize({ width, height })
      }
    })

    observer.observe(shell)
    return () => observer.unobserve(shell)
  }, [])

  // header height observer
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { height } = entry.contentRect
        setHeaderHeight(height + 16) // Add some padding
      }
    })

    observer.observe(controls)
    return () => observer.unobserve(controls)
  }, [])

  // animation loop
  useEffect(() => {
    let animationId: number

    const animate = () => {
      // smooth zoom
      const zoomSpeed = 0.15
      const currentTarget = msPerPxTargetRef.current
      const current = msPerPxRef.current
      const diff = currentTarget - current

      if (Math.abs(diff) > 0.01) {
        const newMsPerPx = current + diff * zoomSpeed
        syncMsPerPx(newMsPerPx)

        // adjust center to maintain anchor point
        const cx = size.width / 2
        const x = Math.min(size.width - 1, Math.max(0, lastAnchorX.current))
        const anchorTime = centerRef.current + (x - cx) * msPerPxRef.current
        const newCenter = anchorTime - (x - cx) * msPerPxTargetRef.current
        centerRef.current = newCenter
      }

      // draw
      const c = canvasRef.current,
        m = miniRef.current
      if (c && m && size.width > 0 && size.height > 0) {
        const dpr = Math.min((typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1, 2)

        const canvasWidth = Math.floor(size.width * dpr)
        const canvasHeight = Math.floor(size.height * dpr)

        if (canvasWidth > 0 && canvasHeight > 0) {
          if (c.width !== canvasWidth || c.height !== canvasHeight) {
            c.width = canvasWidth
            c.height = canvasHeight
            c.style.width = `${size.width}px`
            c.style.height = `${size.height}px`
          }

          const ctx = c.getContext("2d")
          if (ctx) {
            try {
              ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
              const result = drawTimeline(ctx, {
                width: size.width,
                height: size.height,
                centerTime: centerRef.current,
                msPerPx: msPerPxRef.current,
                events,
                nowMs: Date.now(),
                rightInset: 16,
                safeTop: headerHeight,
                hoverX: hover?.x ?? null,
                hoverY: hover?.y ?? null,
                hoveringCenterline,
              })

              // Handle event group hover
              if (result.hoveredGroup && hover) {
                setEventGroupTooltip({
                  x: hover.x,
                  y: hover.y,
                  events: result.hoveredGroup,
                  visible: true,
                })
              } else {
                setEventGroupTooltip(null)
              }
            } catch (error) {
              console.error("Timeline drawing error:", error)
              ctx.fillStyle = "#0b0e12"
              ctx.fillRect(0, 0, size.width, size.height)
              ctx.fillStyle = "rgba(255,255,255,0.5)"
              ctx.font = "14px ui-sans-serif"
              ctx.textAlign = "center"
              ctx.fillText("Timeline rendering error - check console", size.width / 2, size.height / 2)
            }
          }
        }

        const mh = 36
        const miniWidth = Math.floor(size.width * dpr)
        const miniHeight = Math.floor(mh * dpr)

        if (miniWidth > 0 && miniHeight > 0) {
          if (m.width !== miniWidth || m.height !== miniHeight) {
            m.width = miniWidth
            m.height = miniHeight
            m.style.width = `${size.width}px`
            m.style.height = `${mh}px`
          }

          const mctx = m.getContext("2d")
          if (mctx) {
            try {
              mctx.setTransform(dpr, 0, 0, dpr, 0, 0)
              drawMinimap(mctx, {
                width: size.width,
                height: mh,
                centerTime: centerRef.current,
                msPerPx: msPerPxRef.current,
                events,
                nowMs: Date.now(),
              })
            } catch (error) {
              console.error("Minimap drawing error:", error)
              mctx.fillStyle = "#0d1116"
              mctx.fillRect(0, 0, size.width, mh)
            }
          }
        }
      }

      animationId = requestAnimationFrame(animate)
    }

    animate()
    return () => cancelAnimationFrame(animationId)
  }, [size, headerHeight, events, hover, hoveringCenterline])

  // follow now
  useEffect(() => {
    if (!followNow) return

    const interval = setInterval(() => {
      syncCenter(Date.now())
    }, 1000)

    return () => clearInterval(interval)
  }, [followNow])

  // click outside to close menu
  useEffect(() => {
    if (!menuOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        controlsRef.current &&
        !controlsRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [menuOpen])

  // wheel zoom
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    lastAnchorX.current = x

    const factor = e.deltaY > 0 ? 1.2 : 1 / 1.2
    setMsPerPxTarget((prev) => Math.max(1, Math.min(prev * factor, DAY)))
    setFollowNow(false)
  }, [])

  // pointer events
  const onPointerStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY

    setTouchState({
      active: true,
      moved: false,
      startX: clientX,
      startY: clientY,
      startCenter: centerRef.current,
      startMsPerPx: msPerPxRef.current,
    })
    setFollowNow(false)
  }, [])

  const onPointerMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return

      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY

      const x = clientX - rect.left
      const y = clientY - rect.top

      setHover({ x, y })

      // Check if hovering near centerline
      const midY = Math.round((headerHeight + size.height) / 2)
      const distanceFromCenterline = Math.abs(y - midY)
      setHoveringCenterline(distanceFromCenterline <= 30)

      if (touchState.active) {
        const dx = clientX - touchState.startX
        const dy = clientY - touchState.startY

        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
          setTouchState((prev) => ({ ...prev, moved: true }))
        }

        if (touchState.moved) {
          const newCenter = touchState.startCenter - dx * touchState.startMsPerPx
          syncCenter(newCenter)
        }
      }
    },
    [touchState, headerHeight, size.height],
  )

  const onPointerEnd = useCallback(() => {
    setTouchState({
      active: false,
      moved: false,
      startX: 0,
      startY: 0,
      startCenter: 0,
      startMsPerPx: 0,
    })
  }, [])

  const onTouchClick = useCallback(
    (e: React.TouchEvent) => {
      if (!touchState.moved && e.changedTouches.length > 0) {
        const rect = canvasRef.current!.getBoundingClientRect()
        const x = e.changedTouches[0].clientX - rect.left
        const y = e.changedTouches[0].clientY - rect.top
        handleTimelineClick(x, y)
      }
      onPointerEnd()
    },
    [touchState.moved, onPointerEnd],
  )

  // Extracted click logic for reuse
  const handleTimelineClick = (x: number, y: number) => {
    const cx = size.width / 2
    let timeAtX = centerRef.current + (x - cx) * msPerPxRef.current

    // Smart time snapping based on zoom level
    const { step } = chooseStep(msPerPxRef.current)
    const snapInterval = Math.max(step / 4, 60000) // minimum 1 minute snapping
    timeAtX = Math.round(timeAtX / snapInterval) * snapInterval

    // Check if we're near the centerline (within 30px vertically)
    const midY = Math.round((headerHeight + size.height) / 2)
    const distanceFromCenterline = Math.abs(y - midY)
    const centerlineThreshold = 30

    // nearest event within ~20px in time (larger for touch)
    let best = null,
      bestD = 20 * msPerPxRef.current
    for (const ev of events) {
      const d = Math.abs(ev.time - timeAtX)
      if (d < bestD) {
        bestD = d
        best = ev.id
      }
    }

    if (best) {
      setSelectedId(best)
      setDraft(null)
    } else if (distanceFromCenterline <= centerlineThreshold) {
      // Only allow event creation near the centerline
      const y_pos = midY
      const pad = 12
      const px = Math.max(pad, Math.min(size.width - 320, x - 160))
      const py = Math.max(headerHeight + pad, Math.min(size.height - 120, y_pos - 60))
      setDraft({
        time: timeAtX,
        x: px,
        y: py,
      })
      setSelectedId(null)
    }
  }

  // add event
  const addEvent = () => {
    if (!title.trim()) return

    let eventTime: number

    if (whenOption === "now") {
      eventTime = Date.now()
    } else if (whenOption === "custom" && at) {
      eventTime = new Date(at).getTime()
    } else if (draft) {
      eventTime = draft.time
    } else {
      return
    }

    const newEvent = {
      id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: title.trim(),
      time: eventTime,
    }

    setEvents((prev) => [...prev, newEvent])
    setTitle("")
    setWhenOption("now")
    setAt("")
    setDraft(null)
  }

  // delete event
  const deleteEvent = (id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id))
    setSelectedId(null)
  }

  const selectedEvent = selectedId ? events.find((e) => e.id === selectedId) : null

  const whenOptions = [
    { value: "now", label: "Right now" },
    { value: "custom", label: "Pick date & time..." },
  ]

  if (draft) {
    whenOptions.unshift({
      value: "draft",
      label: `At ${new Date(draft.time).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}`,
    })
  }

  return (
    <div className="shell" ref={shellRef}>
      {/* Event Group Tooltip */}
      {eventGroupTooltip && eventGroupTooltip.visible && (
        <div
          className="event-group-tooltip"
          style={{
            left: eventGroupTooltip.x,
            top: eventGroupTooltip.y,
          }}
        >
          <div className="tooltip-header">{eventGroupTooltip.events.length} events at this time</div>
          <div className="tooltip-events">
            {eventGroupTooltip.events.slice(0, 5).map((event) => (
              <div key={event.id} className="tooltip-event">
                {event.title}
              </div>
            ))}
            {eventGroupTooltip.events.length > 5 && (
              <div className="tooltip-more">+{eventGroupTooltip.events.length - 5} more</div>
            )}
          </div>
        </div>
      )}

      {/* Selected Event Details */}
      {selectedEvent && (
        <div className="selected-event-details">
          <div className="selected-event-header">
            <h3>{selectedEvent.title}</h3>
            <button className="close-btn" onClick={() => setSelectedId(null)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="selected-event-time">
            {new Date(selectedEvent.time).toLocaleString([], {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </div>
          <div className="selected-event-actions">
            <button className="delete-btn" onClick={() => deleteEvent(selectedEvent.id)}>
              Delete Event
            </button>
          </div>
        </div>
      )}

      {/* Draft Event Form */}
      {draft && (
        <div
          className="draft-form"
          style={{
            left: draft.x,
            top: draft.y,
          }}
        >
          <input
            type="text"
            placeholder="Event title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addEvent()
              if (e.key === "Escape") setDraft(null)
            }}
            autoFocus
          />
          <div className="draft-actions">
            <button onClick={addEvent} disabled={!title.trim()}>
              Add
            </button>
            <button onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* header */}
      <header className="header" ref={controlsRef}>
        <div className="title-input">
          <input
            type="text"
            placeholder="Event title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addEvent()}
          />
        </div>
        <div className="when-picker">
          <select value={whenOption} onChange={(e) => setWhenOption(e.target.value)}>
            {whenOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {whenOption === "custom" && (
            <CustomDateTimePicker value={at} onChange={setAt} placeholder="Pick date & time..." />
          )}
        </div>
        <button className="add" onClick={addEvent} disabled={!title.trim()}>
          Add Event
        </button>
        <div className="scale-chip">
          {meta.stage} • {meta.perTick} • {meta.range}
        </div>

        <div className="user-controls" style={{ marginLeft: "auto" }} ref={controlsRef}>
          <button
            className="toolbar-btn"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title={user?.email || "Account"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="7" r="4" />
              <path d="M5.5 21a6.5 6.5 0 0 1 13 0" />
            </svg>
          </button>
          {menuOpen && (
            <div className="menu" role="menu" ref={menuRef}>
              <div className="menu-header">
                <div className="menu-user">
                  <span className="avatar sm">{user?.displayName?.charAt(0) || user?.name?.charAt(0) || "?"}</span>
                  <div className="menu-user-meta">
                    <div className="menu-user-name">{user?.displayName || user?.name}</div>
                    <div className="menu-user-email">{user?.email}</div>
                  </div>
                </div>
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
                className="menu-item destructive"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  signOut()
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* canvases */}
      <canvas
        ref={canvasRef}
        className={`timeline-canvas ${hoveringCenterline ? "hovering-centerline" : ""} ${touchState.active && touchState.moved ? "panning" : ""}`}
        onWheel={onWheel}
        onMouseDown={onPointerStart}
        onMouseMove={onPointerMove}
        onMouseUp={onPointerEnd}
        onMouseLeave={() => {
          onPointerEnd()
          setEventGroupTooltip(null)
          setHoveringCenterline(false)
        }}
        onTouchStart={onPointerStart}
        onTouchMove={onPointerMove}
        onTouchEnd={onTouchClick}
        onTouchCancel={onPointerEnd}
        onClick={(e) => {
          if (!touchState.moved) {
            const rect = canvasRef.current!.getBoundingClientRect()
            handleTimelineClick(e.clientX - rect.left, e.clientY - rect.top)
          }
        }}
      />
      <div className="minimap-wrap">
        <canvas ref={miniRef} className="minimap" />
      </div>

      {/* Fixed sidebar toggle */}
      <button
        className="sidebar-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle Events"
        title="View all events"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span>Events</span>
      </button>

      {/* Enhanced Sidebar panel with only upcoming events */}
      <div className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <h3>Upcoming Events</h3>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="sidebar-content">
          {upcomingEvents.length === 0 ? (
            <div className="empty-state">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                opacity="0.5"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <p>No upcoming events</p>
              <small>Click on the timeline to add events</small>
            </div>
          ) : (
            <div className="events-list">
              {upcomingEvents.map((e) => (
                <div
                  className="event-card upcoming"
                  key={e.id}
                  onClick={() => {
                    setFollowNow(false)
                    syncCenter(e.time)
                    setSelectedId(e.id)
                    setSidebarOpen(false)
                  }}
                >
                  <div className="event-title">{e.title}</div>
                  <div className="event-time">
                    {new Date(e.time).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
