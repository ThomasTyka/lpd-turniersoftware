import { useEffect, useRef, useState } from 'react'
import {
  api,
  type Board,
  type DeviceStatus,
  type EventDetail,
  type GameSettings,
  type LeaderboardEntry,
  type LeinwandScene,
  type LeinwandSettings,
  type PairingBoard,
  type Player,
  type TeamLeaderboardEntry,
  type Tournament,
  type TournamentOverview,
  type UnassignedDevice,
} from './api'
import { BoardOverview, type BoardOverviewStats } from './BoardOverview'
import { BrandingPanel } from './BrandingPanel'
import { DatePicker } from './DatePicker'
import { GamePanel } from './GamePanel'
import { KnockoutPanel } from './KnockoutPanel'
import { GroupPanel } from './GroupPanel'
import { TeamPanel } from './TeamPanel'
import { QrCode, useServerOrigin } from './QrCode'
import { Sidebar } from './Sidebar'
import { UpdateButton } from './UpdateButton'
import { ConfirmDeleteButton } from './ConfirmDeleteButton'
import {
  BORDER,
  DANGER,
  DEFAULT_PRIMARY,
  DEFAULT_SECONDARY,
  FONT_DISPLAY,
  TEXT,
  TEXT_FAINT,
  TEXT_MUTED,
  buttonStyle,
  pageStyle,
  panelHeadStyle,
  panelStyle,
  pillStyle,
  rowCardStyle,
  sectionHeadingStyle,
  statTileStyle,
  tableStyle,
  tdStyle,
  thStyle,
} from './theme'

const STATUS_LABELS: Record<string, string> = {
  Draft: 'Inaktiv',
  Active: 'Aktiv',
  Archived: 'Archiviert',
}

export type Section = 'dashboard' | 'event' | 'boards' | 'players' | 'teams' | 'leinwand' | 'devices' | 'tournaments' | 'branding'

const NAV_ITEMS: { id: Section; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'event', label: 'Event' },
  { id: 'boards', label: 'Boards' },
  { id: 'players', label: 'Spieler' },
  { id: 'teams', label: 'Teams' },
  { id: 'leinwand', label: 'Leinwand' },
  { id: 'devices', label: 'Geräte' },
  { id: 'tournaments', label: 'Turniere' },
  { id: 'branding', label: 'Branding' },
]

function NavIcon({ section }: { section: Section }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (section) {
    case 'dashboard':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="9" rx="1.5" />
          <rect x="14" y="3" width="7" height="5" rx="1.5" />
          <rect x="14" y="12" width="7" height="9" rx="1.5" />
          <rect x="3" y="16" width="7" height="5" rx="1.5" />
        </svg>
      )
    case 'event':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M3 9h18M8 2v4M16 2v4" />
        </svg>
      )
    case 'boards':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1" />
        </svg>
      )
    case 'players':
      return (
        <svg {...common}>
          <path d="M20 21a8 8 0 0 0-16 0" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      )
    case 'teams':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M2 21a7 7 0 0 1 14 0" />
          <path d="M16 4.5a3 3 0 0 1 0 5.8M22 21a7 7 0 0 0-5.5-6.8" />
        </svg>
      )
    case 'leinwand':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="14" rx="2" />
          <path d="M8 21h8M12 18v3" />
        </svg>
      )
    case 'devices':
      return (
        <svg {...common}>
          <rect x="5" y="2" width="14" height="20" rx="2" />
          <path d="M9 18h.01" />
        </svg>
      )
    case 'tournaments':
      return (
        <svg {...common}>
          <path d="M8 21h8M12 17v4M17 3H7a2 2 0 0 0-2 2v3a7 7 0 0 0 14 0V5a2 2 0 0 0-2-2Z" />
          <path d="M5 6H3a2 2 0 0 0 0 4h2M19 6h2a2 2 0 0 1 0 4h-2" />
        </svg>
      )
    case 'branding':
      return (
        <svg {...common}>
          <path d="M4 5h16M4 12h16M4 19h10" />
        </svg>
      )
  }
}

const panelTitleStyle: React.CSSProperties = { margin: 0, fontSize: '0.95rem', fontWeight: 600 }

const eventEditFieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem' }

/**
 * Inline edit for the event's core details ("Event bearbeiten") - Name,
 * Kunde, Datum, Ort. Was missing entirely until now (only branding and
 * planned board count had their own update endpoints).
 */
function EventEditForm({ event, onSaved, onCancel }: { event: EventDetail; onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState(event.name)
  const [customerName, setCustomerName] = useState(event.customerName)
  const [eventDate, setEventDate] = useState(event.eventDate.slice(0, 16))
  const [location, setLocation] = useState(event.location)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await api.updateEvent(event.id, { name, customerName, eventDate, location })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
      {error && (
        <p role="alert" style={{ color: DANGER, margin: 0 }}>
          {error}
        </p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))', gap: '0.7rem' }}>
        <label style={eventEditFieldStyle}>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label style={eventEditFieldStyle}>
          Kunde
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
        </label>
        <label style={eventEditFieldStyle}>
          Datum
          <DatePicker value={eventDate} onChange={setEventDate} required />
        </label>
        <label style={eventEditFieldStyle}>
          Ort
          <input value={location} onChange={(e) => setLocation(e.target.value)} required />
        </label>
      </div>
      <div style={{ display: 'flex', gap: '0.6rem' }}>
        <button type="button" onClick={onCancel} disabled={saving}>
          Abbrechen
        </button>
        <button type="submit" className="primary" disabled={saving}>
          {saving ? 'Wird gespeichert…' : 'Speichern'}
        </button>
      </div>
    </form>
  )
}

/**
 * Event-Status frei per Dropdown wählbar, jederzeit zu jedem Status
 * springbar - wie im alten System (dortiges "Status ändern"-Untermenü,
 * das direkt updateEvent(id, {status}) ohne Validierung aufrief). Ersetzt
 * die frühere Lösung mit geführten Aktivieren/Archivieren/Entarchivieren-
 * Buttons.
 */
