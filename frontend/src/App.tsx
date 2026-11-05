import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import logo from './assets/logo-full-transparent.svg'
import { api, getToken, UnauthorizedError, type EventSummary } from './api'
import { ConfirmDeleteButton } from './ConfirmDeleteButton'
import { EventForm } from './EventForm'
import { EventDetailView, type Section } from './EventDetailView'
import { LoginForm } from './LoginForm'
import { Sidebar } from './Sidebar'
import { UpdateButton } from './UpdateButton'
import {
  BORDER,
  DANGER,
  DEFAULT_PRIMARY,
  DEFAULT_SECONDARY,
  FONT_BODY,
  FONT_DISPLAY,
  SURFACE,
  SURFACE_2,
  TEXT,
  TEXT_FAINT,
  TEXT_MUTED,
  buttonStyle,
  pageStyle,
  panelHeadStyle,
  panelStyle,
  pillStyle,
  tableStyle,
  tdStyle,
  thStyle,
} from './theme'

const EVENT_STATUS_LABELS: Record<string, string> = {
  Draft: 'Inaktiv',
  Active: 'Aktiv',
  Archived: 'Archiviert',
}

const menuItemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  border: 'none',
  background: 'transparent',
  borderRadius: 0,
  padding: '0.5rem 0.9rem',
  fontSize: '0.85rem',
  cursor: 'pointer',
}

/**
 * "Einstellungen"-Dropdown pro Event-Zeile - wie im alten System
 * (event-actions.tsx: Icon-Trigger, Ansehen/Bearbeiten/Löschen/Status
 * ändern als Untermenü mit direktem Klick, keine Bestätigung außer beim
 * Löschen). "Status ändern" klappt hier inline statt als eigenes Flyout
 * auf, funktional aber gleich: drei direkt klickbare Status-Optionen.
 */
