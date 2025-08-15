// Timeline drawing utilities – fluid "now", centerline labels, and far-zoom decimation

// Enhanced helper for contextual time formatting
function formatContextualTime(timestamp: number) {
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

  // This week (within 7 days)
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

export const SEC = 1000
export const MIN = 60 * SEC
export const HOUR = 60 * MIN
export const DAY = 24 * HOUR
export const WEEK = 7 * DAY

// small cache to avoid reformatting the same labels repeatedly at far zoom
const labelCache = new Map<string, string>() // key: stepMs|bucket -> label string

export function getScaleMeta(msPerPx: number, visibleWidth: number) {
  const step = chooseStep(msPerPx)
  const perTick = step.label
  const stage = step.stage
  const range = fmtDuration(Math.max(1, visibleWidth) * msPerPx) + " across"
  return { stage, perTick, range }
}

export function chooseStep(msPerPx: number) {
  const pxPerMs = 1 / msPerPx
  const targetMs = 140 / pxPerMs // aim ~140px between major ticks
  const fixed = [
    1 * SEC,
    2 * SEC,
    5 * SEC,
    10 * SEC,
    15 * SEC,
    30 * SEC,
    1 * MIN,
    2 * MIN,
    5 * MIN,
    10 * MIN,
    15 * MIN,
    30 * MIN,
    1 * HOUR,
    2 * HOUR,
    3 * HOUR,
    6 * HOUR,
    12 * HOUR,
    1 * DAY,
    2 * DAY,
    7 * DAY,
    14 * DAY,
    30 * DAY,
    90 * DAY,
    180 * DAY,
    365 * DAY,
  ]
  let best = fixed[0]
  for (const s of fixed) if (Math.abs(s - targetMs) < Math.abs(best - targetMs)) best = s

  let label = "",
    stage = "Time"
  if (best < MIN) {
    label = `${Math.round(best / SEC)}s/tick`
    stage = "Seconds"
  } else if (best < HOUR) {
    label = `${Math.round(best / MIN)}m/tick`
    stage = "Minutes"
  } else if (best < DAY) {
    label = `${Math.round(best / HOUR)}h/tick`
    stage = "Hours"
  } else if (best < WEEK) {
    label = `${Math.round(best / DAY)}d/tick`
    stage = "Days"
  } else if (best < 30 * DAY) {
    label = `${Math.round(best / WEEK)}w/tick`
    stage = "Weeks"
  } else if (best < 365 * DAY) {
    label = `${Math.round(best / (30 * DAY))}mo/tick`
    stage = "Months-ish"
  } else {
    label = `${Math.round(best / (365 * DAY))}y/tick`
    stage = "Years-ish"
  }

  return { step: best, label, stage }
}

function fmtDuration(ms: number) {
  const abs = Math.abs(ms)
  const r = (n: number) => Math.round(n * 10) / 10
  if (abs < MIN) return `${r(ms / SEC)}s`
  if (abs < HOUR) return `${r(ms / MIN)}m`
  if (abs < DAY) return `${r(ms / HOUR)}h`
  if (abs < WEEK) return `${r(ms / DAY)}d`
  if (abs < 30 * DAY) return `${r(ms / WEEK)}w`
  if (abs < 365 * DAY) return `${r(ms / (30 * DAY))}mo`
  return `${r(ms / (365 * DAY))}y`
}

interface DrawTimelineOptions {
  width: number
  height: number
  centerTime: number
  msPerPx: number
  events: Array<{ id: string; title: string; time: number }>
  nowMs?: number | null
  rightInset?: number
  safeTop?: number
  hoverX?: number | null
  hoverY?: number | null
  hoveringCenterline?: boolean
}

export function drawTimeline(ctx: CanvasRenderingContext2D, opts: DrawTimelineOptions) {
  const {
    width,
    height,
    centerTime,
    msPerPx,
    events,
    nowMs,
    rightInset = 16,
    safeTop = 56,
    hoverX,
    hoverY,
    hoveringCenterline = false,
  } = opts

  const leftInset = 12
  const cx = width / 2 // visual center
  const visibleW = Math.max(1, width - leftInset - rightInset)
  const midY = Math.round((safeTop + height) / 2) // centerline
  const startMs = centerTime - (visibleW / 2) * msPerPx
  const endMs = centerTime + (visibleW / 2) * msPerPx

  // adapt detail: far zoom if major step >= ~1 month
  const { step: major } = chooseStep(msPerPx)
  const farZoom = major >= 30 * DAY

  // background
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = "#0b0e12"
  ctx.fillRect(0, 0, width, height)

  // center horizontal line with enhanced styling when hovering
  if (hoveringCenterline) {
    // Enhanced centerline when hovering
    ctx.strokeStyle = "rgba(74, 158, 255, 0.4)"
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(0, midY + 0.5)
    ctx.lineTo(width, midY + 0.5)
    ctx.stroke()

    // Add subtle glow effect
    ctx.strokeStyle = "rgba(74, 158, 255, 0.2)"
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(0, midY + 0.5)
    ctx.lineTo(width, midY + 0.5)
    ctx.stroke()

    // Add cursor position indicator
    if (hoverX !== null && hoverX !== undefined) {
      ctx.fillStyle = "rgba(74, 158, 255, 0.6)"
      ctx.beginPath()
      ctx.arc(hoverX, midY, 4, 0, Math.PI * 2)
      ctx.fill()

      // Add time preview
      const timeAtCursor = centerTime + (hoverX - cx) * msPerPx
      const { step } = chooseStep(msPerPx)
      const snapInterval = Math.max(step / 4, 60000)
      const snappedTime = Math.round(timeAtCursor / snapInterval) * snapInterval
      const timeStr = new Date(snappedTime).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })

      ctx.font = "11px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto"
      ctx.fillStyle = "rgba(74, 158, 255, 0.9)"
      ctx.textAlign = "center"
      ctx.fillText(timeStr, hoverX as number, midY - 12)
    }
  } else {
    // Normal centerline
    ctx.strokeStyle = "rgba(255,255,255,.14)"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, midY + 0.5)
    ctx.lineTo(width, midY + 0.5)
    ctx.stroke()
  }

  // vertical grid
  ctx.strokeStyle = "rgba(255,255,255,.08)"
  const first = Math.floor(startMs / major) * major
  const gridLines: number[] = []
  for (let t = first; t <= endMs + major; t += major) {
    const x = timeToX(t, cx, msPerPx, centerTime)
    if (x < leftInset - 40 || x > width - rightInset + 40) continue
    const xr = Math.round(x) + 0.5
    gridLines.push(xr)
    ctx.beginPath()
    ctx.moveTo(xr, 0)
    ctx.lineTo(xr, height)
    ctx.stroke()
  }

  // centerline tick labels (cached) - store positions for collision detection
  ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
  ctx.textAlign = "center"
  ctx.textBaseline = "bottom"
  ctx.fillStyle = "rgba(255,255,255,.9)"
  const keyBase = String(major) + "|"
  const gridLabelPositions: Array<{ x: number; y: number; width: number; height: number }> = []

  for (let t = first; t <= endMs + major; t += major) {
    const x = timeToX(t, cx, msPerPx, centerTime)
    if (x < leftInset - 40 || x > width - rightInset + 40) continue
    const bucket = Math.floor(t / major)
    const cacheKey = keyBase + bucket
    let label = labelCache.get(cacheKey)
    if (!label) {
      const d = new Date(t)
      label = formatTickLabel(d, major)
      labelCache.set(cacheKey, label)
      if (labelCache.size > 2500) labelCache.clear()
    }
    ctx.fillText(label, x, midY - 6)

    // Store grid label position for collision detection
    const labelWidth = ctx.measureText(label).width
    gridLabelPositions.push({
      x: x - labelWidth / 2,
      y: midY - 18,
      width: labelWidth,
      height: 12,
    })
  }

  // relative ± pins: skip at far zoom to reduce draw cost
  if (!farZoom && nowMs !== null && nowMs !== undefined) {
    drawRelPins(ctx, startMs, endMs, (tt) => timeToX(tt, cx, msPerPx, centerTime), nowMs as number, midY + 6)
  }

  // events — collapse multiple markers sharing the same pixel column
  let highlightId: string | null = null
  let hoveredGroup: Array<{ id: string; title: string; time: number }> | null = null
  const threshPx = 20
  const currentTime = Date.now()

  if (!farZoom && hoverX !== null && hoverY !== null && hoverX !== undefined && hoverY !== undefined) {
    // hover detection for selection
    let best = Number.POSITIVE_INFINITY
    for (const ev of events) {
      const x = timeToX(ev.time, cx, msPerPx, centerTime)
      if (x < leftInset - 40 || x > width - rightInset + 40) continue
      const d = Math.hypot(hoverX - x, hoverY - midY)
      if (d < best && d <= threshPx) {
        best = d
        highlightId = ev.id
      }
    }
  }

  if (!farZoom) {
    ctx.textAlign = "left"
    ctx.textBaseline = "middle"
    ctx.font = "13px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto"

    // Group events that are close together to avoid overlap
    const visibleEvents = events
      .map((ev) => ({
        ...ev,
        x: timeToX(ev.time, cx, msPerPx, centerTime),
        isPast: ev.time < currentTime - 60000,
      }))
      .filter((ev) => ev.x >= leftInset - 40 && ev.x <= width - rightInset + 40)
      .sort((a, b) => a.x - b.x)

    // Group nearby events
    const eventGroups: Array<typeof visibleEvents> = []
    let currentGroup: typeof visibleEvents = []

    for (const ev of visibleEvents) {
      if (currentGroup.length === 0 || ev.x - currentGroup[currentGroup.length - 1].x > 80) {
        if (currentGroup.length > 0) eventGroups.push(currentGroup)
        currentGroup = [ev]
      } else {
        currentGroup.push(ev)
      }
    }
    if (currentGroup.length > 0) eventGroups.push(currentGroup)

    // Draw each group with enhanced visibility
    for (const group of eventGroups) {
      const groupCenter = group.reduce((sum, ev) => sum + ev.x, 0) / group.length
      const xr = Math.round(groupCenter) + 0.5

      // Enhanced vertical line for better visibility
      const lineHeight = group.length > 1 ? 24 : 18
      const isPastGroup = group.every((ev) => ev.isPast)

      // Visually de-emphasize past events while keeping them interactive
      ctx.save()
      if (isPastGroup) {
        ctx.globalAlpha = 0.45
      }

      // Check if this group is being hovered
      const isHoveredByEvent = group.some((ev) => ev.id === highlightId)
      // Also treat hovering near the group's center line as hover
      const nearGroupCenter =
        hoverX != null &&
        hoverY != null &&
        Math.abs((hoverX as number) - xr) <= 12 &&
        Math.abs((hoverY as number) - midY) <= lineHeight + 6
      if ((isHoveredByEvent || nearGroupCenter) && group.length > 1) {
        hoveredGroup = group
      }

      // Draw background glow for better visibility
      if (group.length > 1) {
        ctx.strokeStyle = isPastGroup ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.12)"
        ctx.lineWidth = 6
        ctx.beginPath()
        ctx.moveTo(xr, midY - lineHeight)
        ctx.lineTo(xr, midY + lineHeight)
        ctx.stroke()
      }

      // Main event line
      ctx.strokeStyle = isPastGroup ? "rgba(255,255,255,.3)" : "rgba(255,255,255,.7)"
      ctx.lineWidth = group.length > 1 ? 2.5 : 1.5
      ctx.beginPath()
      ctx.moveTo(xr, midY - lineHeight)
      ctx.lineTo(xr, midY + lineHeight)
      ctx.stroke()

      // Enhanced event marker dot
      const dotSize = group.length > 1 ? 4 : 2.5
      ctx.fillStyle = isPastGroup ? "rgba(168, 177, 188, .8)" : "rgba(255,255,255,.9)"
      ctx.beginPath()
      ctx.arc(xr, midY, dotSize, 0, Math.PI * 2)
      ctx.fill()

      // Add count indicator for multiple events
      if (group.length > 1) {
        ctx.fillStyle = isPastGroup ? "rgba(168, 177, 188, .9)" : "rgba(255,255,255,1)"
        ctx.font = "600 10px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto"
        ctx.textAlign = "center"
        ctx.fillText(group.length.toString(), xr, midY - dotSize - 8)
      }

      // Highlight if hovered - enhanced ring
      if (group.some((ev) => ev.id === highlightId)) {
        ctx.strokeStyle = isPastGroup ? "rgba(168, 177, 188, 1)" : "rgba(255,255,255,1)"
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(xr, midY, dotSize + 4, 0, Math.PI * 2)
        ctx.stroke()
      }

      // Always show labels for better "what's here" visibility
      const shouldShowLabel = true // Show all labels for better visibility

      if (shouldShowLabel) {
        const mainEvent = group.find((ev) => ev.id === highlightId) || group[0]
        const contextualTime = formatContextualTime(mainEvent.time)

        let label: string
        let subLabel = ""

        if (group.length === 1) {
          label = mainEvent.title
          subLabel = contextualTime
        } else {
          label = `${group.length} events`
          subLabel = contextualTime
        }

        const pad = 8
        ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto"
        const labelWidth = ctx.measureText(label).width
        ctx.font = "10px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto"
        const subLabelWidth = ctx.measureText(subLabel).width
        const maxWidth = Math.max(labelWidth, subLabelWidth) + pad * 2
        const labelHeight = 38

        // Smart positioning - prefer above, fallback to below
        let labelX = Math.max(leftInset, Math.min(width - rightInset - maxWidth, xr - maxWidth / 2))
        let labelY = midY - lineHeight - labelHeight - 8

        // Check if label would go above safe area
        if (labelY < safeTop + 10) {
          labelY = midY + lineHeight + 8
        }

        // Check for collisions with grid labels and adjust position
        const proposedLabel = {
          x: labelX,
          y: labelY,
          width: maxWidth,
          height: labelHeight,
        }

        // Check collision with grid labels
        let hasCollision = false
        for (const gridLabel of gridLabelPositions) {
          if (rectsOverlap(proposedLabel, gridLabel)) {
            hasCollision = true
            break
          }
        }

        // If collision detected, try alternative positions
        if (hasCollision) {
          // Try offset to the side
          const sideOffset = 50
          labelX = Math.max(leftInset, Math.min(width - rightInset - maxWidth, xr + sideOffset))
          if (labelX + maxWidth > width - rightInset) {
            labelX = Math.max(leftInset, xr - sideOffset - maxWidth)
          }
        }

        // If hovering over the label itself, treat as hovered group
        if (
          hoverX !== null &&
          hoverX !== undefined &&
          hoverY !== null &&
          hoverY !== undefined &&
          (hoverX as number) >= labelX &&
          (hoverX as number) <= labelX + maxWidth &&
          (hoverY as number) >= labelY &&
          (hoverY as number) <= labelY + labelHeight
        ) {
          hoveredGroup = group
        }

        // Enhanced label background with better contrast
        roundedRect(ctx, labelX, labelY, maxWidth, labelHeight, 8)
        ctx.fillStyle = isPastGroup ? "rgba(0,0,0,.65)" : "rgba(0,0,0,.85)"
        ctx.fill()
        ctx.strokeStyle = isPastGroup ? "rgba(168,177,188,.35)" : "rgba(255,255,255,.25)"
        ctx.lineWidth = 1
        ctx.stroke()

        // Draw connecting line
        ctx.strokeStyle = isPastGroup ? "rgba(255,255,255,.2)" : "rgba(255,255,255,.3)"
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(xr, midY - lineHeight)
        ctx.lineTo(labelX + maxWidth / 2, labelY + labelHeight)
        ctx.stroke()

        // Draw main label text
        ctx.fillStyle = isPastGroup ? "rgba(199,205,214,.9)" : "rgba(255,255,255,1)"
        ctx.font = "600 12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto"
        ctx.textAlign = "center"
        ctx.fillText(label, labelX + maxWidth / 2, labelY + 16)

        // Draw sub label (time)
        ctx.fillStyle = isPastGroup ? "rgba(168,177,188,.8)" : "rgba(255,255,255,.8)"
        ctx.font = "400 10px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto"
        ctx.fillText(subLabel, labelX + maxWidth / 2, labelY + 30)
      }

      ctx.restore()
    }
  } else {
    // far zoom: enhanced minimal markers with count indicators
    const eventsByX = new Map<number, typeof events>()

    for (const ev of events) {
      const x = Math.round(timeToX(ev.time, cx, msPerPx, centerTime))
      if (x < leftInset - 2 || x > width - rightInset + 2) continue

      if (!eventsByX.has(x)) {
        eventsByX.set(x, [])
      }
      eventsByX.get(x)!.push(ev)
    }

    for (const [x, eventsAtX] of eventsByX) {
      const isPast = eventsAtX.every((ev) => ev.time < currentTime - 60000)
      const count = eventsAtX.length

      // Draw marker
      ctx.fillStyle = isPast ? "rgba(255,255,255,.4)" : "rgba(255,255,255,.8)"
      const markerHeight = Math.min(8, 2 + count)
      ctx.fillRect(x - 1, midY - markerHeight / 2, 2, markerHeight)

      // Draw count if multiple events
      if (count > 1) {
        ctx.fillStyle = isPast ? "rgba(255,255,255,.6)" : "rgba(255,255,255,1)"
        ctx.font = "600 8px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto"
        ctx.textAlign = "center"
        ctx.fillText(count.toString(), x, midY - markerHeight / 2 - 4)
      }
    }
  }

  // "NOW" red line with better positioned pill
  if (nowMs !== null && nowMs !== undefined) {
    const x = timeToX(nowMs as number, cx, msPerPx, centerTime)
    if (x > leftInset - 20 && x < width - rightInset + 20) {
      // Draw full continuous red line
      ctx.strokeStyle = "#ff3b30"
      ctx.lineWidth = 2
      const xr = Math.floor(x) + 0.5
      ctx.beginPath()
      ctx.moveTo(xr, safeTop + 50) // Start below the pill area
      ctx.lineTo(xr, height - 80) // End above the bottom UI
      ctx.stroke()

      // Format current time and date
      const now = new Date(nowMs as number)
      const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

      // Format date as "10th of August 2025"
      const day = now.getDate()
      const month = now.toLocaleDateString([], { month: "long" })
      const year = now.getFullYear()
      const suffix =
        day === 1 || day === 21 || day === 31
          ? "st"
          : day === 2 || day === 22
            ? "nd"
            : day === 3 || day === 23
              ? "rd"
              : "th"
      const dateStr = `${day}${suffix} of ${month} ${year}`

      // Measure text for proper centering
      ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto"
      const timeWidth = ctx.measureText(timeStr).width
      const dateWidth = ctx.measureText(dateStr).width
      const maxWidth = Math.max(timeWidth, dateWidth)
      const pillWidth = maxWidth + 12
      const pillHeight = 34

      // Position pill higher to avoid bottom UI collision
      const pillX = x - pillWidth / 2
      const pillY = safeTop + 12

      // Draw pill background
      roundedRect(ctx, pillX, pillY, pillWidth, pillHeight, 8)
      ctx.fillStyle = "rgba(0,0,0,.8)"
      ctx.fill()
      ctx.strokeStyle = "rgba(255, 59, 48, 0.4)"
      ctx.lineWidth = 1
      ctx.stroke()

      // Draw time (top line)
      ctx.fillStyle = "#ff6258"
      ctx.font = "600 13px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto"
      ctx.textAlign = "center"
      ctx.fillText(timeStr, x, pillY + 13)

      // Draw date (bottom line)
      ctx.fillStyle = "rgba(255, 98, 88, 0.7)"
      ctx.font = "400 9px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto"
      ctx.fillText(dateStr, x, pillY + 26)
    }
  }

  return { highlightId, hoveredGroup }
}