function EventStatusControls({ eventId, status, onChanged }: { eventId: string; status: string; onChanged: () => void }) {
  const [value, setValue] = useState(status)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await api.setEventStatus(eventId, value)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', flexWrap: 'wrap' }}>
      {error && (
        <p role="alert" style={{ color: DANGER, margin: 0, fontSize: '0.78rem', flexBasis: '100%' }}>
          {error}
        </p>
      )}
      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem' }}>
        Status
        <select value={value} onChange={(e) => setValue(e.target.value)}>
          {Object.entries(STATUS_LABELS).map(([status, label]) => (
            <option key={status} value={status}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem' }}>
        <span aria-hidden style={{ visibility: 'hidden' }}>Status</span>
        <button type="button" className="primary" onClick={handleSave} disabled={saving || value === status}>
          {saving ? 'Wird gespeichert…' : 'Speichern'}
        </button>
      </label>
    </div>
  )
}

function StatTile({ label, value, unit, warn }: { label: string; value: string; unit?: string; warn?: boolean }) {
  return (
    <div style={statTileStyle()}>
      <p style={{ margin: '0 0 0.4rem', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: TEXT_FAINT }}>{label}</p>
      <p style={{ margin: 0, fontFamily: FONT_DISPLAY, fontSize: '1.6rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: warn ? DANGER : undefined }}>
        {value}
        {unit && <span style={{ fontSize: '0.85rem', color: TEXT_MUTED, fontWeight: 400, marginLeft: '0.4rem', fontFamily: 'system-ui' }}>{unit}</span>}
      </p>
    </div>
  )
}

type DashboardTab = 'boards' | 'leinwand' | 'greenscreen' | 'leaderboard'

const DASHBOARD_TAB_LABELS: Record<DashboardTab, string> = {
  boards: 'Board-Übersicht',
  leinwand: 'Leinwand',
  greenscreen: 'Greenscreen',
  leaderboard: 'Vorrunden-Rangliste',
}

/**
 * The dashboard's three views (Board-Übersicht, Leinwand, Vorrunden-
 * Rangliste) used to stack on top of each other in one long scroll - split
 * into tabs instead, same pattern as TournamentTabs below. BoardOverview
 * stays mounted (just hidden via display:none rather than unmounted) even
 * while another tab is active, because it's what drives the stat tiles
 * above the tabs via onStats - unmounting it on tab switch would freeze
 * those numbers whenever the Board-Übersicht tab isn't the active one.
 */
function DashboardTabs({
  event,
  onStats,
  onGameFinished,
  leaderboardRefreshSignal,
  onBestOfSaved,
}: {
  event: EventDetail
  onStats: (stats: BoardOverviewStats) => void
  onGameFinished: () => void
  leaderboardRefreshSignal: number
  onBestOfSaved: () => void
}) {
  const availableTabs: DashboardTab[] = [
    'boards',
    'leinwand',
    ...(event.boards.length > 0 ? (['greenscreen'] as const) : []),
    ...(event.tournaments[0] ? (['leaderboard'] as const) : []),
  ]
  const [tab, setTab] = useState<DashboardTab>('boards')
  const activeTab = availableTabs.includes(tab) ? tab : availableTabs[0]

  // Greenscreen is per-board (a chroma-key overlay for a stream, not an
  // event-wide view like Leinwand) - defaults to the first board, with a
  // dropdown to switch since an event can have several.
  const [greenscreenBoardId, setGreenscreenBoardId] = useState(event.boards[0]?.id ?? '')
  const selectedGreenscreenBoardId = event.boards.some((b) => b.id === greenscreenBoardId) ? greenscreenBoardId : (event.boards[0]?.id ?? '')

  return (
    <div style={panelStyle()}>
      <div style={panelHeadStyle()}>
        <div className="lpd-tabs">
          {availableTabs.map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={`lpd-tab${activeTab === t ? ' lpd-tab-active' : ''}`}>
              {DASHBOARD_TAB_LABELS[t]}
            </button>
          ))}
        </div>
        {activeTab === 'leinwand' && (
          <a href={`${window.location.origin}/?leinwand=${event.id}`} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem', color: 'inherit' }}>
            In neuem Tab öffnen ↗
          </a>
        )}
        {activeTab === 'greenscreen' && selectedGreenscreenBoardId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
            <select
              value={selectedGreenscreenBoardId}
              onChange={(e) => setGreenscreenBoardId(e.target.value)}
              style={{ fontSize: '0.8rem' }}
            >
              {[...event.boards]
                .sort((a, b) => a.number - b.number)
                .map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.name ?? `Board ${board.number}`}
                  </option>
                ))}
            </select>
            <a
              href={`${window.location.origin}/?greenscreen=${selectedGreenscreenBoardId}`}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: '0.8rem', color: 'inherit' }}
            >
              In neuem Tab öffnen ↗
            </a>
          </div>
        )}
      </div>
      <div style={{ padding: '0.9rem 1.1rem', display: activeTab === 'boards' ? 'block' : 'none' }}>
        <BoardOverview eventId={event.id} onGameFinished={onGameFinished} onStats={onStats} />
      </div>
      {activeTab === 'leinwand' && (
        <div style={{ padding: '0.9rem 1.1rem' }}>
          {/* Live preview, not just a link - the Leinwand's own fullscreen
              views size themselves in 100vh/100vw, which resolve against
              this iframe's own (much smaller) viewport rather than the
              Regie page's, so it renders correctly scaled down without
              any extra scaling trick. */}
          <iframe
            src={`${window.location.origin}/?leinwand=${event.id}`}
            title="Leinwand-Vorschau"
            style={{ width: '100%', aspectRatio: '16 / 9', border: `1px solid ${BORDER}`, borderRadius: '0.5rem' }}
          />
        </div>
      )}
      {activeTab === 'greenscreen' && selectedGreenscreenBoardId && (
        <div style={{ padding: '0.9rem 1.1rem' }}>
          {/* Same live-preview-via-iframe approach as Leinwand - the
              Greenscreen view fills its own viewport (100vh) with the
              chroma-key background, so it scales down correctly here too.
              Solid green with nothing else showing is expected whenever
              that board has no game running right now. */}
          <iframe
            src={`${window.location.origin}/?greenscreen=${selectedGreenscreenBoardId}`}
            title="Greenscreen-Vorschau"
            style={{ width: '100%', aspectRatio: '16 / 9', border: `1px solid ${BORDER}`, borderRadius: '0.5rem' }}
          />
        </div>
      )}
      {activeTab === 'leaderboard' && event.tournaments[0] && (
        <div style={{ padding: '0.9rem 1.1rem' }}>
          <Leaderboard
            eventId={event.id}
            tournamentId={event.tournaments[0].id}
            qualificationBestOf={event.tournaments[0].qualificationBestOf}
            refreshSignal={leaderboardRefreshSignal}
            onBestOfSaved={onBestOfSaved}
          />
        </div>
      )}
    </div>
  )
}

/**
 * Regie for one event - a persistent sidebar (event switcher + section nav)
 * next to a section-scoped content area, replacing the old single-column
 * stack of every section shown at once ("modern, animiert, automatisch im
 * Kunden-Branding", project plan 3.4 - a long bullet-list page didn't hold
 * up once there were 7+ sections). Panels use fixed dark "control room"
 * surfaces; only the accent (event primary) and the page wash (event
 * secondary) vary per event, so a customer's branding never breaks
 * legibility.
 */
