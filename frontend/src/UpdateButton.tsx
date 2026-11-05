import { useEffect, useRef, useState } from 'react'
import { api, type UpdateState } from './api'
import { DANGER, FONT_SIZE_META, SUCCESS, TEXT_FAINT } from './theme'

const POLL_INTERVAL_MS = 2000
// Covers the container-restart gap after a successful rebuild (a few
// seconds) plus slack for a slow `docker compose build` - comfortably longer
// than either, so a stalled watcher is what finally trips this, not a normal
// update.
const POLL_TIMEOUT_MS = 3 * 60_000

const LABEL: Record<UpdateState, string> = {
  idle: 'Nach Update suchen',
  running: 'Aktualisiere…',
  success: 'Update installiert',
  error: 'Update fehlgeschlagen',
}

/**
 * Pulls the latest code from GitHub and rebuilds/restarts the server - see
 * AdminEndpoints.cs for why this has to go through a file-trigger to a
 * separate host-side script rather than happening in-process (the container
 * itself has no git or docker access to update itself).
 */
export function UpdateButton() {
  const [state, setState] = useState<UpdateState>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollStartedAt = useRef(0)

  useEffect(() => () => stopPolling(), [])

  function stopPolling() {
    if (pollTimer.current) clearInterval(pollTimer.current)
    pollTimer.current = null
  }

  function startPolling() {
    stopPolling()
    pollStartedAt.current = Date.now()
    pollTimer.current = setInterval(async () => {
      if (Date.now() - pollStartedAt.current > POLL_TIMEOUT_MS) {
        stopPolling()
        setState('error')
        setMessage('Zeitüberschreitung - bitte Server-Status manuell prüfen.')
        return
      }
      try {
        const status = await api.getUpdateStatus()
        setState(status.state)
        setMessage(status.message)
        if (status.state === 'success' || status.state === 'error') stopPolling()
      } catch {
        // During the rebuild the container briefly isn't reachable at all -
        // that's expected mid-update, not a failure, so keep polling.
      }
    }, POLL_INTERVAL_MS)
  }

  async function handleClick() {
    if (state === 'running') return
    setState('running')
    setMessage('Update angefordert…')
    try {
      const status = await api.triggerUpdate()
      setState(status.state)
      setMessage(status.message)
      startPolling()
    } catch (err) {
      setState('error')
      setMessage(err instanceof Error ? err.message : 'Update konnte nicht gestartet werden.')
    }
  }

  const color = state === 'success' ? SUCCESS : state === 'error' ? DANGER : TEXT_FAINT

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <button type="button" onClick={handleClick} disabled={state === 'running'}>
        {LABEL[state]}
      </button>
      {message && (
        <span style={{ fontSize: FONT_SIZE_META, color, lineHeight: 1.3 }}>{message}</span>
      )}
    </div>
  )
}
