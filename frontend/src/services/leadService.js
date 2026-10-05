import { api } from './apiClient'

// Submits one enquiry. `idempotencyKey` identifies this submission attempt:
// a retry with the same key returns the original lead instead of creating a
// second one. Resolves to { reference } only once the API confirms the save.
export const submitLead = async (lead, idempotencyKey) => {
  const response = await api.post('/leads', lead, {
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }
  })
  if (!response.data?.success || !response.data?.data?.reference) {
    throw new Error('Unexpected response')
  }
  return { reference: response.data.data.reference }
}

// The loan amount bounds the API enforces.
export const getLeadConfig = async () => {
  const response = await api.get('/leads/config')
  return response.data.data
}

export const newIdempotencyKey = () => {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  } catch {
    // fall through
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`
}
