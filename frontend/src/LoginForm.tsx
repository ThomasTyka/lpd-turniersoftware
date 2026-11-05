import { useState } from 'react'
import { api } from './api'
import { DANGER, DEFAULT_PRIMARY, buttonStyle, panelStyle } from './theme'

export function LoginForm({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await api.login(username, password)
      onLoggedIn()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        ...panelStyle(),
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        width: '100%',
        maxWidth: '22rem',
        padding: '1.5rem',
      }}
    >
      <h1 style={{ margin: 0, fontSize: '1.3rem', textAlign: 'center' }}>Anmeldung</h1>
      {error && (
        <p role="alert" style={{ color: DANGER, margin: 0 }}>
          {error}
        </p>
      )}
      <label>
        Benutzername
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoFocus
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
      </label>
      <label>
        Passwort
        <div style={{ position: 'relative' }}>
          <input
            style={{ paddingRight: '2.6rem', width: '100%' }}
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
            title={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
            style={{
              position: 'absolute',
              right: '0.4rem',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              padding: '0.3rem',
              cursor: 'pointer',
              color: DEFAULT_PRIMARY,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {showPassword ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3l18 18" />
                <path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" />
                <path d="M9.9 5.1A10.9 10.9 0 0 1 12 5c6 0 10 7 10 7a13.2 13.2 0 0 1-3.3 3.9M6.6 6.6C4 8.3 2 12 2 12s4 7 10 7a10 10 0 0 0 3.4-.6" />
              </svg>
            )}
          </button>
        </div>
      </label>
      <button type="submit" disabled={submitting} style={{ ...buttonStyle(DEFAULT_PRIMARY, 'primary'), textAlign: 'center' }}>
        {submitting ? 'Wird geprüft…' : 'Anmelden'}
      </button>
    </form>
  )
}