export function EventDetailView({
  eventId,
  onBack,
  onLogout,
  initialSection,
}: {
  eventId: string
  onBack: () => void
  onLogout: () => void
  initialSection?: Section
}) {
  const [event, setEvent] = useState<EventDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [leaderboardRefreshSignal, setLeaderboardRefreshSignal] = useState(0)
  const [section, setSection] = useState<Section>(initialSection ?? 'dashboard')
  const [creatingPlayers, setCreatingPlayers] = useState(false)
  const [playerSearch, setPlayerSearch] = useState('')
  const [editingEvent, setEditingEvent] = useState(false)
  const [stats, setStats] = useState<BoardOverviewStats | null>(null)

  const reload = () => {
    api
      .getEvent(eventId)
      .then(setEvent)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }

  // Players (and boards/teams) can change from elsewhere - another open
  // Regie tab, a game finishing on a Tablet - so this polls rather than
  // fetching once, matching the "Live-Dashboard ... aktualisiert sich in
  // Echtzeit von selbst" goal (project plan 3.2) and the same precedent as
  // DeviceList's online-status polling below.
  useEffect(() => {
    reload()
    const interval = setInterval(reload, 5000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  if (error)
    return (
      <p role="alert" style={{ color: DANGER }}>
        {error}
      </p>
    )
  if (!event) return <p style={{ opacity: 0.7 }}>Lädt…</p>

  const primary = event.primaryColor ?? DEFAULT_PRIMARY
  const secondary = event.secondaryColor ?? DEFAULT_SECONDARY

  return (
    <div
      className="regie"
      style={
        {
          ...pageStyle(secondary),
          display: 'grid',
          gridTemplateColumns: '232px 1fr',
          minHeight: '100vh',
          '--regie-primary': primary,
        } as React.CSSProperties
      }
    >
      <Sidebar
        primary={primary}
        activeEventCard={{ name: event.name, customerName: event.customerName }}
        navItems={NAV_ITEMS.map((item) => ({
          id: item.id,
          label: item.label,
          icon: <NavIcon section={item.id} />,
          active: section === item.id,
          onClick: () => setSection(item.id),
        }))}
        footerActions={[
          { label: '← Events', onClick: onBack },
          { label: 'Abmelden', onClick: onLogout },
        ]}
        footerExtra={<UpdateButton />}
      />

      <main style={{ padding: '1.4rem 1.7rem 2.5rem', overflowX: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.3rem', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: '1.5rem', margin: 0 }}>{event.name}</h1>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: TEXT_MUTED }}>
              {event.customerName} — {event.location} · {new Date(event.eventDate).toLocaleDateString('de-DE')}
              {event.plannedBoardCount !== null && ` · Geplante Boards: ${event.plannedBoardCount}`}
            </p>
          </div>
          <span style={pillStyle(event.status === 'Active' ? 'on' : event.status === 'Draft' ? 'warn' : 'off')}>{STATUS_LABELS[event.status] ?? event.status}</span>
        </div>

        {creatingPlayers ? (
          <BulkPlayerForm
            eventId={event.id}
            onDone={() => {
              setCreatingPlayers(false)
              reload()
            }}
            onCancel={() => setCreatingPlayers(false)}
          />
        ) : (
          <>
        {section === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))', gap: '0.8rem' }}>
              <StatTile label="Boards live" value={stats ? `${stats.boardsLive}` : '—'} unit={stats ? `/ ${stats.boardsTotal}` : undefined} />
              <StatTile label="Geräte online" value={stats ? `${stats.devicesOnline}` : '—'} unit={stats ? `/ ${stats.devicesTotal}` : undefined} />
              <StatTile
                label="Höchster Wurf"
                value={stats?.highestThrow ? `${stats.highestThrow.score}` : '—'}
                unit={stats?.highestThrow?.playerName}
              />
              <StatTile
                label="Ohne Verbindung"
                value={stats ? `${stats.devicesTotal - stats.devicesOnline}` : '—'}
                unit="Geräte"
                warn={!!stats && stats.devicesTotal - stats.devicesOnline > 0}
              />
            </div>
            <DashboardTabs
              event={event}
              onStats={setStats}
              onGameFinished={() => setLeaderboardRefreshSignal((n) => n + 1)}
              leaderboardRefreshSignal={leaderboardRefreshSignal}
              onBestOfSaved={reload}
            />
          </div>
        )}

        {section === 'event' && (
          <div style={panelStyle()}>
            <div style={panelHeadStyle()}>
              <h2 style={panelTitleStyle}>Event</h2>
              <span style={pillStyle(event.status === 'Active' ? 'on' : event.status === 'Draft' ? 'warn' : 'off')}>{STATUS_LABELS[event.status] ?? event.status}</span>
            </div>
            <div style={{ padding: '0.9rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              {editingEvent ? (
                <EventEditForm
                  event={event}
                  onSaved={() => {
                    setEditingEvent(false)
                    reload()
                  }}
                  onCancel={() => setEditingEvent(false)}
                />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600 }}>{event.name}</p>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: TEXT_MUTED }}>
                      {event.customerName} — {event.location} · {new Date(event.eventDate).toLocaleDateString('de-DE')}
                      {event.plannedBoardCount !== null && ` · Geplante Boards: ${event.plannedBoardCount}`}
                    </p>
                  </div>
                  <button type="button" onClick={() => setEditingEvent(true)}>
                    Bearbeiten
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.6rem', flexWrap: 'wrap', borderTop: `1px solid ${BORDER}`, paddingTop: '1.1rem' }}>
                <EventStatusControls eventId={event.id} status={event.status} onChanged={reload} />
                <div style={{ marginLeft: 'auto' }}>
                  <ConfirmDeleteButton label="Event löschen" size="sm" onConfirm={() => api.deleteEvent(eventId).then(onBack)} />
                </div>
              </div>
            </div>
          </div>
        )}

        {section === 'boards' && (
          <div style={panelStyle()}>
            <div style={panelHeadStyle()}>
              <h2 style={panelTitleStyle}>Boards</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                <span style={{ fontSize: '0.75rem', color: TEXT_FAINT }}>{event.boards.length} gesamt</span>
                <ShuffleBoardNamesButton eventId={event.id} disabled={event.boards.length === 0} onShuffled={reload} />
              </div>
            </div>
            <table style={tableStyle()}>
              <thead>
                <tr>
                  <th style={thStyle()}>Board</th>
                  <th style={thStyle()}>Standort</th>
                </tr>
              </thead>
              <tbody>
                {[...event.boards]
                  .sort((a, b) => a.number - b.number)
                  .map((board) => (
                    <tr key={board.id}>
                      <td style={tdStyle()}>
                        <BoardNameEditor eventId={event.id} board={board} onRenamed={reload} />
                      </td>
                      <td style={{ ...tdStyle(), color: TEXT_MUTED }}>{board.locationDescription ?? '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <div style={{ padding: '0.9rem 1.1rem' }}>
              <BoardForm eventId={event.id} onAdded={reload} />
            </div>
          </div>
        )}

        {section === 'players' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={panelStyle()}>
              <div style={panelHeadStyle()}>
                <h2 style={panelTitleStyle}>Spieler</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                  <span style={{ fontSize: '0.75rem', color: TEXT_FAINT }}>{event.players.length} gesamt</span>
                  <PlayerCsvControls eventId={event.id} eventName={event.name} onImported={reload} />
                  <button type="button" className="primary" onClick={() => setCreatingPlayers(true)}>
                    + Spieler hinzufügen
                  </button>
                </div>
              </div>
              <div style={{ padding: '0.9rem 1.1rem 0' }}>
                <input
                  type="text"
                  value={playerSearch}
                  onChange={(e) => setPlayerSearch(e.target.value)}
                  placeholder="Spieler suchen…"
                  style={{ width: '100%', maxWidth: '20rem', boxSizing: 'border-box' }}
                />
              </div>
              <table style={tableStyle()}>
                <thead>
                  <tr>
                    <th style={thStyle()}>Spieler</th>
                  </tr>
                </thead>
                <tbody>
                  {event.players
                    .filter((player) => player.displayName.toLowerCase().includes(playerSearch.trim().toLowerCase()))
                    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'de'))
                    .map((player) => (
                    <tr key={player.id}>
                      <td style={tdStyle()}>
                        <PlayerRowEditor eventId={event.id} player={player} onChanged={reload} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {section === 'teams' && (
          <div style={panelStyle()}>
            <div style={panelHeadStyle()}>
              <h2 style={panelTitleStyle}>Teams</h2>
            </div>
            <div style={{ padding: '0.9rem 1.1rem' }}>
              <TeamPanel eventId={event.id} players={event.players} />
            </div>
          </div>
        )}

        {section === 'leinwand' && (
          <div style={panelStyle()}>
            <div style={panelHeadStyle()}>
              <h2 style={panelTitleStyle}>Leinwand</h2>
            </div>
            <div style={{ padding: '0.9rem 1.1rem' }}>
              <LeinwandControls eventId={event.id} />
            </div>
          </div>
        )}

        {section === 'devices' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={panelStyle()}>
              <div style={panelHeadStyle()}>
                <h2 style={panelTitleStyle}>Tablet pairen</h2>
              </div>
              <div style={{ padding: '0.9rem 1.1rem' }}>
                <PairingQrCodes eventId={event.id} />
              </div>
            </div>
            <div style={panelStyle()}>
              <div style={panelHeadStyle()}>
                <h2 style={panelTitleStyle}>Board-Monitor öffnen</h2>
              </div>
              <div style={{ padding: '0.9rem 1.1rem' }}>
                <BoardMonitorLink eventId={event.id} />
              </div>
            </div>
            <div style={panelStyle()}>
              <div style={panelHeadStyle()}>
                <h2 style={panelTitleStyle}>Warten auf Zuweisung</h2>
              </div>
              <UnassignedDevices eventId={event.id} boards={event.boards} />
            </div>
            <div style={panelStyle()}>
              <div style={panelHeadStyle()}>
                <h2 style={panelTitleStyle}>Geräte</h2>
              </div>
              <DeviceList eventId={event.id} />
            </div>
          </div>
        )}

        {section === 'tournaments' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {event.tournaments.map((tournament) => (
              <div key={tournament.id} style={panelStyle()}>
                <div style={panelHeadStyle()}>
                  <h2 style={panelTitleStyle}>
                    Qualifikation: {tournament.qualificationSettings.mode}
                    {tournament.qualificationSettings.rounds ? ` (${tournament.qualificationSettings.rounds} Runden)` : ''}
                    {tournament.qualificationSettings.startScore ? ` (${tournament.qualificationSettings.startScore})` : ''}
                    {' · Finale: '}
                    {tournament.finalSettings.mode}
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={pillStyle(tournament.status === 'Running' || tournament.status === 'FinalStarted' ? 'on' : 'off', primary)}>
                      {TOURNAMENT_STATUS_LABELS[tournament.status] ?? tournament.status}
                    </span>
                    <ConfirmDeleteButton
                      label="Turnier löschen"
                      size="sm"
                      onConfirm={() => api.deleteTournament(event.id, tournament.id).then(reload)}
                    />
                  </div>
                </div>
                <div style={{ padding: '0.9rem 1.1rem' }}>
                  <TournamentTabs
                    event={event}
                    tournament={tournament}
                    leaderboardRefreshSignal={leaderboardRefreshSignal}
                    onChanged={reload}
                  />
                </div>
              </div>
            ))}
            <div style={panelStyle()}>
              <div style={panelHeadStyle()}>
                <h2 style={panelTitleStyle}>Neues Turnier</h2>
              </div>
              <div style={{ padding: '0.9rem 1.1rem' }}>
                <TournamentForm eventId={event.id} onCreated={reload} />
              </div>
            </div>
          </div>
        )}

        {section === 'branding' && (
          <div style={panelStyle()}>
            <div style={panelHeadStyle()}>
              <h2 style={panelTitleStyle}>Branding</h2>
            </div>
            <div style={{ padding: '0.9rem 1.1rem' }}>
              <BrandingPanel
                eventId={event.id}
                hasLogo={!!event.logoPath}
                logoVersion={event.logoPath}
                primaryColor={event.primaryColor}
                secondaryColor={event.secondaryColor}
                onSaved={reload}
              />
            </div>
          </div>
        )}
          </>
        )}
      </main>
    </div>
  )
}

type PlayerRow = { firstName: string; lastName: string; nickname: string }

const emptyPlayerRows = (count: number): PlayerRow[] => Array.from({ length: count }, () => ({ firstName: '', lastName: '', nickname: '' }))

/**
 * Bulk player entry as its own page ("eigene Seite ähnlich wie bei
 * Events") - 10 rows up front, expandable by another 10 at a time, so
 * an event's whole roster can be typed in one sitting instead of one
 * player per round-trip through the old single-row form.
 */
function BulkPlayerForm({ eventId, onDone, onCancel }: { eventId: string; onDone: () => void; onCancel: () => void }) {
  const [rows, setRows] = useState<PlayerRow[]>(() => emptyPlayerRows(10))
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const updateRow = (index: number, field: keyof PlayerRow, value: string) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const filled = rows.filter((row) => row.firstName.trim() !== '' || row.lastName.trim() !== '')
    const invalid = filled.some((row) => row.firstName.trim() === '' || row.lastName.trim() === '')
    if (invalid) {
      setError('Bei jeder begonnenen Zeile müssen Vor- und Nachname ausgefüllt sein.')
      return
    }
    if (filled.length === 0) {
      setError('Mindestens eine Zeile ausfüllen.')
      return
    }

    setSubmitting(true)
    try {
      await Promise.all(
        filled.map((row) =>
          api.addPlayer(eventId, { firstName: row.firstName.trim(), lastName: row.lastName.trim(), nickname: row.nickname.trim() || undefined }),
        ),
      )
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const cellInputStyle: React.CSSProperties = { width: '100%' }

  return (
    <div style={panelStyle()}>
      <div style={panelHeadStyle()}>
        <h2 style={panelTitleStyle}>Spieler hinzufügen</h2>
        <span style={{ fontSize: '0.75rem', color: TEXT_FAINT }}>{rows.length} Felder</span>
      </div>
      <form onSubmit={handleSubmit} style={{ padding: '0.9rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {error && (
          <p role="alert" style={{ color: DANGER, margin: 0 }}>
            {error}
          </p>
        )}
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2rem 1fr 1fr 1fr', gap: '0.5rem 0.7rem', minWidth: '32rem' }}>
            <span />
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: TEXT_FAINT }}>Vorname</span>
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: TEXT_FAINT }}>Nachname</span>
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: TEXT_FAINT }}>Spitzname (optional)</span>
            {rows.map((row, i) => (
              // display:contents so each row's cells still land as direct
              // grid items of the parent grid, keeping the 4-column
              // alignment, while still giving .map() a single keyed element.
              <div key={i} style={{ display: 'contents' }}>
                <span style={{ fontSize: '0.78rem', color: TEXT_FAINT, alignSelf: 'center' }}>{i + 1}</span>
                <input value={row.firstName} onChange={(e) => updateRow(i, 'firstName', e.target.value)} style={cellInputStyle} autoFocus={i === 0} />
                <input value={row.lastName} onChange={(e) => updateRow(i, 'lastName', e.target.value)} style={cellInputStyle} />
                <input value={row.nickname} onChange={(e) => updateRow(i, 'nickname', e.target.value)} style={cellInputStyle} />
              </div>
            ))}
          </div>
        </div>
        <button type="button" onClick={() => setRows((prev) => [...prev, ...emptyPlayerRows(10)])} style={{ alignSelf: 'flex-start' }}>
          + 10 weitere Felder
        </button>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button type="button" onClick={onCancel} disabled={submitting}>
            Abbrechen
          </button>
          <button type="submit" className="primary" disabled={submitting}>
            {submitting ? 'Wird angelegt…' : 'Spieler anlegen'}
          </button>
        </div>
      </form>
    </div>
  )
}

