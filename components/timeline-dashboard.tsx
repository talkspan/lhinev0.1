"use client"

import type React from "react"
import { TimelineView } from "./timeline-view"
import { useState } from "react"
import { useAuth } from "./auth-provider"

export function TimelineDashboard() {
  const { user, timelines, currentTimeline, createTimeline, selectTimeline, deleteTimeline, updateTimeline, signOut } =
    useAuth()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newTimelineName, setNewTimelineName] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [newlyCreatedId, setNewlyCreatedId] = useState<string | null>(null)
  const [editingTimelineId, setEditingTimelineId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)

  const handleCreateTimeline = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTimelineName.trim()) return

    setIsCreating(true)
    try {
      const timeline = await createTimeline(newTimelineName.trim())
      setNewlyCreatedId(timeline.id)
      setNewTimelineName("")
      setShowCreateModal(false)

      // Remove the highlight effect after animation completes
      setTimeout(() => {
        setNewlyCreatedId(null)
      }, 600)
    } finally {
      setIsCreating(false)
    }
  }

  const handleDeleteTimeline = async (timelineId: string) => {
    if (timelines.length <= 1) {
      alert("You can't delete your last timeline")
      return
    }
    await deleteTimeline(timelineId)
    setShowDeleteConfirm(null)
  }

  const handleRenameTimeline = async (timelineId: string) => {
    if (!editingName.trim() || editingName === timelines.find((t) => t.id === timelineId)?.name) {
      setEditingTimelineId(null)
      setEditingName("")
      return
    }

    const timeline = timelines.find((t) => t.id === timelineId)
    if (timeline) {
      const updatedTimeline = { ...timeline, name: editingName.trim() }
      await updateTimeline(updatedTimeline)
      setEditingTimelineId(null)
      setEditingName("")
    }
  }

  const startEditing = (timeline: any) => {
    setEditingTimelineId(timeline.id)
    setEditingName(timeline.name)
  }

  const cancelEditing = () => {
    setEditingTimelineId(null)
    setEditingName("")
  }

  const getTimelineStats = (timeline: any) => {
    const totalEvents = timeline.events.length
    const completedEvents = timeline.events.filter((event: any) => event.completed).length
    const upcomingEvents = timeline.events.filter((event: any) => new Date(event.time) > new Date()).length
    const pastEvents = timeline.events.filter((event: any) => new Date(event.time) < new Date()).length

    return { totalEvents, completedEvents, upcomingEvents, pastEvents }
  }

  const handleAddEvent = async (event: any) => {
    if (!currentTimeline) return

    const updatedTimeline = {
      ...currentTimeline,
      events: [...(currentTimeline.events || []), event],
      updatedAt: new Date().toISOString(),
    }

    await updateTimeline(updatedTimeline)
  }

  return (
    <div className="app-container">
      <header className="header">
        <div className="logo">Timeline</div>
        <nav className="nav">
          <div className="timeline-selector">
            <select
              value={currentTimeline?.id || ""}
              onChange={(e) => selectTimeline(e.target.value)}
              className="timeline-select"
            >
              {timelines.map((timeline) => (
                <option key={timeline.id} value={timeline.id}>
                  {timeline.name}
                </option>
              ))}
            </select>
          </div>

          <div className="user-menu">
            <button className="user-trigger" onClick={() => setShowUserMenu(!showUserMenu)}>
              <div className="user-avatar">{user?.displayName?.charAt(0) || "?"}</div>
              <span>{user?.displayName}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6,9 12,15 18,9" />
              </svg>
            </button>

            {showUserMenu && (
              <div className="user-dropdown">
                <div className="user-info">
                  <div className="user-name">{user?.displayName}</div>
                  <div className="user-email">{user?.email}</div>
                </div>
                <button className="user-menu-item" onClick={signOut}>
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
        </nav>
      </header>

      <div className="main-content">
        <div className="content-area">
          {/* Timeline Management Section - Always visible and centered */}
          <div className="timeline-management-section">
            <div className="section-header">
              <h2>Timelines</h2>
              <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{ marginRight: "8px" }}
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                New
              </button>
            </div>

            {timelines.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-title">No timelines yet</div>
                <div className="empty-state-description">Create your first timeline to get started</div>
                <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
                  Create timeline
                </button>
              </div>
            ) : (
              <div className="timelines-list">
                {timelines.map((timeline) => {
                  const stats = getTimelineStats(timeline)
                  const isEditing = editingTimelineId === timeline.id
                  const isActive = currentTimeline?.id === timeline.id

                  return (
                    <div
                      key={timeline.id}
                      className={`timeline-row ${isActive ? "active" : ""} ${newlyCreatedId === timeline.id ? "newly-created" : ""}`}
                    >
                      {isEditing ? (
                        <div className="timeline-edit-form">
                          <input
                            type="text"
                            className="timeline-edit-input"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRenameTimeline(timeline.id)
                              if (e.key === "Escape") cancelEditing()
                            }}
                            autoFocus
                          />
                          <div className="timeline-edit-actions">
                            <button className="btn btn-ghost btn-sm" onClick={() => handleRenameTimeline(timeline.id)}>
                              ✓
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={cancelEditing}>
                              ✕
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="timeline-info" onClick={() => selectTimeline(timeline.id)}>
                            <div className="timeline-name">
                              {timeline.name}
                              {isActive && <span className="active-dot">●</span>}
                            </div>
                            <div className="timeline-stats-mini">{stats.totalEvents} events</div>
                          </div>

                          <div className="timeline-actions">
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => startEditing(timeline)}
                              title="Rename"
                            >
                              ✏️
                            </button>

                            {timelines.length > 1 && (
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => setShowDeleteConfirm(timeline.id)}
                                title="Delete"
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Current Timeline Content - Displayed below management section */}
          {currentTimeline && (
            <div className="timeline-content">
              <div className="timeline-header">
                <h1>{currentTimeline.name}</h1>
                <div className="timeline-stats">
                  {(() => {
                    const stats = getTimelineStats(currentTimeline)
                    return `${stats.totalEvents} events • ${stats.completedEvents} completed • ${stats.upcomingEvents} upcoming • Last updated ${new Date(currentTimeline.updatedAt).toLocaleDateString()}`
                  })()}
                </div>
              </div>

              {/* Timeline Canvas or other content can go here */}
              <TimelineView timeline={currentTimeline} onEventAdd={handleAddEvent} />
            </div>
          )}

          {/* Empty State - Only shown when no timelines exist */}
          {timelines.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-title">Welcome to Timeline</div>
              <div className="empty-state-description">Create your first timeline to get started</div>

              <div style={{ marginTop: "40px", textAlign: "center" }}>
                <button
                  className="btn btn-primary"
                  onClick={() => setShowCreateModal(true)}
                  style={{ fontSize: "16px", padding: "16px 32px", marginBottom: "24px" }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{ marginRight: "12px" }}
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Create New Timeline
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Timeline Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Create timeline</div>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateTimeline}>
              <div className="form-group">
                <label htmlFor="timelineName" className="form-label">
                  Name
                </label>
                <input
                  id="timelineName"
                  type="text"
                  className="input"
                  value={newTimelineName}
                  onChange={(e) => setNewTimelineName(e.target.value)}
                  placeholder="Project timeline, Personal goals..."
                  maxLength={100}
                  required
                  autoFocus
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={!newTimelineName.trim() || isCreating} className="btn btn-primary">
                  {isCreating ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Delete Timeline</div>
              <button className="modal-close" onClick={() => setShowDeleteConfirm(null)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="modal-body">
              <p>
                Are you sure you want to delete "
                <strong>{timelines.find((t) => t.id === showDeleteConfirm)?.name}</strong>"?
              </p>
              <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginTop: "8px" }}>
                This action cannot be undone. All events in this timeline will be permanently deleted.
              </p>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setShowDeleteConfirm(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={() => handleDeleteTimeline(showDeleteConfirm)}>
                Delete Timeline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
