// First-party, anonymous analytics for the landing page.
//
// What is sent: an event name from the allowlist below, the page path, an
// anonymous session id, and — only for the detail an event needs — a step
// number, a form *field name*, a CTA/nav/FAQ identifier or a coarse failure
// reason. Page views also carry the referring site and UTM campaign tags.
//
// What is never sent: anything typed into the form (names, phone, PIN, loan
// amount, option choices), full URLs or query strings.
//
// Session: a random id kept in localStorage under `sfl_session`, expiring after
// 30 minutes of inactivity. It is not derived from the visitor and is never
// attached to a lead.
//
// Off entirely when VITE_ANALYTICS_ENABLED=false, or when the browser signals
// Do Not Track or Global Privacy Control.
//
// Mirrors backend/src/constants/analytics.js.

const SESSION_KEY = 'sfl_session'
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000

const EVENTS = new Set([
  'page_view', 'session_start', 'form_start', 'form_step_viewed', 'form_step_completed',
  'validation_error', 'form_submit_attempted', 'form_submit_succeeded', 'form_submit_failed',
  'cta_click', 'nav_click', 'faq_open'
])

// The only detail properties ever copied into a payload.
const DETAIL_KEYS = ['step', 'field', 'reason', 'ctaId', 'navTarget', 'faqId']
const UTM_KEYS = ['source', 'medium', 'campaign', 'term', 'content']
const UTM_PATTERN = /^[A-Za-z0-9._\-+]{1,100}$/
// A tag that is really a phone number is never sent. Mirrors isPhoneLike in
// backend/src/constants/analytics.js.
const PHONE_LIKE = /^(?:\d{10}|(?:91|0)[6-9]\d{9})$/
const isPhoneLike = (value) => PHONE_LIKE.test(String(value).replace(/[\s.\-_+()]/g, ''))

const isEnabled = () => {
  if (import.meta.env.VITE_ANALYTICS_ENABLED === 'false') return false
  if (typeof window === 'undefined') return false
  const nav = window.navigator || {}
  if (nav.doNotTrack === '1' || window.doNotTrack === '1' || nav.globalPrivacyControl === true) return false
  return true
}

const newId = () => {
  try {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID().replace(/-/g, '')
  } catch {
    // fall through
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`
}

// The current session, starting a new one when there is none or the last
// activity is older than the timeout. Returns { id, isNew }.
export const currentSession = (now = Date.now()) => {
  let session = null
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SESSION_KEY) || 'null')
    if (parsed?.id && typeof parsed.lastSeen === 'number' && now - parsed.lastSeen < SESSION_TIMEOUT_MS) {
      session = parsed
    }
  } catch {
    // Storage blocked or corrupt: a fresh in-memory session is fine.
  }

  const isNew = !session
  if (!session) session = { id: newId(), startedAt: now }
  session.lastSeen = now

  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // Non-fatal.
  }
  return { id: session.id, isNew }
}

// UTM tags from the landing URL. Malformed values are dropped.
export const utmFrom = (search) => {
  const params = new URLSearchParams(search || '')
  const utm = {}
  for (const key of UTM_KEYS) {
    const v = params.get(`utm_${key}`)
    if (v && UTM_PATTERN.test(v) && !isPhoneLike(v)) utm[key] = v
  }
  return Object.keys(utm).length ? utm : null
}

// A referrer from another site only; the server keeps just its host.
const externalReferrer = () => {
  try {
    if (!document.referrer) return ''
    return new URL(document.referrer).origin === window.location.origin ? '' : document.referrer
  } catch {
    return ''
  }
}

const send = (payload) => {
  const base = import.meta.env.VITE_API_BASE_URL || '/api'
  try {
    fetch(`${base}/analytics/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(() => {})
  } catch {
    // Analytics must never affect the page.
  }
}

// Builds the payload for an event, or null if it should not be sent. Exported
// for tests.
export const buildPayload = (name, detail = {}, sessionId) => {
  if (!EVENTS.has(name)) return null
  const payload = { name, sessionId, path: '/' }
  for (const key of DETAIL_KEYS) {
    if (detail[key] !== undefined && detail[key] !== null) payload[key] = detail[key]
  }
  return payload
}

export const track = (name, detail = {}) => {
  if (!isEnabled()) return
  const payload = buildPayload(name, detail, currentSession().id)
  if (payload) send(payload)
}

// Called once when the page loads: a page view, plus a session start when this
// visit began a new session. Both carry the referrer and campaign tags.
let pageViewSent = false
export const trackPageView = () => {
  if (!isEnabled() || pageViewSent) return
  pageViewSent = true

  const { id, isNew } = currentSession()
  const attribution = { referrer: externalReferrer() }
  const utm = utmFrom(window.location.search)
  if (utm) attribution.utm = utm

  if (isNew) send({ name: 'session_start', sessionId: id, path: '/', ...attribution })
  send({ name: 'page_view', sessionId: id, path: '/', ...attribution })
}