// Helper function to check if two rectangles overlap
function rectsOverlap(
  rect1: { x: number; y: number; width: number; height: number },
  rect2: { x: number; y: number; width: number; height: number },
): boolean {
  return !(
    rect1.x + rect1.width < rect2.x ||
    rect2.x + rect2.width < rect1.x ||
    rect1.y + rect1.height < rect2.y ||
    rect2.y + rect2.height < rect1.y
  )
}

interface DrawMinimapOptions {
  width: number
  height: number
  centerTime: number
  msPerPx: number
  events: Array<{ id: string; title: string; time: number }>
  nowMs?: number | null
  rightInset?: number
}

export function drawMinimap(ctx: CanvasRenderingContext2D, opts: DrawMinimapOptions) {
  const { width, height, centerTime, msPerPx, events, nowMs = null, rightInset = 16 } = opts

  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = "#0d1116"
  ctx.fillRect(0, 0, width, height)

  const miniMsPerPx = msPerPx * 20
  const leftInset = 12
  const cx = width / 2
  const visibleW = Math.max(1, width - leftInset - rightInset)
  const startMs = centerTime - (visibleW / 2) * miniMsPerPx
  const endMs = centerTime + (visibleW / 2) * miniMsPerPx

  const { step: major } = chooseStep(miniMsPerPx)
  ctx.strokeStyle = "rgba(255,255,255,.1)"
  ctx.lineWidth = 1
  const first = Math.floor(startMs / major) * major
  for (let t = first; t <= endMs + major; t += major) {
    const x = timeToX(t, cx, miniMsPerPx, centerTime)
    const xr = Math.round(x) + 0.5
    ctx.beginPath()
    ctx.moveTo(xr, 0)
    ctx.lineTo(xr, height)
    ctx.stroke()
  }

  // Enhanced events with count indicators
  const eventsByX = new Map<number, typeof events>()

  for (const ev of events) {
    const x = Math.round(timeToX(ev.time, cx, miniMsPerPx, centerTime))
    if (x < leftInset - 2 || x > width - rightInset + 2) continue

    if (!eventsByX.has(x)) {
      eventsByX.set(x, [])
    }
    eventsByX.get(x)!.push(ev)
  }

  for (const [x, eventsAtX] of eventsByX) {
    const count = eventsAtX.length
    ctx.fillStyle = count > 1 ? "rgba(255,255,255,1)" : "rgba(255,255,255,.7)"
    const markerHeight = Math.min(height - 12, 6 + count * 2)
    ctx.fillRect(x, 6, 2, markerHeight)
  }

  // now
  if (nowMs !== null) {
    const x = timeToX(nowMs, cx, miniMsPerPx, centerTime)
    if (x >= leftInset && x <= width - rightInset) {
      ctx.fillStyle = "#ff3b30"
      ctx.fillRect(Math.floor(x), 0, 2, height)
    }
  }

  // viewport box
  const viewW = (visibleW * msPerPx) / miniMsPerPx
  const viewX = cx - viewW / 2
  ctx.strokeStyle = "rgba(255,255,255,.65)"
  ctx.lineWidth = 1.2
  ctx.strokeRect(viewX, 2.5, viewW, height - 5)
}

