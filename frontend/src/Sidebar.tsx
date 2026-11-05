import type { ReactNode } from 'react'
import logo from './assets/logo-full-transparent.svg'
import { BORDER, FONT_DISPLAY, FONT_SIZE_NAV, SURFACE, SURFACE_2, TEXT_FAINT, TEXT_MUTED } from './theme'

export interface SidebarNavItem {
  id: string
  label: string
  icon: ReactNode
  active: boolean
  onClick: () => void
}

/**
 * Shared app-shell sidebar - logo/wordmark, an optional "active event" card,
 * an optional nav item list, and a footer action list. Previously App.tsx
 * and EventDetailView.tsx each had their own copy-pasted `<aside>` (same
 * markup for the logo block, but one had no nav at all and the other had
 * the full NAV_ITEMS) that could silently drift apart on future edits.
 */
export function Sidebar({
  primary,
  activeEventCard,
  navItems,
  footerActions,
  footerExtra,
}: {
  primary: string
  activeEventCard?: { name: string; customerName: string }
  navItems?: SidebarNavItem[]
  footerActions: { label: string; onClick: () => void }[]
  footerExtra?: ReactNode
}) {
  return (
    <aside
      style={{
        background: SURFACE,
        borderRight: `1px solid ${BORDER}`,
        padding: '1.2rem 0.9rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.2rem',
      }}
    >
      {!navItems && <img src={logo} alt="LetsPlayDarts" style={{ maxWidth: '100%', opacity: 0.85 }} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0 0.3rem' }}>
        <div
          style={{
            width: '1.9rem',
            height: '1.9rem',
            borderRadius: '0.5rem',
            background: primary,
            color: '#1a1206',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: '0.95rem',
          }}
        >
          D
        </div>
        <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: '0.85rem', letterSpacing: '0.02em' }}>DARTS REGIE</span>
      </div>

      {activeEventCard && (
        <div style={{ background: SURFACE_2, border: `1px solid ${BORDER}`, borderRadius: '0.6rem', padding: '0.6rem 0.7rem' }}>
          <p style={{ margin: '0 0 0.2rem', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: TEXT_FAINT }}>
            Aktives event
          </p>
          <p style={{ margin: '0 0 0.1rem', fontSize: '0.85rem', fontWeight: 600 }}>{activeEventCard.name}</p>
          <p style={{ margin: 0, fontSize: '0.75rem', color: TEXT_MUTED }}>{activeEventCard.customerName}</p>
        </div>
      )}

      {navItems ? (
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', flex: 1 }}>
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.55rem',
                textAlign: 'left',
                border: 'none',
                borderRadius: '0.5rem',
                padding: '0.5rem 0.6rem',
                fontSize: FONT_SIZE_NAV,
                fontWeight: item.active ? 700 : 500,
                background: item.active ? SURFACE_2 : 'transparent',
                color: item.active ? primary : TEXT_MUTED,
                cursor: 'pointer',
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
      ) : (
        <div style={{ flex: 1 }} />
      )}

      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {footerActions.map((action) => (
          <button key={action.label} type="button" onClick={action.onClick}>
            {action.label}
          </button>
        ))}
        {footerExtra}
      </div>
    </aside>
  )
}