function EventActionsMenu({
  event,
  onOpen,
  onChanged,
}: {
  event: EventSummary
  onOpen: (section?: Section) => void
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [statusSubmenu, setStatusSubmenu] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (wrapRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
      setStatusSubmenu(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // The dropdown is portaled to document.body (see render below) so the
  // "Alle Events" card's overflow:hidden - needed for its rounded corners -
  // doesn't clip the menu once "Status ändern" makes it taller than the
  // card. Position is computed from the trigger button instead of relying
  // on CSS position:absolute within the (clipped) table.
  useEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
  }, [open])

  const setStatus = async (status: string) => {
    await api.setEventStatus(event.id, status)
    setOpen(false)
    setStatusSubmenu(false)
    onChanged()
  }

  const menuButtonHover = (bg: string) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = bg),
    onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = 'transparent'),
  })

  return (
    <div ref={wrapRef} style={{ display: 'inline-block' }} onClick={(e) => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Einstellungen"
        title="Einstellungen"
        style={{ ...buttonStyle('', 'secondary', 'sm'), fontSize: '1.1rem', lineHeight: 1, padding: '0.3rem 0.6rem' }}
      >
        ⋯
      </button>
      {open &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            className="regie"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: menuPos.top,
              right: menuPos.right,
              zIndex: 1000,
              minWidth: '13rem',
              background: SURFACE,
              color: TEXT,
              fontFamily: FONT_BODY,
              border: `1px solid ${BORDER}`,
              borderRadius: '0.5rem',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onOpen(undefined)
              }}
              {...menuButtonHover(SURFACE_2)}
              style={menuItemStyle}
            >
              Ansehen
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onOpen('event')
              }}
              {...menuButtonHover(SURFACE_2)}
              style={menuItemStyle}
            >
              Bearbeiten
            </button>
            <div style={{ borderTop: `1px solid ${BORDER}` }}>
              <button
                type="button"
                onClick={() => setStatusSubmenu((v) => !v)}
                {...menuButtonHover(SURFACE_2)}
                style={{ ...menuItemStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                Status ändern <span style={{ opacity: 0.6 }}>{statusSubmenu ? '▴' : '▾'}</span>
              </button>
              {statusSubmenu && (
                <div style={{ background: SURFACE_2 }}>
                  {Object.entries(EVENT_STATUS_LABELS).map(([status, label]) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setStatus(status)}
                      {...menuButtonHover('rgba(255,255,255,0.06)')}
                      style={{ ...menuItemStyle, paddingLeft: '1.6rem', fontWeight: status === event.status ? 700 : 400 }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ borderTop: `1px solid ${BORDER}`, padding: '0.4rem' }}>
              <ConfirmDeleteButton label={`"${event.name}" löschen`} size="sm" onConfirm={() => api.deleteEvent(event.id).then(onChanged)} />
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

type EventSortKey = 'name' | 'date' | 'location' | 'company' | 'status'

function SortableTh({
  label,
  sortKeyValue,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string
  sortKeyValue: EventSortKey
  sortKey: EventSortKey | null
  sortDir: 'asc' | 'desc'
  onSort: (key: EventSortKey) => void
}) {
  const active = sortKey === sortKeyValue
  return (
    <th style={{ ...thStyle(), cursor: 'pointer', userSelect: 'none' }} onClick={() => onSort(sortKeyValue)}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
        {label}
        <span style={{ opacity: active ? 1 : 0.3, fontSize: '0.7rem' }}>{active && sortDir === 'desc' ? '▼' : '▲'}</span>
      </span>
    </th>
  )
}

function App() {
  const [loggedIn, setLoggedIn] = useState(() => getToken() !== null)
  const [events, setEvents] = useState<EventSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [selectedEventSection, setSelectedEventSection] = useState<Section | undefined>(undefined)
  const [creatingEvent, setCreatingEvent] = useState(false)
  const [sortKey, setSortKey] = useState<EventSortKey | null>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const handleSort = (key: EventSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortedEvents = (() => {
    if (!sortKey) return events
    const dir = sortDir === 'asc' ? 1 : -1
    const compare: Record<EventSortKey, (a: EventSummary, b: EventSummary) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      date: (a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime(),
      location: (a, b) => a.location.localeCompare(b.location),
      company: (a, b) => a.customerName.localeCompare(b.customerName),
      status: (a, b) => (EVENT_STATUS_LABELS[a.status] ?? a.status).localeCompare(EVENT_STATUS_LABELS[b.status] ?? b.status),
    }
    return [...events].sort((a, b) => compare[sortKey](a, b) * dir)
  })()

  const reload = () => {
    api
      .listEvents()
      .then(setEvents)
      .catch((err: unknown) => {
        if (err instanceof UnauthorizedError) {
          setLoggedIn(false)
          return
        }
        setError(err instanceof Error ? err.message : String(err))
      })
  }

  useEffect(() => {
    if (loggedIn) reload()
  }, [loggedIn])

  if (!loggedIn) {
    return (
      <main
        className="regie"
        style={{
          ...pageStyle(DEFAULT_SECONDARY),
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.5rem',
        }}
      >
        <img src={logo} alt="LetsPlayDarts" height={64} />
        <LoginForm onLoggedIn={() => setLoggedIn(true)} />
      </main>
    )
  }

  if (selectedEventId) {
    return (
      <EventDetailView
        eventId={selectedEventId}
        initialSection={selectedEventSection}
        onBack={() => {
          setSelectedEventId(null)
          setSelectedEventSection(undefined)
        }}
        onLogout={() => {
          api.logout()
          setLoggedIn(false)
        }}
      />
    )
  }

  const doLogout = () => {
    api.logout()
    setLoggedIn(false)
  }

  if (creatingEvent) {
    return (
      <div
        className="regie"
        style={{ ...pageStyle(DEFAULT_SECONDARY), display: 'grid', gridTemplateColumns: '232px 1fr', minHeight: '100vh' }}
      >
        <Sidebar
          primary={DEFAULT_PRIMARY}
          footerActions={[{ label: 'Abmelden', onClick: doLogout }]}
          footerExtra={<UpdateButton />}
        />
        <main style={{ padding: '1.4rem 1.7rem 2.5rem' }}>
          <h1 style={{ margin: '0 0 1.3rem', fontSize: '1.5rem', fontFamily: FONT_DISPLAY }}>Neues Event</h1>
          <div style={{ ...panelStyle(), maxWidth: '40rem' }}>
            <div style={{ padding: '0.9rem 1.1rem' }}>
              <EventForm
                onCreated={() => {
                  reload()
                  setCreatingEvent(false)
                }}
              />
            </div>
          </div>
          <button type="button" onClick={() => setCreatingEvent(false)} style={{ marginTop: '1rem' }}>
            ← Abbrechen
          </button>
        </main>
      </div>
    )
  }

  return (
    <div
      className="regie"
      style={{ ...pageStyle(DEFAULT_SECONDARY), display: 'grid', gridTemplateColumns: '232px 1fr', minHeight: '100vh' }}
    >
      <Sidebar
        primary={DEFAULT_PRIMARY}
        footerActions={[{ label: 'Abmelden', onClick: doLogout }]}
        footerExtra={<UpdateButton />}
      />

      <main style={{ padding: '1.4rem 1.7rem 2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1.3rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontFamily: FONT_DISPLAY }}>Events</h1>
          <button type="button" className="primary" onClick={() => setCreatingEvent(true)}>
            + Neues Event
          </button>
        </div>
        {error && (
          <p role="alert" style={{ color: DANGER }}>
            Backend nicht erreichbar: {error}
          </p>
        )}

        <div style={panelStyle()}>
          <div style={panelHeadStyle()}>
            <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Alle Events</h2>
            <span style={{ fontSize: '0.75rem', color: TEXT_FAINT }}>{events.length} gesamt</span>
          </div>
          {!error && events.length === 0 && <p style={{ color: TEXT_MUTED, fontSize: '0.85rem', padding: '0 1.1rem 0.9rem' }}>Keine Events vorhanden.</p>}
          {events.length > 0 && (
            <table style={tableStyle()}>
              <thead>
                <tr>
                  <SortableTh label="Name" sortKeyValue="name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Datum" sortKeyValue="date" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Standort" sortKeyValue="location" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Firma" sortKeyValue="company" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Status" sortKeyValue="status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <th style={thStyle()}>Einstellungen</th>
                </tr>
              </thead>
              <tbody>
                {sortedEvents.map((event) => (
                  <tr
                    key={event.id}
                    onClick={() => setSelectedEventId(event.id)}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = SURFACE_2)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ ...tdStyle(), fontWeight: 600 }}>{event.name}</td>
                    <td style={{ ...tdStyle(), color: TEXT_MUTED }}>{new Date(event.eventDate).toLocaleDateString('de-DE')}</td>
                    <td style={{ ...tdStyle(), color: TEXT_FAINT }}>{event.location}</td>
                    <td style={{ ...tdStyle(), color: TEXT_MUTED }}>{event.customerName}</td>
                    <td style={tdStyle()}>
                      <span style={pillStyle(event.status === 'Active' ? 'on' : event.status === 'Draft' ? 'warn' : 'off')}>
                        {EVENT_STATUS_LABELS[event.status] ?? event.status}
                      </span>
                    </td>
                    <td style={tdStyle()}>
                      <EventActionsMenu
                        event={event}
                        onOpen={(section) => {
                          setSelectedEventId(event.id)
                          setSelectedEventSection(section)
                        }}
                        onChanged={reload}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