function PlayerCsvControls({ eventId, eventName, onImported }: { eventId: string; eventName: string; onImported: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setError(null)
    setResult(null)
    setImporting(true)
    try {
      const outcome = await api.importPlayersCsv(eventId, file)
      setResult({ created: outcome.created, skipped: outcome.skipped })
      onImported()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
      {error && (
        <p role="alert" style={{ color: DANGER, margin: 0 }}>
          {error}
        </p>
      )}
      {result && (
        <span style={{ color: TEXT_MUTED }}>
          {result.created} importiert{result.skipped > 0 ? `, ${result.skipped} übersprungen` : ''}
        </span>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />
      <button type="button" disabled={importing} onClick={() => fileInputRef.current?.click()}>
        {importing ? 'Importiert…' : 'CSV importieren'}
      </button>
      <button type="button" onClick={() => api.exportPlayersCsv(eventId, eventName)}>
        CSV exportieren
      </button>
    </div>
  )
}

/**
 * Inline edit/delete for a single player row ("Spieler ändern, löschen und
 * bearbeiten") - mirrors BoardNameEditor's click-to-edit pattern rather than
 * a separate page, since it's a single short-lived row, not a multi-field
 * form. Delete needs a second click to confirm (same pattern as the game's
 * "Alle Würfe zurücksetzen") since removing a player can't be undone.
 */
function PlayerRowEditor({ eventId, player, onChanged }: { eventId: string; player: Player; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [firstName, setFirstName] = useState(player.firstName)
  const [lastName, setLastName] = useState(player.lastName)
  const [nickname, setNickname] = useState(player.nickname ?? '')
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setError(null)
    try {
      await api.updatePlayer(eventId, player.id, { firstName, lastName, nickname: nickname || undefined })
      setEditing(false)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {error && (
          <p role="alert" style={{ color: DANGER, margin: 0 }}>
            {error}
          </p>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Vorname" style={{ width: '9rem' }} />
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Nachname" style={{ width: '9rem' }} />
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Spitzname (optional)" style={{ width: '9rem' }} />
          <button type="button" className="primary" onClick={save}>
            Speichern
          </button>
          <button type="button" onClick={() => setEditing(false)}>
            Abbrechen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
      <span style={{ flex: 1 }}>{player.displayName}</span>
      {error && (
        <p role="alert" style={{ color: DANGER, margin: 0, fontSize: '0.78rem' }}>
          {error}
        </p>
      )}
      <button type="button" onClick={() => setEditing(true)} style={buttonStyle('', 'secondary', 'sm')}>
        Bearbeiten
      </button>
      <ConfirmDeleteButton label="Löschen" size="sm" onConfirm={() => api.deletePlayer(eventId, player.id).then(onChanged)} />
    </div>
  )
}

const DEVICE_TYPE_LABELS: Record<string, string> = {
  Tablet: 'Tablet',
  Monitor: 'Monitor',
}

// Gives every sub-block inside a tournament tab (Rangliste, Team-Rangliste,
// Spiel, Gruppen, KO-Runde) its own bordered box - without it they used to
// run straight into each other with only a gap, reading as one long
// undifferentiated stream instead of distinct sections.
function TournamentSection({ children }: { children: React.ReactNode }) {
  return <div style={rowCardStyle()}>{children}</div>
}

type TournamentTab = 'status' | 'leaderboard' | 'games' | 'knockout'

const TOURNAMENT_TAB_LABELS: Record<TournamentTab, string> = {
  status: 'Status & Einstellungen',
  leaderboard: 'Rangliste',
  games: 'Spiele',
  knockout: 'Gruppenrunde & KO-Runde',
}

/**
 * Status summary for the "Status & Einstellungen" tab - mirrors the old
 * system's EventDashboard ("Übersicht"): total participant count during
 * qualification, the current KO round's winners once it's fully decided,
 * and a warning if games are still in progress. Refetches whenever the
 * tournament status changes (a new round/phase can change all three).
 */
function TournamentOverviewSummary({
  eventId,
  tournament,
  playersCount,
  onGoToKnockout,
}: {
  eventId: string
  tournament: Tournament
  playersCount: number
  onGoToKnockout: () => void
}) {
  const [overview, setOverview] = useState<TournamentOverview | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .getTournamentOverview(eventId, tournament.id)
      .then((result) => {
        if (!cancelled) setOverview(result)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [eventId, tournament.id, tournament.status])

  const isFinalStarted = tournament.status === 'FinalStarted'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
      {!isFinalStarted && <p style={{ margin: 0 }}>Teilnehmer (Vorrunde): {playersCount}</p>}
      {isFinalStarted && overview?.currentRoundWinners && (
        <p style={{ margin: 0 }}>
          Gewinner der aktuellen Runde: {overview.currentRoundWinners.map((w) => w.playerName).join(', ') || '—'}
        </p>
      )}
      {overview && overview.activeGamesCount > 0 && (
        <p style={{ margin: 0, color: DEFAULT_PRIMARY }}>Achtung! Laufende Spiele: {overview.activeGamesCount}</p>
      )}
      {isFinalStarted && (
        <button type="button" onClick={onGoToKnockout} style={{ alignSelf: 'flex-start' }}>
          Zur KO-Runde
        </button>
      )}
      {tournament.status === 'Finished' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.3rem' }}>
          <p style={{ margin: 0 }}>🏆 Turnier beendet</p>
          <SiegerehrungLink eventId={eventId} tournamentId={tournament.id} />
        </div>
      )}
    </div>
  )
}

/**
 * Link to the static Siegerehrung podium screen for the Leinwand (opened
 * manually once the Regie decides the tournament is over, same as the old
 * system - no auto-trigger). No QR code, unlike the Tablet/Monitor pairing
 * links: this is opened directly on whatever device drives the big screen,
 * not scanned from a phone.
 */
function SiegerehrungLink({ eventId, tournamentId }: { eventId: string; tournamentId: string }) {
  const serverOrigin = useServerOrigin()
  const [copied, setCopied] = useState(false)

  if (!serverOrigin) return null

  const url = `${serverOrigin}/?siegerehrung=${eventId}&tournament=${tournamentId}`

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
      <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem', wordBreak: 'break-all' }}>
        {url}
      </a>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(url).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          })
        }}
      >
        {copied ? 'Kopiert!' : 'Link kopieren'}
      </button>
    </div>
  )
}

