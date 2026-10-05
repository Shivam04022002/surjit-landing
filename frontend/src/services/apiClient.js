import axios from 'axios'

// The one HTTP client for the landing page API. Every response uses the
// envelope { success, message, data } / { success: false, message, errors }.
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000,
  headers: { Accept: 'application/json' }
})

// Turns any failure into something the UI can act on, without exposing
// transport details to the visitor:
//
//   kind         'validation' | 'rate_limited' | 'not_found' | 'server' | 'network'
//   message      safe, human-readable
//   fieldErrors  { [field]: message } from a 422
export const describeError = (error) => {
  const response = error?.response
  if (!response) {
    return {
      kind: 'network',
      status: 0,
      message: 'We could not reach our server. Please check your connection and try again.',
      fieldErrors: {}
    }
  }

  const body = response.data && typeof response.data === 'object' ? response.data : {}
  const fieldErrors = {}
  for (const e of Array.isArray(body.errors) ? body.errors : []) {
    if (e && typeof e.field === 'string' && typeof e.message === 'string' && !fieldErrors[e.field]) {
      fieldErrors[e.field] = e.message
    }
  }

  const status = response.status
  const kind = status === 422 || status === 400 ? 'validation'
    : status === 429 ? 'rate_limited'
      : status === 404 ? 'not_found'
        : 'server'

  const fallback = kind === 'rate_limited'
    ? 'Too many attempts. Please wait a while and try again.'
    : 'Something went wrong on our side. Please try again.'

  return {
    kind,
    status,
    message: typeof body.message === 'string' && body.message ? body.message : fallback,
    fieldErrors
  }
}
