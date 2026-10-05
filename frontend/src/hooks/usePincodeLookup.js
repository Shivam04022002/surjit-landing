import { useEffect, useRef, useState } from 'react'
import { lookupPincode } from '../services/pincodeService'
import { describeError } from '../services/apiClient'

const PIN = /^[1-9][0-9]{5}$/
export const PINCODE_DEBOUNCE_MS = 400

const IDLE = { status: 'idle', message: '' }

// Looks up a PIN code shortly after the visitor stops typing, and hands the
// place to `onFound`.
//
// Only the newest lookup can win: each one is tagged with a sequence number
// and aborted when superseded, and its result is applied only if it is still
// the latest *and* the PIN it was for is still the current one. A slow answer
// for an old PIN can never overwrite the address for a newer PIN.
//
// A failed lookup never blocks the form; the fields stay editable.
//
// status: 'idle' | 'loading' | 'found' | 'error'
export const usePincodeLookup = (pin, onFound) => {
  // Each state records the PIN it describes, so a status left over from an
  // earlier PIN is never shown for the current one.
  const [result, setResult] = useState({ pin: null, ...IDLE })
  const seq = useRef(0)
  const latestPin = useRef(pin)
  const onFoundRef = useRef(onFound)

  useEffect(() => {
    onFoundRef.current = onFound
  }, [onFound])

  useEffect(() => {
    latestPin.current = pin
    const id = ++seq.current
    if (!PIN.test(pin || '')) return undefined

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setResult({ pin, status: 'loading', message: 'Looking up your PIN code…' })
      try {
        const place = await lookupPincode(pin, { signal: controller.signal })
        if (id !== seq.current || latestPin.current !== pin) return
        onFoundRef.current?.(place)
        setResult({ pin, status: 'found', message: 'Location filled from your PIN code. You can edit it if needed.' })
      } catch (error) {
        if (controller.signal.aborted || id !== seq.current) return
        const { kind } = describeError(error)
        setResult({
          pin,
          status: 'error',
          message: kind === 'not_found'
            ? 'We could not find this PIN code. Please check it, or enter your state and district below.'
            : 'We could not look up this PIN code right now. Please enter your state and district below.'
        })
      }
    }, PINCODE_DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [pin])

  return result.pin === pin && PIN.test(pin || '') ? { status: result.status, message: result.message } : IDLE
}
