import { useState } from 'react'
import { DANGER, buttonStyle } from './theme'

/**
 * Two-click confirmation for destructive actions (Event/Board/Spiel/Turnier
 * löschen etc.) - first click arms it for 2.5s and swaps the label to
 * "Zum Bestätigen erneut klicken", second click within that window actually
 * runs the action. Was previously duplicated inline 6+ times with slightly
 * different styling each time; this is the one shared implementation.
 */
export function ConfirmDeleteButton({
  label,
  confirmLabel = 'Zum Bestätigen erneut klicken',
  onConfirm,
  size = 'md',
}: {
  label: string
  confirmLabel?: string
  onConfirm: () => Promise<unknown>
  size?: 'md' | 'sm'
}) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClick = async () => {
    if (!confirming) {
      setConfirming(true)
      setTimeout(() => setConfirming(false), 2500)
      return
    }
    setError(null)
    try {
      await onConfirm()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      {error && (
        <p role="alert" style={{ color: DANGER, margin: 0, fontSize: '0.75rem' }}>
          {error}
        </p>
      )}
      <button type="button" onClick={handleClick} style={buttonStyle('', 'danger', size)}>
        {confirming ? confirmLabel : label}
      </button>
    </div>
  )
}
