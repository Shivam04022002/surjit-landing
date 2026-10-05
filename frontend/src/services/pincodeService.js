import { api } from './apiClient'

// Resolves a 6-digit PIN to { state, district, country } through the API's
// lookup proxy. `signal` lets the caller abort a lookup that is no longer
// wanted (the visitor kept typing).
export const lookupPincode = async (pin, { signal } = {}) => {
  const response = await api.get(`/pincode/${encodeURIComponent(pin)}`, { signal, timeout: 8000 })
  const { state, district, country } = response.data.data
  return { state, district, country }
}