/* ---------- helpers ---------- */
function timeToX(t: number, cx: number, msPerPx: number, centerTime: number) {
  return cx + (t - centerTime) / msPerPx
}

function formatTickLabel(d: Date, step: number) {
  if (step < MIN) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  if (step < HOUR) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  if (step < DAY) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  if (step < WEEK) return d.toLocaleDateString([], { month: "short", day: "numeric" })
  if (step < 30 * DAY) return d.toLocaleDateString([], { month: "short", day: "numeric" })
  if (step < 365 * DAY) return d.toLocaleDateString([], { year: "numeric", month: "short" })
  return d.getFullYear().toString()
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h / 2, w / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function drawRelPins(
  ctx: CanvasRenderingContext2D,
  startMs: number,
  endMs: number,
  xFromTime: (t: number) => number,
  nowMs: number,
  y0: number,
) {
  const range = endMs - startMs
  const steps = [
    SEC,
    5 * SEC,
    15 * SEC,
    30 * SEC,
    MIN,
    5 * MIN,
    15 * MIN,
    30 * MIN,
    HOUR,
    2 * HOUR,
    6 * HOUR,
    12 * HOUR,
    DAY,
    2 * DAY,
    3 * DAY,
    WEEK,
    2 * WEEK,
  ]
  let pick = steps[0]
  for (const s of steps) {
    const count = range / s
    if (count <= 18) {
      pick = s
      break
    }
  }

  ctx.save()
  ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
  ctx.textAlign = "center"
  ctx.textBaseline = "top"
  ctx.fillStyle = "rgba(255,255,255,.86)"
  ctx.strokeStyle = "rgba(255,255,255,.12)"

  // Track used labels to avoid duplicates
  const usedLabels = new Set<string>()

  for (const dir of [-1, 1]) {
    for (let k = 1; ; k++) {
      const t = nowMs + dir * k * pick
      if (t < startMs || t > endMs) break
      const x = xFromTime(t)
      const xr = Math.round(x) + 0.5

      const label = fmtShort(dir * k * pick)

      // Skip if we've already used this label
      if (usedLabels.has(label)) continue
      usedLabels.add(label)

      ctx.beginPath()
      ctx.moveTo(xr, y0)
      ctx.lineTo(xr, y0 + 12)
      ctx.stroke()
      ctx.fillText(label, x, y0 + 14)
    }
  }
  ctx.restore()
}

function fmtShort(ms: number) {
  const a = Math.abs(ms)
  if (a < MIN) return (ms < 0 ? "−" : "+") + Math.round(a / SEC) + "s"
  if (a < HOUR) return (ms < 0 ? "−" : "+") + Math.round(a / MIN) + "m"
  if (a < DAY) return (ms < 0 ? "−" : "+") + Math.round(a / HOUR) + "h"
  if (a < WEEK) return (ms < 0 ? "−" : "+") + Math.round(a / DAY) + "d"
  return (ms < 0 ? "−" : "+") + Math.round(a / WEEK) + "w"
}