/**
 * A tournament card used to stack Status/Einstellungen/Rangliste/Team-
 * Rangliste/Spiele/Gruppenrunde/KO-Runde on top of each other in one long
 * scroll (worst once the final phase started - 6+ sub-panels at once).
 * Split into tabs instead, grouped by what's actually looked at together.
 * Defaults to the KO-Runde tab once the final phase has started (that's
 * the active working context then), otherwise to Spiele.
 */
function TournamentTabs({
  event,
  tournament,
  leaderboardRefreshSignal,
  onChanged,
}: {
  event: EventDetail
  tournament: Tournament
  leaderboardRefreshSignal: number
  onChanged: () => void
}) {
  const isFinalStarted = tournament.status === 'FinalStarted'
  const availableTabs: TournamentTab[] = isFinalStarted
    ? ['status', 'leaderboard', 'games', 'knockout']
    : ['status', 'leaderboard', 'games']
  const [tab, setTab] = useState<TournamentTab>(isFinalStarted ? 'knockout' : 'games')
  const activeTab = availableTabs.includes(tab) ? tab : availableTabs[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      <div className="lpd-tabs">
        {availableTabs.map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`lpd-tab${activeTab === t ? ' lpd-tab-active' : ''}`}>
            {TOURNAMENT_TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {activeTab === 'status' && (
        <>
          <TournamentSection>
            <TournamentOverviewSummary
              eventId={event.id}
              tournament={tournament}
              playersCount={event.players.length}
              onGoToKnockout={() => setTab('knockout')}
            />
          </TournamentSection>
          <TournamentSection>
            <TournamentStatusControls eventId={event.id} tournament={tournament} onChanged={onChanged} />
          </TournamentSection>
          <TournamentSection>
            <TournamentSettingsPanel eventId={event.id} tournament={tournament} onSaved={onChanged} />
          </TournamentSection>
        </>
      )}

      {activeTab === 'leaderboard' && (
        <>
          <TournamentSection>
            <Leaderboard
              eventId={event.id}
              tournamentId={tournament.id}
              qualificationBestOf={tournament.qualificationBestOf}
              refreshSignal={leaderboardRefreshSignal}
              onBestOfSaved={onChanged}
            />
          </TournamentSection>
          <TournamentSection>
            <TeamLeaderboard eventId={event.id} tournamentId={tournament.id} refreshSignal={leaderboardRefreshSignal} />
          </TournamentSection>
        </>
      )}

      {activeTab === 'games' && (
        <TournamentSection>
          <GamePanel eventId={event.id} tournament={tournament} players={event.players} boards={event.boards} />
        </TournamentSection>
      )}

      {activeTab === 'knockout' && isFinalStarted && (
        <>
          <TournamentSection>
            <GroupPanel eventId={event.id} tournamentId={tournament.id} boards={event.boards} />
          </TournamentSection>
          <TournamentSection>
            <KnockoutPanel eventId={event.id} tournamentId={tournament.id} boards={event.boards} tournament={tournament} onTournamentChanged={onChanged} />
          </TournamentSection>
        </>
      )}
    </div>
  )
}

const TOURNAMENT_STATUS_LABELS: Record<string, string> = {
  Draft: 'Entwurf',
  Running: 'Läuft',
  FinalStarted: 'Finale gestartet',
  Finished: 'Beendet',
  Cancelled: 'Abgebrochen',
}

/**
 * Turnier-Status frei per Dropdown wählbar, jederzeit zu jedem Status
 * springbar - wie im alten System (dortiges Phase-Dropdown, geändert per
 * updateEvent ohne serverseitige Validierung, nur mit einem Tooltip-
 * Warnhinweis). Ersetzt die frühere Lösung mit geführten Vorwärts-Buttons
 * und einem validierten Ein-Schritt-Revert.
 */
function TournamentStatusControls({ eventId, tournament, onChanged }: { eventId: string; tournament: Tournament; onChanged: () => void }) {
  const [status, setStatus] = useState(tournament.status)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await api.setTournamentStatus(eventId, tournament.id, status)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.6rem', flexWrap: 'wrap' }}>
      {error && (
        <p role="alert" style={{ color: DANGER, margin: 0, fontSize: '0.78rem', flexBasis: '100%' }}>
          {error}
        </p>
      )}
      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem' }}>
        Status
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {Object.entries(TOURNAMENT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="primary" onClick={handleSave} disabled={saving || status === tournament.status}>
        {saving ? 'Wird gespeichert…' : 'Speichern'}
      </button>
      <p style={{ margin: 0, fontSize: '0.75rem', color: TEXT_MUTED, flexBasis: '100%' }}>
        Achtung: nicht bei laufenden Spielen ändern.
      </p>
    </div>
  )
}

/**
 * Spielmodus/Runden/Startscore bleiben über die gesamte Laufzeit des
 * Turniers änderbar, unabhängig vom Status - wie im alten System, wo das
 * schlicht Event-Felder waren, die jederzeit im Bearbeiten-Formular
 * geändert werden konnten. Nur neu angelegte Spiele übernehmen die neuen
 * Einstellungen, bereits gespielte Spiele behalten ihre eigenen Werte.
 */
function TournamentSettingsPanel({
  eventId,
  tournament,
  onSaved,
}: {
  eventId: string
  tournament: Tournament
  onSaved: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      <GameSettingsEditor
        label="Qualifikation"
        settings={tournament.qualificationSettings}
        onSave={(body) => api.updateQualificationSettings(eventId, tournament.id, body)}
        onSaved={onSaved}
      />
      <GameSettingsEditor
        label="Finale"
        settings={tournament.finalSettings}
        onSave={(body) => api.updateFinalSettings(eventId, tournament.id, body)}
        onSaved={onSaved}
      />
    </div>
  )
}

function GameSettingsEditor({
  label,
  settings,
  onSave,
  onSaved,
}: {
  label: string
  settings: GameSettings
  onSave: (body: { mode: 'Highscore' | 'X01'; startScore?: number; rounds?: number }) => Promise<unknown>
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [mode, setMode] = useState<'Highscore' | 'X01'>(settings.mode)
  const [rounds, setRounds] = useState(settings.rounds ? String(settings.rounds) : '8')
  const [startScore, setStartScore] = useState<'301' | '501'>(settings.startScore === 301 ? '301' : '501')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const startEditing = () => {
    setMode(settings.mode)
    setRounds(settings.rounds ? String(settings.rounds) : '8')
    setStartScore(settings.startScore === 301 ? '301' : '501')
    setError(null)
    setEditing(true)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave({
        mode,
        startScore: mode === 'X01' ? Number(startScore) : undefined,
        rounds: mode === 'Highscore' ? Number(rounds) : undefined,
      })
      setEditing(false)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem' }

  if (!editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <p style={sectionHeadingStyle()}>{label}</p>
          <p style={{ margin: '0.15rem 0 0', fontWeight: 600 }}>
            {settings.mode}
            {settings.rounds ? ` · ${settings.rounds} Runden` : ''}
            {settings.startScore ? ` · ${settings.startScore}` : ''}
          </p>
        </div>
        <button type="button" onClick={startEditing}>
          Bearbeiten
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
      {error && (
        <p role="alert" style={{ color: DANGER, margin: 0, fontSize: '0.78rem' }}>
          {error}
        </p>
      )}
      <p style={{ margin: 0, fontSize: '0.78rem', color: TEXT_MUTED }}>{label}</p>
      <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap' }}>
        <label style={fieldStyle}>
          Modus
          <select value={mode} onChange={(e) => setMode(e.target.value as 'Highscore' | 'X01')}>
            <option value="Highscore">Highscore</option>
            <option value="X01">X01</option>
          </select>
        </label>
        {mode === 'Highscore' ? (
          <label style={fieldStyle}>
            Runden
            <input type="number" min="1" value={rounds} onChange={(e) => setRounds(e.target.value)} />
          </label>
        ) : (
          <label style={fieldStyle}>
            Startscore
            <select value={startScore} onChange={(e) => setStartScore(e.target.value as '301' | '501')}>
              <option value="301">301</option>
              <option value="501">501</option>
            </select>
          </label>
        )}
      </div>
      <div style={{ display: 'flex', gap: '0.6rem' }}>
        <button type="button" className="primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Wird gespeichert…' : 'Speichern'}
        </button>
        <button type="button" onClick={() => setEditing(false)} disabled={saving}>
          Abbrechen
        </button>
      </div>
    </div>
  )
}

function Leaderboard({
  eventId,
  tournamentId,
  qualificationBestOf,
  refreshSignal,
  onBestOfSaved,
}: {
  eventId: string
  tournamentId: string
  qualificationBestOf: number | null
  refreshSignal: number
  onBestOfSaved?: () => void
}) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null)
  const [bestOf, setBestOf] = useState(qualificationBestOf ? String(qualificationBestOf) : '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const reload = () => {
    api
      .getLeaderboard(eventId, tournamentId, bestOf ? Number(bestOf) : undefined)
      .then(setEntries)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }

  // Re-fetches whenever any board's game finishes (see BoardOverview's
  // onGameFinished) - only finished games count towards the score, so
  // that's the only moment this can actually change.
  useEffect(reload, [eventId, tournamentId, refreshSignal])

  // Starts pre-filled from the tournament's persisted setting rather than
  // "alle" - the input stays freely editable for ad-hoc what-if lookups,
  // but "Als Standard speichern" is what makes a changed number stick
  // for everyone (Leinwand included), not just this one view.
  const saveAsDefault = async () => {
    setError(null)
    setSaving(true)
    try {
      await api.setQualificationBestOf(eventId, tournamentId, bestOf ? Number(bestOf) : null)
      onBestOfSaved?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap' }}>
        <h4 style={{ margin: 0, fontSize: '0.78rem', color: TEXT_FAINT, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rangliste</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.4rem', margin: 0, fontSize: '0.85rem' }}>
            Beste X Spiele zählen (leer = alle)
            <input type="number" min="1" value={bestOf} onChange={(e) => setBestOf(e.target.value)} style={{ width: '4rem' }} />
          </label>
          <button type="button" onClick={reload}>
            Aktualisieren
          </button>
          <button type="button" onClick={saveAsDefault} disabled={saving} title="Gilt dann überall (Leinwand inklusive), bis erneut geändert">
            Als Standard speichern
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" style={{ color: DANGER, margin: 0 }}>
          {error}
        </p>
      )}
      {entries && entries.length === 0 && <p style={{ color: TEXT_MUTED, fontSize: '0.85rem', margin: 0 }}>Noch keine beendeten Spiele.</p>}
      {entries && entries.length > 0 && (
        <table style={tableStyle()}>
          <thead>
            <tr>
              <th style={thStyle()}>#</th>
              <th style={thStyle()}>Spieler</th>
              <th style={{ ...thStyle(), textAlign: 'right' }}>Punkte</th>
              <th style={{ ...thStyle(), textAlign: 'right' }}>Spiele</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr key={entry.playerId}>
                <td style={{ ...tdStyle(), color: i === 0 ? undefined : TEXT_FAINT, fontWeight: 700 }}>{i + 1}</td>
                <td style={tdStyle()}>{entry.playerName}</td>
                <td style={{ ...tdStyle(), textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{entry.score}</td>
                <td style={{ ...tdStyle(), textAlign: 'right', color: TEXT_FAINT, fontSize: '0.78rem' }}>
                  {entry.gamesCounted}/{entry.gamesPlayed}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function TeamLeaderboard({
  eventId,
  tournamentId,
  refreshSignal,
}: {
  eventId: string
  tournamentId: string
  refreshSignal: number
}) {
  const [entries, setEntries] = useState<TeamLeaderboardEntry[] | null>(null)
  const [bestOf, setBestOf] = useState('')
  const [error, setError] = useState<string | null>(null)

  const reload = () => {
    api
      .getTeamLeaderboard(eventId, tournamentId, bestOf ? Number(bestOf) : undefined)
      .then(setEntries)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }

  useEffect(reload, [eventId, tournamentId, refreshSignal])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap' }}>
        <h4 style={{ margin: 0, fontSize: '0.78rem', color: TEXT_FAINT, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Team-Rangliste</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.4rem', margin: 0, fontSize: '0.85rem' }}>
            Beste X Spiele zählen (leer = alle)
            <input type="number" min="1" value={bestOf} onChange={(e) => setBestOf(e.target.value)} style={{ width: '4rem' }} />
          </label>
          <button type="button" onClick={reload}>
            Aktualisieren
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" style={{ color: DANGER, margin: 0 }}>
          {error}
        </p>
      )}
      {entries && entries.length === 0 && <p style={{ color: TEXT_MUTED, fontSize: '0.85rem', margin: 0 }}>Noch keine beendeten Team-Spiele.</p>}
      {entries && entries.length > 0 && (
        <table style={tableStyle()}>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.teamId}>
                <td style={tdStyle()}>{entry.teamName}</td>
                <td style={{ ...tdStyle(), textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{entry.score}</td>
                <td style={{ ...tdStyle(), textAlign: 'right', color: TEXT_FAINT, fontSize: '0.78rem' }}>
                  {entry.gamesCounted}/{entry.gamesPlayed}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

const SCENE_LABELS: Record<LeinwandScene, string> = {
  scores: 'Live-Scores',
  leaderboard: 'Vorrunden-Rangliste',
}
const ALL_SCENES: LeinwandScene[] = ['scores', 'leaderboard']

/**
 * Regie-side control for the Leinwand's Szenen-System ("Playlists [...]
 * Steuerung vom Notebook", project plan 3.3) - which scenes rotate, how
 * often, and an optional pin to show just one scene (e.g. for the Finale).
 * Changes push live to the Leinwand via SignalR (see LeinwandEndpoints).
 */
function LeinwandControls({ eventId }: { eventId: string }) {
  const [settings, setSettings] = useState<LeinwandSettings | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .getLeinwandSettings(eventId)
      .then(setSettings)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }, [eventId])

  const save = (next: LeinwandSettings) => {
    setError(null)
    api
      .updateLeinwandSettings(eventId, next)
      .then(setSettings)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }

  if (!settings) return <p>{error ?? 'Lädt…'}</p>

  const toggleScene = (scene: LeinwandScene) => {
    const activeScenes = settings.activeScenes.includes(scene)
      ? settings.activeScenes.filter((s) => s !== scene)
      : [...settings.activeScenes, scene]
    save({ ...settings, activeScenes })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {error && (
        <p role="alert" style={{ color: DANGER, margin: 0 }}>
          {error}
        </p>
      )}
      <div>
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: TEXT_MUTED }}>Aktive Szenen (rotieren im Takt, sofern keine fixiert ist):</p>
        <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap' }}>
          {ALL_SCENES.map((scene) => (
            <label key={scene} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
              <input type="checkbox" checked={settings.activeScenes.includes(scene)} onChange={() => toggleScene(scene)} />
              {SCENE_LABELS[scene]}
            </label>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem' }}>
          Takt (Sekunden)
          <input
            type="number"
            min="1"
            value={settings.intervalSeconds}
            onChange={(e) => save({ ...settings, intervalSeconds: Number(e.target.value) })}
            style={{ width: '5rem' }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem' }}>
          Fixierte Szene
          <select
            value={settings.pinnedScene ?? ''}
            onChange={(e) => save({ ...settings, pinnedScene: (e.target.value || null) as LeinwandScene | null })}
          >
            <option value="">Keine (Rotation)</option>
            {ALL_SCENES.map((scene) => (
              <option key={scene} value={scene}>
                {SCENE_LABELS[scene]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  )
}

/**
 * QR-Codes for pairing a Tablet or Board-Monitor to this event (project
 * plan: "QR-Code-Pairing") - scan with the device's camera to jump straight
 * to its pairing screen instead of typing the URL in by hand. Tablet only -
 * Board-Monitors get set up once per board and left alone, not scanned
 * repeatedly the way a Tablet handed between players/boards would be.
 *
 * The address to encode can't just be window.location.origin: the Regie is
 * routinely opened via "localhost" on the server PC itself, which a real
 * device obviously can't reach. Now that the backend serves the built
 * frontend itself (one process, one port - see Program.cs), the current
 * origin is authoritative whenever it isn't literally "localhost". For that
 * localhost case, the backend's own network interfaces are queried
 * (GET /api/server-info) to find its LAN address automatically - no manual
 * entry, ever.
 */
/**
 * "Optional: Pairing per QR-Code - Board-Name auf dem Notebook anzeigen, mit
 * dem Tablet scannen, fertig." (project plan 3.1) - picking a board here
 * swaps the generic tablet QR for one carrying `&board=<id>`, which
 * DevicePairing's own presetBoardId flow (main.tsx) already turns into a
 * one-tap "Board X übernehmen?" confirmation, so scanning it pairs that
 * exact board without the scorer hunting for it in the Tablet's own list.
 */
function PairingQrCodes({ eventId }: { eventId: string }) {
  const serverOrigin = useServerOrigin()
  const [boards, setBoards] = useState<PairingBoard[]>([])
  const [selectedBoardId, setSelectedBoardId] = useState('')

  useEffect(() => {
    api
      .getPairingBoards(eventId)
      .then(setBoards)
      .catch(() => {})
  }, [eventId])

  if (!serverOrigin) return <p>Ermittle LAN-Adresse…</p>

  const tabletUrl = selectedBoardId
    ? `${serverOrigin}/?tablet=${eventId}&board=${selectedBoardId}`
    : `${serverOrigin}/?tablet=${eventId}`

  return (
    <div style={{ textAlign: 'center' }}>
      {boards.length > 0 && (
        <label style={{ display: 'block', maxWidth: '20rem', margin: '0 auto 0.8rem', fontSize: '0.85rem' }}>
          Board (optional)
          <select value={selectedBoardId} onChange={(e) => setSelectedBoardId(e.target.value)}>
            <option value="">Beliebiges Board - Auswahl auf dem Tablet</option>
            {boards.map((board) => (
              <option key={board.id} value={board.id}>
                {board.name ?? `Board ${board.number}`}
              </option>
            ))}
          </select>
        </label>
      )}
      <QrCode value={tabletUrl} />
      <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: TEXT_FAINT }}>
        {selectedBoardId
          ? 'Direkt für dieses Board - mit dem Tablet scannen, fertig.'
          : 'Zum direkten Pairing mit einem bestimmten Board: hier auswählen, oder QR-Code auf dem jeweiligen Board-Monitor scannen.'}
      </p>
    </div>
  )
}

/**
 * Direct link (plus QR code, for consistency with Tablet pairing) to this
 * event's Board-Monitor picker - unlike a Tablet, a laptop opening the
 * monitor view is typically navigated to directly rather than scanning its
 * own QR code, so the URL itself needs to be visible and clickable/copyable.
 */
function BoardMonitorLink({ eventId }: { eventId: string }) {
  const serverOrigin = useServerOrigin()
  const [copied, setCopied] = useState<'current' | 'event' | null>(null)
  // The Board-Monitor's layout is portrait-only (see main.tsx's
  // RotatedViewport) - a landscape TV/TV-stick screen driving it always
  // needs to be physically mounted rotated 90°, and its output rotated
  // right back to compensate (most Android TV/Fire TV sticks can't rotate
  // their own output). Baked straight into the generated link/QR-Code so
  // nobody has to hand-edit the URL on a device with no keyboard. Only one
  // rotation direction is offered here by design (?rotate=ccw still works
  // if hand-typed, for the rare screen mounted the other way).

  if (!serverOrigin) return <p>Ermittle LAN-Adresse…</p>

  // Fixed across events - resolves server-side to whichever event is
  // currently Active (GET /api/events/current), so this exact URL can be
  // set once as a device's homepage and never needs re-typing on the
  // device itself for the next event.
  const currentUrl = `${serverOrigin}/?boardmonitor=current&rotate=cw`
  const monitorUrl = `${serverOrigin}/?boardmonitor=${eventId}&rotate=cw`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem', alignItems: 'center', textAlign: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', alignItems: 'center' }}>
        <QrCode value={currentUrl} />
        <a href={currentUrl} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all', fontSize: '0.85rem' }}>
          {currentUrl}
        </a>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(currentUrl).then(() => {
              setCopied('current')
              setTimeout(() => setCopied(null), 2000)
            })
          }}
        >
          {copied === 'current' ? 'Kopiert!' : 'Link kopieren'}
        </button>
        <p style={{ margin: 0, fontSize: '0.75rem', color: TEXT_FAINT }}>
          Fest - einmal auf dem Gerät als Startseite setzen, zeigt dann immer das gerade aktive Event. Board-Zuweisung läuft
          über "Warten auf Zuweisung" weiter unten.
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', alignItems: 'center', opacity: 0.75 }}>
        <p style={{ margin: 0, fontSize: '0.8rem' }}>Oder direkt für dieses Event:</p>
        <a href={monitorUrl} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all', fontSize: '0.8rem' }}>
          {monitorUrl}
        </a>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(monitorUrl).then(() => {
              setCopied('event')
              setTimeout(() => setCopied(null), 2000)
            })
          }}
        >
          {copied === 'event' ? 'Kopiert!' : 'Link kopieren'}
        </button>
      </div>
    </div>
  )
}

/**
 * Devices waiting on their own "Warte auf Zuweisung" screen
 * (DevicePairing.tsx) - assigning a board here needs no interaction on
 * the device itself (project plan 3.2: "Geräteverwaltung: ... alles vom
 * Notebook aus änderbar"). Polls like DeviceList does, for the same
 * reason (no SignalR broadcast for this yet).
 */
function UnassignedDevices({ eventId, boards }: { eventId: string; boards: Board[] }) {
  const [devices, setDevices] = useState<UnassignedDevice[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedBoardId, setSelectedBoardId] = useState<Record<string, string>>({})
  const [assigning, setAssigning] = useState<string | null>(null)

  const reload = () => {
    api
      .getUnassignedDevices(eventId)
      .then(setDevices)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }

  useEffect(() => {
    reload()
    const interval = setInterval(reload, 5000)
    return () => clearInterval(interval)
  }, [eventId])

  const assign = async (device: UnassignedDevice) => {
    const boardId = selectedBoardId[device.clientDeviceId]
    if (!boardId) return
    setAssigning(device.clientDeviceId)
    try {
      await api.assignDevice(eventId, device.clientDeviceId, boardId, device.type)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setAssigning(null)
    }
  }

  return (
    <div>
      {error && (
        <p role="alert" style={{ color: DANGER, padding: '0 1.1rem' }}>
          {error}
        </p>
      )}
      {devices && devices.length === 0 && (
        <p style={{ color: TEXT_MUTED, fontSize: '0.85rem', padding: '0 1.1rem 0.9rem' }}>Keine Geräte warten auf Zuweisung.</p>
      )}
      {devices && devices.length > 0 && (
        <table style={tableStyle()}>
          <thead>
            <tr>
              <th style={thStyle()}>Typ</th>
              <th style={thStyle()}>Code</th>
              <th style={thStyle()}>Board</th>
              <th style={thStyle()}></th>
            </tr>
          </thead>
          <tbody>
            {devices.map((device) => (
              <tr key={device.clientDeviceId}>
                <td style={tdStyle()}>{DEVICE_TYPE_LABELS[device.type] ?? device.type}</td>
                <td style={{ ...tdStyle(), fontWeight: 700, letterSpacing: '0.15em' }}>{device.shortCode}</td>
                <td style={tdStyle()}>
                  <select
                    value={selectedBoardId[device.clientDeviceId] ?? ''}
                    onChange={(e) => setSelectedBoardId((prev) => ({ ...prev, [device.clientDeviceId]: e.target.value }))}
                  >
                    <option value="">Board wählen…</option>
                    {boards.map((board) => (
                      <option key={board.id} value={board.id}>
                        {board.name ?? `Board ${board.number}`}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={tdStyle()}>
                  <button
                    type="button"
                    className="primary"
                    disabled={!selectedBoardId[device.clientDeviceId] || assigning === device.clientDeviceId}
                    onClick={() => assign(device)}
                  >
                    {assigning === device.clientDeviceId ? 'Wird zugewiesen…' : 'Zuweisen'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function DeviceList({ eventId }: { eventId: string }) {
  const [devices, setDevices] = useState<DeviceStatus[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = () => {
    api
      .listDevices(eventId)
      .then(setDevices)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }

  // No SignalR broadcast for online-status changes (see the pairing-picker
  // work), so this polls like that one did rather than pushing live.
  useEffect(() => {
    reload()
    const interval = setInterval(reload, 5000)
    return () => clearInterval(interval)
  }, [eventId])

  return (
    <div>
      {error && (
        <p role="alert" style={{ color: DANGER, padding: '0 1.1rem' }}>
          {error}
        </p>
      )}
      {devices && devices.length === 0 && <p style={{ color: TEXT_MUTED, fontSize: '0.85rem', padding: '0 1.1rem 0.9rem' }}>Keine Geräte gepairt.</p>}
      {devices && devices.length > 0 && (
        <table style={tableStyle()}>
          <thead>
            <tr>
              <th style={thStyle()}>Typ</th>
              <th style={thStyle()}>Board</th>
              <th style={thStyle()}>Status</th>
              <th style={thStyle()}>Gültig bis</th>
              <th style={thStyle()}></th>
            </tr>
          </thead>
          <tbody>
            {devices.map((device) => (
              <tr key={device.clientDeviceId}>
                <td style={tdStyle()}>{DEVICE_TYPE_LABELS[device.type] ?? device.type}</td>
                <td style={tdStyle()}>{device.boardName}</td>
                <td style={tdStyle()}>
                  <span style={pillStyle(device.isOnline ? 'on' : 'off')}>
                    <span style={{ width: '0.4rem', height: '0.4rem', borderRadius: '50%', background: 'currentColor' }} />
                    {device.isOnline ? 'Online' : 'Offline'}
                  </span>
                </td>
                <td style={{ ...tdStyle(), color: TEXT_FAINT, fontSize: '0.78rem' }}>
                  {device.expiresAt ? new Date(device.expiresAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : 'unbegrenzt'}
                </td>
                <td style={tdStyle()}>
                  <button type="button" onClick={() => api.removeDevice(eventId, device.clientDeviceId).then(reload)}>
                    Entfernen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={{ padding: '0.9rem 1.1rem' }}>
        <button type="button" onClick={reload}>
          Aktualisieren
        </button>
      </div>
    </div>
  )
}

function ShuffleBoardNamesButton({
  eventId,
  disabled,
  onShuffled,
}: {
  eventId: string
  disabled: boolean
  onShuffled: () => void
}) {
  const [shuffling, setShuffling] = useState(false)

  const shuffle = async () => {
    setShuffling(true)
    try {
      await api.shuffleBoardNames(eventId)
      onShuffled()
    } finally {
      setShuffling(false)
    }
  }

  return (
    <button type="button" onClick={shuffle} disabled={disabled || shuffling} title="Weist allen Boards zufällig neue Namen zu">
      {shuffling ? 'Mische…' : 'Namen neu mischen'}
    </button>
  )
}

function BoardNameEditor({ eventId, board, onRenamed }: { eventId: string; board: Board; onRenamed: () => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(board.name ?? '')

  const save = async () => {
    await api.renameBoard(eventId, board.id, name.trim() || null)
    setEditing(false)
    onRenamed()
  }

  if (!editing) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <span style={{ fontWeight: 600 }}>{board.name ?? `#${board.number}`}</span>
        <button type="button" onClick={() => setEditing(true)}>
          Umbenennen
        </button>
        <ConfirmDeleteButton label="Löschen" size="sm" onConfirm={() => api.deleteBoard(eventId, board.id).then(onRenamed)} />
      </span>
    )
  }

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`#${board.number}`} style={{ width: '10rem' }} />
      <button type="button" className="primary" onClick={save}>
        Speichern
      </button>
      <button type="button" onClick={() => setEditing(false)}>
        Abbrechen
      </button>
    </span>
  )
}

function BoardForm({ eventId, onAdded }: { eventId: string; onAdded: () => void }) {
  const [number, setNumber] = useState('')
  const [name, setName] = useState('')
  const [locationDescription, setLocationDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await api.addBoard(eventId, {
        number: Number(number),
        name: name || undefined,
        locationDescription: locationDescription || undefined,
      })
      setNumber('')
      setName('')
      setLocationDescription('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
      {error && (
        <p role="alert" style={{ color: DANGER, margin: 0 }}>
          {error}
        </p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))', gap: '0.7rem' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem' }}>
          Nummer
          <input type="number" min="1" value={number} onChange={(e) => setNumber(e.target.value)} required />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem' }}>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Bullseye-Bar" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem' }}>
          Standort
          <input value={locationDescription} onChange={(e) => setLocationDescription(e.target.value)} />
        </label>
      </div>
      <button type="submit" className="primary" style={{ alignSelf: 'flex-start' }}>
        Board hinzufügen
      </button>
    </form>
  )
}

function TournamentForm({ eventId, onCreated }: { eventId: string; onCreated: () => void }) {
  const [qualificationMode, setQualificationMode] = useState<'Highscore' | 'X01'>('Highscore')
  const [qualificationRounds, setQualificationRounds] = useState('8')
  const [qualificationStartScore, setQualificationStartScore] = useState<'301' | '501'>('501')
  const [qualificationBestOf, setQualificationBestOf] = useState('3')
  const [finalMode, setFinalMode] = useState<'Highscore' | 'X01'>('X01')
  const [finalRounds, setFinalRounds] = useState('8')
  const [finalStartScore, setFinalStartScore] = useState<'301' | '501'>('501')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await api.createTournament(eventId, {
        qualificationMode,
        qualificationStartScore: qualificationMode === 'X01' ? Number(qualificationStartScore) : undefined,
        qualificationRounds: qualificationMode === 'Highscore' ? Number(qualificationRounds) : undefined,
        finalMode,
        finalStartScore: finalMode === 'X01' ? Number(finalStartScore) : undefined,
        finalRounds: finalMode === 'Highscore' ? Number(finalRounds) : undefined,
        qualificationBestOf: qualificationBestOf ? Number(qualificationBestOf) : undefined,
      })
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem' }

  const qualificationSummary =
    qualificationMode === 'Highscore' ? `Highscore, ${qualificationRounds || '?'} Runden` : `X01 auf ${qualificationStartScore}`
  const finalSummary = finalMode === 'Highscore' ? `Highscore, ${finalRounds || '?'} Runden` : `X01 auf ${finalStartScore}`

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {error && (
        <p role="alert" style={{ color: DANGER, margin: 0 }}>
          {error}
        </p>
      )}
      <div style={{ ...rowCardStyle(), display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
        <div>
          <h5 style={sectionHeadingStyle()}>Qualifikation</h5>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: TEXT_FAINT }}>
            Die Vorrunde, aus der die Rangliste entsteht - jeder Spieler tritt mehrfach an.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap' }}>
          <label style={fieldStyle}>
            Modus
            <select value={qualificationMode} onChange={(e) => setQualificationMode(e.target.value as 'Highscore' | 'X01')}>
              <option value="Highscore">Highscore</option>
              <option value="X01">X01</option>
            </select>
          </label>
          {qualificationMode === 'Highscore' ? (
            <label style={fieldStyle}>
              Runden
              <input
                type="number"
                min="1"
                value={qualificationRounds}
                onChange={(e) => setQualificationRounds(e.target.value)}
              />
            </label>
          ) : (
            <label style={fieldStyle}>
              Startscore
              <select value={qualificationStartScore} onChange={(e) => setQualificationStartScore(e.target.value as '301' | '501')}>
                <option value="301">301</option>
                <option value="501">501</option>
              </select>
            </label>
          )}
          <label style={fieldStyle}>
            Beste X Spiele für Rangliste (leer = alle)
            <input type="number" min="1" value={qualificationBestOf} onChange={(e) => setQualificationBestOf(e.target.value)} />
          </label>
        </div>
      </div>
      <div style={{ ...rowCardStyle(), display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
        <div>
          <h5 style={sectionHeadingStyle()}>Finale</h5>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: TEXT_FAINT }}>
            Die KO-Runde nach der Qualifikation - Duelle im Modus deiner Wahl.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap' }}>
          <label style={fieldStyle}>
            Modus
            <select value={finalMode} onChange={(e) => setFinalMode(e.target.value as 'Highscore' | 'X01')}>
              <option value="Highscore">Highscore</option>
              <option value="X01">X01</option>
            </select>
          </label>
          {finalMode === 'Highscore' ? (
            <label style={fieldStyle}>
              Runden
              <input type="number" min="1" value={finalRounds} onChange={(e) => setFinalRounds(e.target.value)} />
            </label>
          ) : (
            <label style={fieldStyle}>
              Startscore
              <select value={finalStartScore} onChange={(e) => setFinalStartScore(e.target.value as '301' | '501')}>
                <option value="301">301</option>
                <option value="501">501</option>
              </select>
            </label>
          )}
        </div>
      </div>
      <p style={{ margin: 0, fontSize: '0.8rem', color: TEXT_MUTED }}>
        Zusammenfassung: <strong style={{ color: TEXT }}>{qualificationSummary}</strong> → <strong style={{ color: TEXT }}>{finalSummary}</strong>
      </p>
      <button type="submit" className="primary" style={{ alignSelf: 'flex-start' }}>
        Turnier anlegen
      </button>
    </form>
  )
}
