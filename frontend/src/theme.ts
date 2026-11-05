import type { CSSProperties } from 'react'

export const DEFAULT_PRIMARY = '#ffad00'
export const DEFAULT_SECONDARY = '#3a1f00'

export const FONT_DISPLAY = '"Bahnschrift", "SF Compact Condensed", "Arial Narrow", "Segoe UI", sans-serif'
export const FONT_BODY = 'system-ui, "Segoe UI", Roboto, sans-serif'

/** Warm, near-black "control room" surfaces - fixed regardless of event branding, so cards/tables stay legible no matter what accent color a customer's logo produces. Only the accent (event primary) and the page background wash (event secondary, kept subtle) vary per event. */
export const SURFACE = '#1a140d'
export const SURFACE_2 = '#241b10'
export const BORDER = '#3a2c1a'
export const TEXT = '#f5ead8'
export const TEXT_MUTED = '#b9a688'
export const TEXT_FAINT = '#8a7a60'
export const SUCCESS = '#3ddc84'
export const SUCCESS_BG = '#123424'
export const DANGER = '#e05252'
export const DANGER_BG = '#3a1414'
export const WARNING = '#e8b800'
export const WARNING_BG = '#3a2f06'

/**
 * Type scale - names the sizes already in de facto use across the app, and
 * gives the sidebar nav a real value instead of an unexplained 1.05rem
 * outlier from earlier iterative "make it bigger" requests.
 */
export const FONT_SIZE_PAGE_TITLE = '1.5rem'
export const FONT_SIZE_PANEL_TITLE = '0.95rem'
export const FONT_SIZE_NAV = '0.85rem'
export const FONT_SIZE_BODY = '0.85rem'
export const FONT_SIZE_LABEL = '0.8rem'
export const FONT_SIZE_META = '0.75rem'
export const FONT_SIZE_EYEBROW = '0.68rem'

/**
 * Full-page background wash, event-branded via a faint flat tint of the
 * secondary color - the same idea as the public displays' background, kept
 * subtle here so it reads as "control room", not another colored surface.
 */
export function pageStyle(secondary: string): CSSProperties {
  return {
    minHeight: '100vh',
    boxSizing: 'border-box',
    background: `${secondary}22`,
    color: TEXT,
    fontFamily: FONT_BODY,
  }
}

export function panelStyle(): CSSProperties {
  return {
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: '0.75rem',
    overflow: 'hidden',
  }
}

export function panelHeadStyle(): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.9rem 1.1rem 0.8rem',
    borderBottom: `1px solid ${BORDER}`,
  }
}

export function statTileStyle(): CSSProperties {
  return {
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: '0.75rem',
    padding: '0.9rem 1.1rem',
  }
}

/**
 * The missing middle tier between panelStyle() (outer card, radius 0.75rem)
 * and plain text - a filled, bordered "nested card" for content grouped
 * inside a panel (a tournament's status box, a KO match row, a group-round
 * row...). Previously each file reinvented this slightly differently
 * (filled-no-border in some, bordered-no-fill in others, radius 0.6rem vs
 * 0.7rem) - this is now the one shape for that concept.
 */
export function rowCardStyle(): CSSProperties {
  return {
    background: SURFACE_2,
    border: `1px solid ${BORDER}`,
    borderRadius: '0.6rem',
    padding: '0.8rem 0.9rem',
  }
}

/** Small uppercase-free muted heading for a sub-section inside a card (e.g. "Qualifikation", "KO-Runde") - was copy-pasted as a literal style object in 7+ places. */
export function sectionHeadingStyle(): CSSProperties {
  return { margin: 0, fontSize: FONT_SIZE_BODY, color: TEXT_MUTED }
}

export function pillStyle(tone: 'on' | 'off' | 'warn', accent?: string): CSSProperties {
  const background = tone === 'on' ? SUCCESS_BG : tone === 'warn' ? WARNING_BG : DANGER_BG
  const color = tone === 'on' ? (accent ?? SUCCESS) : tone === 'warn' ? WARNING : DANGER
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35rem',
    fontSize: '0.72rem',
    fontWeight: 700,
    padding: '0.2rem 0.55rem',
    borderRadius: '999px',
    background,
    color,
  }
}

/**
 * variant 'danger' and the 'sm' size were added to replace 6+ call sites
 * that each hand-rolled a slightly different inline override for "small
 * secondary action" or "destructive action" (different padding/font-size
 * every time).
 */
export function buttonStyle(
  primary: string,
  variant: 'primary' | 'secondary' | 'danger' = 'secondary',
  size: 'md' | 'sm' = 'md',
): CSSProperties {
  const base: CSSProperties = {
    fontFamily: FONT_BODY,
    fontWeight: variant === 'primary' ? 700 : 600,
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontSize: size === 'sm' ? FONT_SIZE_META : FONT_SIZE_BODY,
    padding: size === 'sm' ? '0.3rem 0.55rem' : '0.5rem 0.9rem',
  }
  if (variant === 'primary') return { ...base, border: `1px solid ${primary}`, background: primary, color: '#1a1206' }
  if (variant === 'danger') return { ...base, border: `1px solid ${DANGER}`, background: 'transparent', color: DANGER }
  return { ...base, border: `1px solid ${BORDER}`, background: SURFACE_2, color: TEXT }
}

export function tableStyle(): CSSProperties {
  return { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }
}

export function thStyle(): CSSProperties {
  return {
    textAlign: 'left',
    fontSize: '0.68rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: TEXT_FAINT,
    fontWeight: 600,
    padding: '0.5rem 1.1rem',
    borderBottom: `1px solid ${BORDER}`,
  }
}

export function tdStyle(): CSSProperties {
  return { padding: '0.6rem 1.1rem', borderBottom: `1px solid ${BORDER}`, verticalAlign: 'middle' }
}
