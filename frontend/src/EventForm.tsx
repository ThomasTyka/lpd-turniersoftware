import { useState } from 'react'
import { api, type EventBranding } from './api'
import { BrandingPanel } from './BrandingPanel'
import { DatePicker } from './DatePicker'
import { DANGER } from './theme'

const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem' }

export function EventForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [location, setLocation] = useState('')
  const [plannedBoardCount, setPlannedBoardCount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [createdEventId, setCreatedEventId] = useState<string | null>(null)
  const [createdEventName, setCreatedEventName] = useState('')
  const [branding, setBranding] = useState<EventBranding | null>(null)

  const reloadBranding = (eventId: string) => {
    api.getBranding(eventId).then(setBranding).catch(() => {})
  }

  const finish = () => {
    setName('')
    setCustomerName('')
    setEventDate('')
    setLocation('')
    setPlannedBoardCount('')
    setCreatedEventId(null)
    setBranding(null)
    onCreated()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const created = await api.createEvent({
        name,
        customerName,
        eventDate,
        location,
        plannedBoardCount: plannedBoardCount ? Number(plannedBoardCount) : undefined,
      })
      setCreatedEventId(created.id)
      setCreatedEventName(created.name)
      reloadBranding(created.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (createdEventId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <p style={{ margin: 0, fontSize: '0.85rem' }}>
          „{createdEventName}" wurde angelegt. Logo und Farben können jetzt hinterlegt werden (optional) - für Leinwand- und
          Board-Anzeige.
        </p>
        <BrandingPanel
          eventId={createdEventId}
          hasLogo={branding?.hasLogo ?? false}
          logoVersion={branding?.logoVersion ?? null}
          primaryColor={branding?.primaryColor ?? null}
          secondaryColor={branding?.secondaryColor ?? null}
          onSaved={() => reloadBranding(createdEventId)}
        />
        <button type="button" className="primary" onClick={finish} style={{ alignSelf: 'flex-start' }}>
          Fertig
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      {error && (
        <p role="alert" style={{ color: DANGER, margin: 0 }}>
          {error}
        </p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))', gap: '0.9rem' }}>
        <label style={fieldStyle}>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label style={fieldStyle}>
          Kunde
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
        </label>
        <label style={fieldStyle}>
          Datum
          <DatePicker value={eventDate} onChange={setEventDate} required />
        </label>
        <label style={fieldStyle}>
          Ort
          <input value={location} onChange={(e) => setLocation(e.target.value)} required />
        </label>
        <label style={fieldStyle}>
          Geplante Boards
          <input
            type="number"
            min="1"
            value={plannedBoardCount}
            onChange={(e) => setPlannedBoardCount(e.target.value)}
          />
        </label>
      </div>
      <button type="submit" className="primary" disabled={submitting} style={{ alignSelf: 'flex-start' }}>
        {submitting ? 'Wird angelegt…' : 'Event anlegen'}
      </button>
    </form>
  )
}
