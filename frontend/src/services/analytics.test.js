import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'

// The module keeps a "page view sent" flag, so each test gets a fresh copy.
const load = async () => {
  vi.resetModules()
  return import('./analytics')
}

let fetchMock

beforeEach(() => {
  localStorage.clear()
  fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 202 })))
  vi.stubGlobal('fetch', fetchMock)
  Object.defineProperty(window.navigator, 'doNotTrack', { value: null, configurable: true })
  Object.defineProperty(window.navigator, 'globalPrivacyControl', { value: undefined, configurable: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const sentBodies = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body))

describe('session', () => {
  test('is reused within 30 minutes of activity and replaced after', async () => {
    const { currentSession, SESSION_TIMEOUT_MS } = await load()
    const t0 = 1_700_000_000_000
    const first = currentSession(t0)
    expect(first.isNew).toBe(true)
    expect(first.id).toMatch(/^[A-Za-z0-9]{16,}$/)

    const again = currentSession(t0 + SESSION_TIMEOUT_MS - 1)
    expect(again).toEqual({ id: first.id, isNew: false })

    // Activity slides the window.
    const later = currentSession(t0 + 2 * SESSION_TIMEOUT_MS - 2)
    expect(later.id).toBe(first.id)

    const expired = currentSession(t0 + 4 * SESSION_TIMEOUT_MS)
    expect(expired.isNew).toBe(true)
    expect(expired.id).not.toBe(first.id)
  })

  test('survives blocked storage', async () => {
    const { currentSession } = await load()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(currentSession().id).toBeTruthy()
  })
})

describe('payloads', () => {
  test('only allowlisted events are built, with only allowlisted detail', async () => {
    const { buildPayload } = await load()
    expect(buildPayload('purchase', {}, 'abcdefgh12345678')).toBeNull()
    expect(buildPayload('validation_error', { step: 4, field: 'phoneNumber', value: '9876543210', phoneNumber: '9876543210' }, 'abcdefgh12345678'))
      .toEqual({ name: 'validation_error', sessionId: 'abcdefgh12345678', path: '/', step: 4, field: 'phoneNumber' })
  })

  test('track sends to the first-party endpoint only', async () => {
    const { track } = await load()
    track('cta_click', { ctaId: 'hero_apply' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/analytics/events')
    expect(sentBodies()[0]).toMatchObject({ name: 'cta_click', ctaId: 'hero_apply', path: '/' })
  })

  test('a network failure never throws into the page', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error('offline')))
    const { track } = await load()
    expect(() => track('form_start')).not.toThrow()
  })
})

describe('page view and attribution', () => {
  test('the first page view of a session sends session_start and page_view with UTM tags', async () => {
    window.history.replaceState(null, '', '/?utm_source=google&utm_medium=cpc&utm_campaign=diwali-2026&utm_term=ravi%40example.com&gclid=xyz')
    const { trackPageView } = await load()
    trackPageView()
    trackPageView() // only once per load

    const bodies = sentBodies()
    expect(bodies.map((b) => b.name)).toEqual(['session_start', 'page_view'])
    expect(bodies[1].utm).toEqual({ source: 'google', medium: 'cpc', campaign: 'diwali-2026' })
    expect(bodies[1].path).toBe('/')
    expect(JSON.stringify(bodies)).not.toContain('gclid')
    window.history.replaceState(null, '', '/')
  })

  test('a returning page view in the same session sends no session_start', async () => {
    const first = await load()
    first.trackPageView()
    fetchMock.mockClear()
    const second = await load()
    second.trackPageView()
    expect(sentBodies().map((b) => b.name)).toEqual(['page_view'])
  })

  test('utmFrom never sends a phone number in any UTM field', async () => {
    const { utmFrom } = await load()
    for (const key of ['source', 'medium', 'campaign', 'term', 'content']) {
      for (const phone of ['9876543210', '98765-43210', '%2B919876543210', '919876543210', '09876543210']) {
        expect(utmFrom(`?utm_${key}=${phone}&utm_medium=cpc`)?.[key]).toBeUndefined()
      }
    }
    expect(utmFrom('?utm_campaign=diwali-2026&utm_term=12345')).toEqual({ campaign: 'diwali-2026', term: '12345' })
  })

  test('utmFrom drops malformed tags', async () => {
    const { utmFrom } = await load()
    expect(utmFrom('?utm_source=news letter&utm_medium=email')).toEqual({ medium: 'email' })
    expect(utmFrom('')).toBeNull()
  })
})

describe('opt-out', () => {
  test('Do Not Track disables all events', async () => {
    Object.defineProperty(window.navigator, 'doNotTrack', { value: '1', configurable: true })
    const { track, trackPageView } = await load()
    trackPageView()
    track('form_start')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('Global Privacy Control disables all events', async () => {
    Object.defineProperty(window.navigator, 'globalPrivacyControl', { value: true, configurable: true })
    const { track } = await load()
    track('form_start')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('VITE_ANALYTICS_ENABLED=false disables all events', async () => {
    vi.stubEnv('VITE_ANALYTICS_ENABLED', 'false')
    const { track } = await load()
    track('form_start')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
