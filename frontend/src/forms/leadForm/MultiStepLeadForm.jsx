import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { ChevronLeft, ChevronRight, LoaderCircle, Send, CircleCheck, CircleAlert, RotateCcw, ShieldCheck } from 'lucide-react'
import StepIndicator from './StepIndicator'
import { StepLocation, StepLoan, StepFinancial, StepBusiness } from './steps'
import {
  STEPS, DEFAULT_VALUES, DEFAULT_LOAN_BOUNDS, buildRules, toLeadPayload, stepOfField
} from './leadFormConfig'
import { usePincodeLookup } from '../../hooks/usePincodeLookup'
import { submitLead, getLeadConfig, newIdempotencyKey } from '../../services/leadService'
import { describeError } from '../../services/apiClient'
import { track } from '../../services/analytics'
import './MultiStepLeadForm.css'

const LAST_STEP = STEPS.length
const FAILURE_REASON = { validation: 'validation', rate_limited: 'rate_limited', network: 'network' }

// The four-step business loan enquiry.
//
// Values live in one React Hook Form instance for the whole form, so moving
// back and forward never loses them. Each "Continue" validates only the
// current step's fields. The success panel appears only after the API has
// confirmed the lead was saved.
//
// Analytics records the form's progress (start, steps, which field failed
// validation, submit outcome) and never a value the visitor typed.
const MultiStepLeadForm = ({ copy }) => {
  const [step, setStep] = useState(1)
  const [bounds, setBounds] = useState(DEFAULT_LOAN_BOUNDS)
  const [submission, setSubmission] = useState({ status: 'idle', message: '', reference: '' })
  const [announcement, setAnnouncement] = useState('')

  // One key per set of details: kept across retries of the same details (so a
  // retry after a lost response cannot create a duplicate lead), replaced when
  // the visitor changes anything before retrying (the API refuses a key reused
  // for different details with 409), and replaced once a lead is confirmed.
  const idempotencyKey = useRef(newIdempotencyKey())
  const keyPayload = useRef(null)
  const submitting = useRef(false)
  const started = useRef(false)
  const stepHeading = useRef(null)
  const successHeading = useRef(null)
  const focusAfterStep = useRef(null)
  const firstRender = useRef(true)

  const rules = useMemo(() => buildRules(bounds), [bounds])

  const {
    register, control, handleSubmit, trigger, setValue, setError, setFocus, reset, getFieldState,
    formState: { errors }
  } = useForm({ mode: 'onTouched', defaultValues: DEFAULT_VALUES, shouldUnregister: false })

  const pinCode = useWatch({ control, name: 'pinCode' })
  const amount = useWatch({ control, name: 'desiredLoanAmount' })

  // The API is the authority on loan bounds; the build-time values are only a
  // fallback if it cannot be reached.
  useEffect(() => {
    let cancelled = false
    getLeadConfig()
      .then((cfg) => {
        const min = Number(cfg?.loanAmount?.min)
        const max = Number(cfg?.loanAmount?.max)
        if (!cancelled && Number.isFinite(min) && Number.isFinite(max) && max > min) setBounds({ min, max })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const onPlaceFound = useCallback((place) => {
    const opts = { shouldValidate: true, shouldDirty: true }
    if (place.state) setValue('state', place.state, opts)
    if (place.district) setValue('district', place.district, opts)
    if (place.country) setValue('country', place.country, opts)
  }, [setValue])

  const lookup = usePincodeLookup(pinCode, onPlaceFound)

  // Every step change goes through here, so it is always announced.
  const goToStep = (n) => {
    setStep(n)
    setAnnouncement(`Step ${n} of ${LAST_STEP}: ${STEPS[n - 1].title}`)
  }

  // On every step change after the first render: report the step and move
  // focus to its heading (or to a field the server rejected).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    if (submission.status === 'success') return
    track('form_step_viewed', { step })
    if (focusAfterStep.current) {
      setFocus(focusAfterStep.current)
      focusAfterStep.current = null
    } else {
      stepHeading.current?.focus()
    }
  }, [step, setFocus, submission.status])

  useEffect(() => {
    if (submission.status === 'success') successHeading.current?.focus()
  }, [submission.status])

  const markStarted = () => {
    if (started.current) return
    started.current = true
    track('form_start')
    track('form_step_viewed', { step: 1 })
  }

  const reportInvalid = (stepNumber, fields) => {
    for (const field of fields) {
      if (getFieldState(field).error) track('validation_error', { step: stepNumber, field })
    }
  }

  const goNext = async () => {
    markStarted()
    const fields = STEPS[step - 1].fields
    const valid = await trigger(fields, { shouldFocus: true })
    if (!valid) {
      reportInvalid(step, fields)
      return
    }
    track('form_step_completed', { step })
    goToStep(Math.min(step + 1, LAST_STEP))
  }

  const goBack = () => goToStep(Math.max(step - 1, 1))

  const submitValid = async (values) => {
    // A second click while the first request is in flight does nothing.
    if (submitting.current) return
    submitting.current = true
    setSubmission({ status: 'submitting', message: '', reference: '' })
    setAnnouncement('Submitting your enquiry…')
    track('form_submit_attempted')

    try {
      const payload = toLeadPayload(values)
      const payloadJson = JSON.stringify(payload)
      if (keyPayload.current !== null && keyPayload.current !== payloadJson) {
        idempotencyKey.current = newIdempotencyKey()
      }
      keyPayload.current = payloadJson
      const { reference } = await submitLead(payload, idempotencyKey.current)
      track('form_step_completed', { step: LAST_STEP })
      track('form_submit_succeeded')
      idempotencyKey.current = newIdempotencyKey()
      keyPayload.current = null
      setSubmission({ status: 'success', message: '', reference })
      setAnnouncement('Your enquiry has been submitted.')
    } catch (error) {
      const info = describeError(error)
      track('form_submit_failed', { reason: FAILURE_REASON[info.kind] || 'server' })

      const rejected = Object.keys(info.fieldErrors).filter((f) => f in DEFAULT_VALUES)
      for (const field of rejected) setError(field, { type: 'server', message: info.fieldErrors[field] })

      let message = info.message
      if (rejected.length) {
        const firstStep = Math.min(...rejected.map(stepOfField))
        const firstField = STEPS[firstStep - 1].fields.find((f) => rejected.includes(f))
        if (firstStep !== step) {
          focusAfterStep.current = firstField
          goToStep(firstStep)
        } else {
          setFocus(firstField)
        }
        message = 'Please correct the highlighted details and submit again.'
      }
      setSubmission({ status: 'error', message, reference: '' })
      setAnnouncement(message)
    } finally {
      submitting.current = false
    }
  }

  const submitInvalid = () => reportInvalid(LAST_STEP, STEPS[LAST_STEP - 1].fields)

  const onSubmit = (e) => {
    e.preventDefault()
    markStarted()
    // Enter on steps 1–3 moves on rather than submitting.
    if (step < LAST_STEP) return goNext()
    return handleSubmit(submitValid, submitInvalid)(e)
  }

  const startOver = () => {
    track('cta_click', { ctaId: 'success_restart' })
    reset(DEFAULT_VALUES)
    started.current = false
    firstRender.current = true
    setSubmission({ status: 'idle', message: '', reference: '' })
    setStep(1)
    setAnnouncement('Form cleared. Step 1 of 4: Location')
  }

  const isSubmitting = submission.status === 'submitting'
  const current = STEPS[step - 1]

  return (
    <div className="lf-card">
      <header className="lf-header">
        <h2 className="lf-title" id="lead-form-title">{copy.title}</h2>
        <p className="lf-subtitle">{copy.subtitle}</p>
      </header>

      <p className="visually-hidden" aria-live="polite" aria-atomic="true">{announcement}</p>

      {submission.status === 'success' ? (
        <div className="lf-success">
          <CircleCheck className="lf-success-icon" size={56} aria-hidden="true" />
          <h3 ref={successHeading} tabIndex={-1}>{copy.successTitle}</h3>
          <p className="lf-reference">
            Your reference: <strong>{submission.reference}</strong>
          </p>
          <p>{copy.successBody}</p>
          <p className="lf-muted">{copy.successDisclaimer}</p>
          <button type="button" className="btn btn-secondary" onClick={startOver}>
            <RotateCcw size={18} aria-hidden="true" /> Submit another enquiry
          </button>
        </div>
      ) : (
        <>
          <StepIndicator current={step} />

          <form
            className="lf-form"
            onSubmit={onSubmit}
            onFocus={markStarted}
            noValidate
            aria-labelledby="lead-form-title"
            aria-busy={isSubmitting ? 'true' : 'false'}
          >
            <fieldset className="lf-fieldset" disabled={isSubmitting}>
              <legend className="visually-hidden">Step {step} of {LAST_STEP}: {current.title}</legend>
              <h3 className="lf-step-heading" ref={stepHeading} tabIndex={-1}>
                <span className="lf-step-count">Step {step} of {LAST_STEP}</span>
                {current.title}
              </h3>

              {step === 1 && <StepLocation register={register} rules={rules} errors={errors} lookup={lookup} />}
              {step === 2 && <StepLoan register={register} rules={rules} errors={errors} bounds={bounds} amount={amount} />}
              {step === 3 && <StepFinancial register={register} rules={rules} errors={errors} />}
              {step === 4 && <StepBusiness register={register} rules={rules} errors={errors} copy={copy} />}
            </fieldset>

            {submission.status === 'error' && (
              <div className="lf-alert" role="alert">
                <CircleAlert size={20} aria-hidden="true" />
                <p>{submission.message}</p>
              </div>
            )}

            <div className="lf-actions">
              {step > 1 && (
                <button type="button" className="btn btn-secondary" onClick={goBack} disabled={isSubmitting}>
                  <ChevronLeft size={18} aria-hidden="true" /> Back
                </button>
              )}
              {step < LAST_STEP ? (
                <button type="submit" className="btn btn-primary lf-next">
                  Continue <ChevronRight size={18} aria-hidden="true" />
                </button>
              ) : (
                <button type="submit" className="btn btn-primary lf-next" disabled={isSubmitting}>
                  {isSubmitting
                    ? <><LoaderCircle className="lf-spin" size={18} aria-hidden="true" /> Submitting…</>
                    : <>Submit Enquiry <Send size={18} aria-hidden="true" /></>}
                </button>
              )}
            </div>
          </form>
        </>
      )}

      <p className="lf-security">
        <ShieldCheck size={18} aria-hidden="true" />
        <span>{copy.securityNote}</span>
      </p>
    </div>
  )
}

export default MultiStepLeadForm
