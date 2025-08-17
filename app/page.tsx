"use client"

import type React from "react"
import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { drawTimeline, drawMinimap, getScaleMeta, DAY, chooseStep } from "../lib/timeline-canvas"
import { CustomDateTimePicker } from "../components/custom-date-time-picker"
import { useAuth } from "../components/auth-provider"
import { HomePage } from "../components/home-page"
import { ProfileSetup } from "../components/profile-setup"
import { TimelineDashboard } from "../components/timeline-dashboard"

export default function App() {
  const { user, currentTimeline, updateTimeline, showDashboard, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading Timeline Planner...</p>
        </div>
      </div>
    )
  }

  if (!user) return <HomePage />
  if (!user.displayName || user.displayName === user.name) return <ProfileSetup />

  if (!currentTimeline || showDashboard) return <TimelineDashboard />
  return <TimelinePlanner />
}

function TimelinePlanner() {
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

  // events
  const [events, setEvents] = useState<Array<{ id: string; title: string; time: number }>>([])

  useEffect(() => {
    if (currentTimeline) {
      setEvents(currentTimeline.events || [])
    } else {
      setEvents([])
    }
  }, [currentTimeline])

  const updateTimelineCallback = useCallback(
    (updatedTimeline: any) => {
      updateTimeline(updatedTimeline)
    },
    [updateTimeline],
  )

  const saveEventsToTimeline = useCallback(() => {
    if (currentTimeline) {
      const updatedTimeline = {
        ...currentTimeline,
        events: events,
      }
      updateTimelineCallback(updatedTimeline)
    }
  }, [currentTimeline, events, updateTimelineCallback])

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

  const [activeNotifications, setActiveNotifications] = useState<
    Array<{
      id: string
      title: string
      time: number
      timestamp: number
    }>
  >([])

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("planner.notified", JSON.stringify([...notified]))
    }
  }, [notified])

  // permission
  const [notifyReady, setNotifyReady] = useState(false)
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!("Notification" in window)) return
    if (Notification.permission === "granted") setNotifyReady(true)
    else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((p) => setNotifyReady(p === "granted"))
    }
  }, [])

  // UI
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const [hoveringCenterline, setHoveringCenterline] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isRecentering, setIsRecentering] = useState(false)

  // Event group tooltip state
  const [eventGroupTooltip, setEventGroupTooltip] = useState<{
    x: number
    y: number
    events: Array<{ id: string; title: string; time: number }>
    visible: boolean
  } | null>(null)

  // Touch handling state
  const [touchState, setTouchState] = useState<{
    active: boolean
    startX: number
    startY: number
    startCenter: number
    startMsPerPx: number
    lastX: number
    lastY: number
    lastT: number
    moved: boolean
    initialDistance: number | null
    isPinching: boolean
  }>({
    active: false,
    startX: 0,
    startY: 0,
    startCenter: 0,
    startMsPerPx: 0,
    lastX: 0,
    lastY: 0,
    lastT: 0,
    moved: false,
    initialDistance: null,
    isPinching: false,
  })

  // —— Upcoming tray anchored to a draggable FAB (free drag, no snap) ——
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const sidebar = document.querySelector(".sidebar")
      const toggle = document.querySelector(".sidebar-toggle")
      if (!sidebarOpen) return
      if (sidebar?.contains(e.target as Node)) return
      if (toggle?.contains(e.target as Node)) return
      setSidebarOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false)
    }
    if (typeof window !== "undefined") {
      window.addEventListener("mousedown", onDown)
      window.addEventListener("keydown", onEsc)
      return () => {
        window.removeEventListener("mousedown", onDown)
        window.removeEventListener("keydown", onEsc)
      }
    }
  }, [sidebarOpen])

  // "Now" text for button
  const [nowText, setNowText] = useState(() =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  )
  useEffect(() => {
    const id = setInterval(
      () => setNowText(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })),
      1000,
    )
    return () => clearInterval(id)
  }, [])

  // Enhanced event notifications with in-app notifications
  useEffect(() => {
    const id = setInterval(() => {
      const n = Date.now()
      const missed = events.filter((e) => e.time <= n && !notified.has(e.id))
      if (!missed.length) return

      const next = new Set(notified)
      for (const ev of missed) {
        try {
          if (notifyReady && typeof window !== "undefined" && "Notification" in window) {
            new Notification("Event occurred", { body: `${ev.title} • ${new Date(ev.time).toLocaleString()}` })
          }
        } catch {}

        // Add to active notifications
        setActiveNotifications((prev) => [
          ...prev,
          {
            id: ev.id,
            title: ev.title,
            time: ev.time,
            timestamp: Date.now(),
          },
        ])

        next.add(ev.id)
      }
      setNotified(next)
    }, 1000)
    return () => clearInterval(id)
  }, [events, notified, notifyReady])

  // Auto-remove notifications after 5 seconds
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now()
      setActiveNotifications((prev) => prev.filter((notif) => now - notif.timestamp < 5000))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // sizing
  useEffect(() => {
    const handle = () => {
      const r = shellRef.current?.getBoundingClientRect()
      setSize({
        width: Math.max(1, Math.floor(r?.width ?? (typeof window !== "undefined" ? window.innerWidth : 1200))),
        height: Math.max(1, Math.floor(r?.height ?? (typeof window !== "undefined" ? window.innerHeight : 800))),
      })
    }
    handle()
    const ro = new ResizeObserver(handle)
    if (shellRef.current) ro.observe(shellRef.current)
    if (typeof window !== "undefined") {
      window.addEventListener("resize", handle)
      return () => {
        ro.disconnect()
        window.removeEventListener("resize", handle)
      }
    }
    return () => ro.disconnect()
  }, [])

  // Measure header safe area (distance from canvas top to bottom of header)
  useEffect(() => {
    const measure = () => {
      const topbar = document.querySelector(".topbar") as HTMLElement | null
      const app = shellRef.current
      if (!topbar || !app) return
      const tb = topbar.getBoundingClientRect()
      const ar = app.getBoundingClientRect()
      const safe = Math.ceil(tb.bottom - ar.top + 24) // add margin below header
      if (safe && safe !== headerHeight) setHeaderHeight(safe)
    }
    measure()
    if (typeof window !== "undefined") {
      window.addEventListener("resize", measure)
      const obs = new ResizeObserver(measure)
      obs.observe(document.body)
      return () => {
        window.removeEventListener("resize", measure)
        obs.disconnect()
      }
    }
  }, [headerHeight])

  // Close account menu on outside click or Escape
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!menuOpen) return
      const target = e.target as Node
      if (controlsRef.current && controlsRef.current.contains(target)) return
      if (menuRef.current && menuRef.current.contains(target)) return
      setMenuOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false)
    }
    window.addEventListener("mousedown", onDown)
    window.addEventListener("keydown", onEsc)
    return () => {
      window.removeEventListener("mousedown", onDown)
      window.removeEventListener("keydown", onEsc)
    }
  }, [menuOpen])

  // animation loop
  const MAX_MS_PER_PX = 60 * DAY // tighter cap
  const MIN_MS_PER_PX = 10 // ~10ms/px
  const zoomVel = useRef(0)
  const panVel = useRef(0)
  const lastTick = useRef(performance.now())
  const lastAnchorX = useRef<number | null>(null)

  const lastCenterTimeRef = useRef(centerTime)
  const lastMsPerPxRef = useRef(msPerPx)
  const lastMsPerPxTargetRef = useRef(msPerPxTargetState)

  const doRecenter = useCallback(() => {
    setFollowNow(true)
    setIsRecentering(true)

    // Smooth animated recentering instead of instant jump
    const targetTime = Date.now()
    const startTime = centerRef.current
    const startTimestamp = performance.now()
    const duration = 800 // 800ms smooth animation

    const animateRecenter = (currentTimestamp: number) => {
      const elapsed = currentTimestamp - startTimestamp
      const progress = Math.min(elapsed / duration, 1)

      // Smooth easing function (ease-out-cubic)
      const easeProgress = 1 - Math.pow(1 - progress, 3)

      centerRef.current = startTime + (targetTime - startTime) * easeProgress

      if (progress < 1) {
        requestAnimationFrame(animateRecenter)
      } else {
        // Ensure we end exactly at the target
        centerRef.current = targetTime
        setIsRecentering(false)
      }
    }

    requestAnimationFrame(animateRecenter)
  }, [])

  const idleTimer = useRef<NodeJS.Timeout | null>(null)
  const scheduleReturnToNow = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(doRecenter, 60_000)
  }, [doRecenter])

  useEffect(() => {
    let raf = 0
    const accum = 0

    function loop() {
      raf = requestAnimationFrame(loop)
      const t = performance.now()
      const dt = Math.max(1, t - lastTick.current)
      lastTick.current = t

      // follow "now" or glide pan inertia
      if (followNow) {
        const target = Date.now()
        const mix = 1 - Math.pow(0.001, dt / 16)
        centerRef.current = centerRef.current + (target - centerRef.current) * mix
      } else if (Math.abs(panVel.current) > 0.1) {
        centerRef.current = centerRef.current + panVel.current * dt
        panVel.current *= Math.pow(0.9, dt / 16)
        if (Math.abs(panVel.current) <= 0.1) panVel.current = 0
      }

      // zoom inertia updates TARGET
      if (Math.abs(zoomVel.current) > 0.0003) {
        const factor = Math.exp(zoomVel.current * dt * 0.0012)
        msPerPxTargetRef.current = clamp(msPerPxTargetRef.current * factor, MIN_MS_PER_PX, MAX_MS_PER_PX)
        zoomVel.current *= Math.pow(0.88, dt / 16)
        if (Math.abs(zoomVel.current) <= 0.0003) zoomVel.current = 0
      }

      // ease current → target
      const mix = 1 - Math.pow(0.002, dt / 16)
      msPerPxRef.current = clamp(
        msPerPxRef.current + (msPerPxTargetRef.current - msPerPxRef.current) * mix,
        MIN_MS_PER_PX,
        MAX_MS_PER_PX,
      )

      // keep zoom anchor steady in screen space
      if (!followNow && lastAnchorX.current != null) {
        const cx = size.width / 2
        const x = Math.min(size.width - 1, Math.max(0, lastAnchorX.current))
        const anchorTime = centerRef.current + (x - cx) * msPerPxRef.current
        const newCenter = anchorTime - (x - cx) * msPerPxTargetRef.current
        centerRef.current = newCenter
      }

      // draw
      const c = canvasRef.current,
        m = miniRef.current
      if (c && m) {
        const dpr = Math.min((typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1, 2)

        if (c.width !== Math.floor(size.width * dpr) || c.height !== Math.floor(size.height * dpr)) {
          c.width = Math.floor(size.width * dpr)
          c.height = Math.floor(size.height * dpr)
          c.style.width = `${size.width}px`
          c.style.height = `${size.height}px`
        }
        const ctx = c.getContext("2d")
        if (ctx) {
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
        }

        const mh = 36
        if (m.width !== Math.floor(size.width * dpr) || m.height !== Math.floor(mh * dpr)) {
          m.width = Math.floor(size.width * dpr)
          m.height = Math.floor(mh * dpr)
          m.style.width = `${size.width}px`
          m.style.height = `${mh}px`
        }
        const mctx = m.getContext("2d")
        if (mctx) {
          mctx.setTransform(dpr, 0, 0, dpr, 0, 0)
          drawMinimap(mctx, {
            width: size.width,
            height: mh,
            centerTime: centerRef.current,
            msPerPx: msPerPxRef.current,
            events,
            nowMs: Date.now(),
            rightInset: 16,
          })
        }
      }

      // The animation loop now only handles refs and canvas drawing, no React state updates
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [events, size.width, size.height, followNow, hover, hoveringCenterline, headerHeight])

  // mouse drag to pan - FASTER SCROLLING
  const drag = useRef<{
    active: boolean
    startX: number
    startCenter: number
    lastX: number
    lastT: number
    moved: boolean
  }>({
    active: false,
    startX: 0,
    startCenter: 0,
    lastX: 0,
    lastT: 0,
    moved: false,
  })

  // Unified touch/mouse handlers
  const getTouchPoint = (e: React.TouchEvent | React.MouseEvent) => {
    if ("touches" in e) {
      return e.touches.length > 0 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null
    }
    return { x: e.clientX, y: e.clientY }
  }

  const getTouchDistance = (e: React.TouchEvent) => {
    if (e.touches.length < 2) return null
    const dx = e.touches[0].clientX - e.touches[1].clientX
    const dy = e.touches[0].clientY - e.touches[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  const onPointerStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    setFollowNow(false)
    scheduleReturnToNow()

    const point = getTouchPoint(e)
    if (!point) return

    const isPinch = "touches" in e && e.touches.length === 2
    const distance = isPinch && "touches" in e ? getTouchDistance(e) : null

    setTouchState({
      active: true,
      startX: point.x,
      startY: point.y,
      startCenter: centerRef.current,
      startMsPerPx: msPerPx.current,
      lastX: point.x,
      lastY: point.y,
      lastT: performance.now(),
      moved: false,
      initialDistance: distance,
      isPinching: isPinch,
    })

    if (canvasRef.current) {
      canvasRef.current.style.cursor = "grabbing"
      canvasRef.current.style.touchAction = "none"
    }
  }

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!e || !canvasRef.current) return

      const rect = canvasRef.current.getBoundingClientRect()
      if (!rect) return

      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      // Only update state if values actually changed
      if (hover?.x !== x || hover?.y !== y) {
        setHover({ x, y })
      }

      const centerlineY = (headerHeight + size.height) / 2;
      const isHoveringCenterline = Math.abs(y - centerlineY) < 20

      if (hoveringCenterline !== isHoveringCenterline) {
        setHoveringCenterline(isHoveringCenterline)
      }
    },
    [hover?.x, hover?.y, hoveringCenterline, headerHeight, size.height],
  )

  const onPointerEnd = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()

    setTouchState((prev) => ({
      ...prev,
      active: false,
      isPinching: false,
      initialDistance: null,
    }))

    if (canvasRef.current) {
      canvasRef.current.style.cursor = "default"
      canvasRef.current.style.touchAction = "auto"
    }
  }

  // Touch-specific click handler
  const onTouchClick = (e: React.TouchEvent) => {
    if (touchState.moved) return

    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const touch = e.changedTouches[0]
    const x = touch.clientX - rect.left
    const y = touch.clientY - rect.top

    // Simulate click event
    handleTimelineClick(x, y)
  }

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
        title: "",
        suggestedTime: formatSuggestedTime(timeAtX),
      })
      setSelectedId(null)
    }
    // If not near centerline and no event selected, do nothing (allow panning)
  }

  // WHEEL: **ZOOM by default** (hold Shift to pan). Much smoother with momentum - FASTER SCROLLING
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const cursorX = e.clientX - rect.left

    const dX = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX
    const dY = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY

    if (e.shiftKey) {
      // PAN - Increased speed
      setFollowNow(false)
      scheduleReturnToNow()
      const panDelta = Math.abs(dX) > Math.abs(dY) ? dX : dY
      centerRef.current += panDelta * msPerPxRef.current * 1.2 // increased from 0.5
      panVel.current += panDelta * msPerPxRef.current * 0.05 // increased from 0.02
      return
    }

    // ZOOM - much smoother with smaller steps and momentum
    lastAnchorX.current = followNow ? size.width / 2 : cursorX
    const raw = Math.abs(dY) > Math.abs(dX) ? dY : dX
    const zoomDelta = clamp(raw, -40, 40) * 0.5 // smaller, smoother steps

    // Add momentum to zoom velocity for smooth continuous zooming
    zoomVel.current += zoomDelta * 0.015
    zoomVel.current = clamp(zoomVel.current, -2, 2) // prevent runaway

    if (!followNow) scheduleReturnToNow()
  }

  // keyboard
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = ((e.target as HTMLElement)?.tagName || "").toLowerCase()
      if (tag === "input" || tag === "textarea" || tag === "select" || (e.target as HTMLElement)?.isContentEditable)
        return
      if (e.key === " " || e.code === "Space") {
        e.preventDefault()
        doRecenter()
      }
      if (e.key === "c" || e.key === "C") doRecenter()
      if (e.key === "Escape") {
        setSelectedId(null)
        setDraft(null)
        setSidebarOpen(false)
        setEventGroupTooltip(null)
      }
    }
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", onKeyDown)
      return () => window.removeEventListener("keydown", onKeyDown)
    }
  }, [doRecenter])

  // click to select OR quick-add at the centerline
  const [draft, setDraft] = useState<{
    time: number
    x: number
    y: number
    title: string
    suggestedTime: string
  } | null>(null)

  // Enhanced click handler with time snapping
  const onClick = (e: React.MouseEvent) => {
    if (drag.current.moved) return
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const cx = size.width / 2
    let timeAtX = centerRef.current + (x - cx) * msPerPxRef.current

    // Smart time snapping based on zoom level
    const { step } = chooseStep(msPerPxRef.current)
    const snapInterval = Math.max(step / 4, 60000) // minimum 1 minute snapping
    timeAtX = Math.round(timeAtX / snapInterval) * snapInterval

    // nearest event within ~15px in time
    let best = null,
      bestD = 15 * msPerPxRef.current
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
    } else {
      const midY = Math.round((headerHeight + size.height) / 2)
      const pad = 12
      const px = Math.max(pad, Math.min(size.width - 320, x - 160))
      const py = Math.max(headerHeight + pad, Math.min(size.height - 120, midY - 60))
      setDraft({
        time: timeAtX,
        x: px,
        y: py,
        title: "",
        suggestedTime: formatSuggestedTime(timeAtX),
      })
      setSelectedId(null)
    }
  }

  // Add via top bar with custom date time picker
  const [title, setTitle] = useState("")
  const [whenOption, setWhenOption] = useState("custom")
  const [at, setAt] = useState(() => new Date().toISOString().slice(0, 16)) // fallback datetime-local

  // When options for dropdown
  const whenOptions = [
    { value: "15m", label: "In 15 minutes" },
    { value: "30m", label: "In 30 minutes" },
    { value: "1h", label: "In 1 hour" },
    { value: "2h", label: "In 2 hours" },
    { value: "4h", label: "In 4 hours" },
    { value: "tomorrow-9", label: "Tomorrow 9:00 AM" },
    { value: "tomorrow-14", label: "Tomorrow 2:00 PM" },
    { value: "tomorrow-18", label: "Tomorrow 6:00 PM" },
    { value: "next-week", label: "Next Monday 9:00 AM" },
    { value: "custom", label: "Pick date & time..." },
  ]

  const getTimeFromOption = (option: string): number => {
    const now = Date.now()
    const today = new Date()

    // Get start of today for comparison
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const eventDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())

    const daysDiff = Math.floor((eventDate.getTime() - todayStart.getTime()) / (24 * 60 * 60 * 1000))
    const timeStr = eventDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

    // Today
    if (daysDiff === 0) {
      return now + Number.parseInt(option.slice(0, -1)) * 60 * 1000
    }

    // Tomorrow
    if (daysDiff === 1) {
      return new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 9, 0).getTime()
    }

    // This week (within 7 days and same week)
    if (daysDiff > 1 && daysDiff <= 6) {
      const dayName = eventDate.toLocaleDateString([], { weekday: "long" })
      return new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + Number.parseInt(option.slice(0, -1)),
        9,
        0,
      ).getTime()
    }

    // Next week (7-13 days)
    if (daysDiff >= 7 && daysDiff <= 13) {
      const dayName = eventDate.toLocaleDateString([], { weekday: "long" })
      return new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + Number.parseInt(option.slice(0, -1)),
        9,
        0,
      ).getTime()
    }

    // Same year but more than 2 weeks away
    if (eventDate.getFullYear() === today.getFullYear() && daysDiff > 13) {
      return new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + Number.parseInt(option.slice(0, -1)),
        9,
        0,
      ).getTime()
    }

    // Different year
    return new Date(
      today.getFullYear() + Number.parseInt(option.slice(0, -1)),
      today.getMonth(),
      today.getDate(),
      9,
      0,
    ).getTime()
  }

  const addEvent = () => {
    const t = getTimeFromOption(whenOption)
    if (!t || !title.trim()) return
    const ev = { id: cryptoRandomId(), title: title.trim(), time: t }
    setEvents((arr) => [...arr, ev].sort((a, b) => a.time - b.time))
    setTitle("")
    setWhenOption("custom")
    saveEventsToTimeline() // Manually update timeline when events change
  }

  // quick-add submit
  const submitDraft = (e: React.FormEvent) => {
    e.preventDefault()
    if (!draft) return
    const name = draft.title.trim()
    if (!name) return
    const ev = { id: cryptoRandomId(), title: name, time: draft.time }
    setEvents((arr) => [...arr, ev].sort((a, b) => a.time - b.time))
    setDraft(null)
    saveEventsToTimeline() // Manually update timeline when events change
  }

  const removeSelected = () => {
    if (!selectedId) return
    setEvents((arr) => arr.filter((e) => e.id !== selectedId))
    setSelectedId(null)
    saveEventsToTimeline() // Manually update timeline when events change
  }

  // Enhanced events list - only show upcoming events
  const upcomingEvents = useMemo(() => {
    const n = Date.now()
    return events.filter((e) => e.time > n + 60000).sort((a, b) => a.time - b.time) // Only future events
  }, [events])

  const meta = getScaleMeta(msPerPxRef.current, size.width - 16)

  return (
    <div className="app-shell" ref={shellRef}>
      {/* Active notifications */}
      {activeNotifications.length > 0 && (
        <div className="notifications">
          {activeNotifications.map((notif) => (
            <div key={notif.id} className="notification">
              <div className="notification-content">
                <div className="notification-title">{notif.title}</div>
                <div className="notification-time">Event occurred</div>
              </div>
              <button
                className="notification-close"
                onClick={() => setActiveNotifications((prev) => prev.filter((n) => n.id !== notif.id))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Event group tooltip */}
      {eventGroupTooltip && eventGroupTooltip.visible && (
        <div
          className="event-group-tooltip"
          style={{
            left: Math.min(eventGroupTooltip.x + 10, size.width - 300),
            top: Math.max(eventGroupTooltip.y - 10, headerHeight + 4),
          }}
        >
          <div className="tooltip-header">
            <span className="tooltip-count">{eventGroupTooltip.events.length} events</span>
            <span className="tooltip-time">{formatEventTime(eventGroupTooltip.events[0].time)}</span>
          </div>
          <div className="tooltip-events">
            {eventGroupTooltip.events.slice(0, 5).map((event) => (
              <div key={event.id} className="tooltip-event">
                <div className="tooltip-event-title">{event.title}</div>
                <div className="tooltip-event-time">
                  {new Date(event.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            ))}
            {eventGroupTooltip.events.length > 5 && (
              <div className="tooltip-more">+{eventGroupTooltip.events.length - 5} more events</div>
            )}
          </div>
        </div>
      )}

      {/* top bar */}
      <header className="topbar">
        <div className="brand">Planner</div>
        <input
          className="title-input"
          placeholder="What's happening?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="time-selection">
          <select className="when-select" value={whenOption} onChange={(e) => setWhenOption(e.target.value)}>
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
          onPointerEnd
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
        className="sidebar-toggle fixed"
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
                  <div className="event-time">{formatEta(e.time - Date.now())}</div>
                  <div className="event-date">{formatEventTime(e.time)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* now button */}
      <button className={`now-btn ${isRecentering ? "recentering" : ""}`} onClick={doRecenter} disabled={isRecentering}>
        {isRecentering ? "Centering..." : `Now ${nowText}`}
      </button>

      {/* selected event popover */}
      {selectedId && (
        <div className="popover">
          <div className="row">
            Selected: <strong>{events.find((e) => e.id === selectedId)?.title}</strong>
          </div>
          <div className="row">
            <button onClick={removeSelected}>Delete</button>
            <button onClick={() => setSelectedId(null)}>Close</button>
          </div>
        </div>
      )}

      {/* Enhanced quick-add popover */}
      {draft && (
        <form className="draft-pop" style={{ left: draft.x, top: draft.y }} onSubmit={submitDraft}>
          <div className="draft-header">
            <div className="draft-time-suggestion">{draft.suggestedTime}</div>
          </div>
          <div className="draft-row">
            <input
              autoFocus
              className="draft-input"
              placeholder="Event title..."
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Escape") setDraft(null)
              }}
            />
          </div>
          <div className="draft-row buttons">
            <button type="button" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button type="submit" disabled={!draft.title.trim()}>
              Add Event
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

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
  const r = [Math.random() * 2 ** 32, Math.random() * 2 ** 32]
  return Array.from(r, (n) => n.toString(36)).join("")
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}
