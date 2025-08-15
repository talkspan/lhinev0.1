"use client"

import { useState, useRef, useEffect } from "react"

interface CustomDateTimePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function CustomDateTimePicker({
  value,
  onChange,
  placeholder = "Pick date & time...",
}: CustomDateTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState(() => {
    if (value) {
      const date = new Date(value)
      return {
        year: date.getFullYear(),
        month: date.getMonth(),
        day: date.getDate(),
        hour: date.getHours(),
        minute: date.getMinutes(),
      }
    }
    const now = new Date()
    return {
      year: now.getFullYear(),
      month: now.getMonth(),
      day: now.getDate(),
      hour: now.getHours(),
      minute: now.getMinutes(),
    }
  })

  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen])

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ]

  const dayNames = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate()
  }

  const getFirstDayOfMonth = (year: number, month: number) => {
    const firstDay = new Date(year, month, 1).getDay()
    return firstDay === 0 ? 6 : firstDay - 1 // Convert Sunday (0) to be last (6)
  }

  const handleDateSelect = (day: number) => {
    const newDate = { ...selectedDate, day }
    setSelectedDate(newDate)
    updateValue(newDate)
  }

  const handleTimeSelect = (hour: number, minute: number) => {
    const newDate = { ...selectedDate, hour, minute }
    setSelectedDate(newDate)
    updateValue(newDate)
  }

  const updateValue = (date: typeof selectedDate) => {
    const dateObj = new Date(date.year, date.month, date.day, date.hour, date.minute)
    // Format as local time string acceptable for datetime-local input (no timezone conversion)
    const y = dateObj.getFullYear()
    const m = String(dateObj.getMonth() + 1).padStart(2, "0")
    const d = String(dateObj.getDate()).padStart(2, "0")
    const hh = String(dateObj.getHours()).padStart(2, "0")
    const mm = String(dateObj.getMinutes()).padStart(2, "0")
    onChange(`${y}-${m}-${d}T${hh}:${mm}`)
  }

  const navigateMonth = (direction: 1 | -1) => {
    setSelectedDate((prev) => {
      let newMonth = prev.month + direction
      let newYear = prev.year

      if (newMonth > 11) {
        newMonth = 0
        newYear++
      } else if (newMonth < 0) {
        newMonth = 11
        newYear--
      }

      return { ...prev, month: newMonth, year: newYear }
    })
  }

  const setToday = () => {
    const now = new Date()
    const today = {
      year: now.getFullYear(),
      month: now.getMonth(),
      day: now.getDate(),
      hour: now.getHours(),
      minute: now.getMinutes(),
    }
    setSelectedDate(today)
    updateValue(today)
  }

  const clear = () => {
    onChange("")
    setIsOpen(false)
  }

  const formatDisplayValue = () => {
    if (!value) return placeholder
    const date = new Date(value)
    return date.toLocaleString([], {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(selectedDate.year, selectedDate.month)
    const firstDay = getFirstDayOfMonth(selectedDate.year, selectedDate.month)
    const days = []

    // Previous month's trailing days
    const prevMonth = selectedDate.month === 0 ? 11 : selectedDate.month - 1
    const prevYear = selectedDate.month === 0 ? selectedDate.year - 1 : selectedDate.year
    const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth)

    for (let i = firstDay - 1; i >= 0; i--) {
      days.push(
        <button
          key={`prev-${daysInPrevMonth - i}`}
          className="calendar-day prev-month"
          onClick={() => {
            navigateMonth(-1)
            handleDateSelect(daysInPrevMonth - i)
          }}
        >
          {daysInPrevMonth - i}
        </button>,
      )
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const isSelected = day === selectedDate.day
      const isToday = new Date().toDateString() === new Date(selectedDate.year, selectedDate.month, day).toDateString()

      days.push(
        <button
          key={day}
          className={`calendar-day ${isSelected ? "selected" : ""} ${isToday ? "today" : ""}`}
          onClick={() => handleDateSelect(day)}
        >
          {day}
        </button>,
      )
    }

    // Next month's leading days
    const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7
    const remainingCells = totalCells - (firstDay + daysInMonth)

    for (let day = 1; day <= remainingCells; day++) {
      days.push(
        <button
          key={`next-${day}`}
          className="calendar-day next-month"
          onClick={() => {
            navigateMonth(1)
            handleDateSelect(day)
          }}
        >
          {day}
        </button>,
      )
    }

    return days
  }

  const timeOptions = Array.from({ length: 24 }, (_, i) => i)
  const minuteOptions = [0, 15, 30, 45]

  return (
    <div className="custom-datetime-picker" ref={containerRef}>
      <button className="datetime-trigger" onClick={() => setIsOpen(!isOpen)}>
        <span>{formatDisplayValue()}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6,9 12,15 18,9" />
        </svg>
      </button>

      {isOpen && (
        <div className="datetime-popup">
          <div className="calendar-section">
            <div className="calendar-header">
              <button className="nav-btn" onClick={() => navigateMonth(-1)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15,18 9,12 15,6" />
                </svg>
              </button>
              <h3>
                {monthNames[selectedDate.month]} {selectedDate.year}
              </h3>
              <button className="nav-btn" onClick={() => navigateMonth(1)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9,18 15,12 9,6" />
                </svg>
              </button>
            </div>

            <div className="calendar-grid">
              <div className="day-headers">
                {dayNames.map((day) => (
                  <div key={day} className="day-header">
                    {day}
                  </div>
                ))}
              </div>
              <div className="calendar-days">{renderCalendar()}</div>
            </div>
          </div>

          <div className="time-section">
            <div className="time-header">Time</div>
            <div className="time-picker">
              <div className="time-column">
                <div className="time-label">Hour</div>
                <div className="time-options">
                  {timeOptions.map((hour) => (
                    <button
                      key={hour}
                      className={`time-option ${hour === selectedDate.hour ? "selected" : ""}`}
                      onClick={() => handleTimeSelect(hour, selectedDate.minute)}
                    >
                      {hour.toString().padStart(2, "0")}
                    </button>
                  ))}
                </div>
              </div>
              <div className="time-separator">:</div>
              <div className="time-column">
                <div className="time-label">Min</div>
                <div className="time-options">
                  {minuteOptions.map((minute) => (
                    <button
                      key={minute}
                      className={`time-option ${minute === selectedDate.minute ? "selected" : ""}`}
                      onClick={() => handleTimeSelect(selectedDate.hour, minute)}
                    >
                      {minute.toString().padStart(2, "0")}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="datetime-actions">
            <button className="action-btn clear" onClick={clear}>
              Clear
            </button>
            <button className="action-btn today" onClick={setToday}>
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
