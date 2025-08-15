"use client"

import type React from "react"
import { useRef, useEffect, useState } from "react"
import { drawTimeline } from "../lib/timeline-canvas"

interface TimelineViewProps {
  timeline: any
  onEventAdd?: (event: any) => void
  onEventUpdate?: (event: any) => void
  onEventDelete?: (eventId: string) => void
}

export function TimelineView({ timeline, onEventAdd, onEventUpdate, onEventDelete }: TimelineViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [newEvent, setNewEvent] = useState({
    title: "",
    description: "",
    time: new Date().toISOString().slice(0, 16),
    category: "general",
  })

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        canvasRef.current.width = rect.width
        canvasRef.current.height = 400

        drawTimeline(ctx, {
          width: rect.width,
          height: 400,
          centerTime: Date.now(),
          msPerPx: 60000,
          events: timeline.events || [],
          nowMs: Date.now(),
        })
      }
    }

    handleResize()
    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
    }
  }, [timeline.events])

  const handleAddEvent = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEvent.title.trim()) return

    const event = {
      id: Date.now().toString(),
      title: newEvent.title,
      description: newEvent.description,
      time: new Date(newEvent.time).toISOString(),
      category: newEvent.category,
      completed: false,
    }

    onEventAdd?.(event)
    setNewEvent({
      title: "",
      description: "",
      time: new Date().toISOString().slice(0, 16),
      category: "general",
    })
    setShowAddEvent(false)
  }

  return (
    <div className="timeline-view">
      <div className="timeline-controls">
        <button className="btn btn-primary" onClick={() => setShowAddEvent(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Event
        </button>
      </div>

      <div ref={containerRef} className="timeline-canvas-container">
        <canvas
          ref={canvasRef}
          className="timeline-canvas"
          style={{ width: "100%", height: "400px", border: "1px solid var(--border)" }}
        />
      </div>

      {/* Add Event Modal */}
      {showAddEvent && (
        <div className="modal-overlay" onClick={() => setShowAddEvent(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Add Event</div>
              <button className="modal-close" onClick={() => setShowAddEvent(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAddEvent}>
              <div className="form-group">
                <label className="form-label">Title</label>
                <input
                  type="text"
                  className="input"
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  placeholder="Event title"
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="input"
                  value={newEvent.description}
                  onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                  placeholder="Event description (optional)"
                  rows={3}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Date & Time</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={newEvent.time}
                  onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Category</label>
                <select
                  className="input"
                  value={newEvent.category}
                  onChange={(e) => setNewEvent({ ...newEvent, category: e.target.value })}
                >
                  <option value="general">General</option>
                  <option value="work">Work</option>
                  <option value="personal">Personal</option>
                  <option value="milestone">Milestone</option>
                </select>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setShowAddEvent(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Add Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
