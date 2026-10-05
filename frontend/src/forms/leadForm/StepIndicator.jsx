import { Check } from 'lucide-react'
import { STEPS } from './leadFormConfig'

// Four circles joined by a line that fills as steps are completed. Each step's
// state is spoken ("completed", "current step") as well as shown, so progress
// does not rely on colour.
const StepIndicator = ({ current }) => (
  <ol className="lf-steps" aria-label="Form progress">
    {STEPS.map((step, index) => {
      const done = step.number < current
      const active = step.number === current
      const state = done ? 'is-done' : active ? 'is-active' : ''
      return (
        <li
          key={step.key}
          className={`lf-step ${state}`}
          aria-current={active ? 'step' : undefined}
        >
          {index > 0 && <span className={`lf-step-line ${step.number <= current ? 'is-filled' : ''}`} aria-hidden="true" />}
          <span className="lf-step-circle" aria-hidden="true">
            {done ? <Check size={18} strokeWidth={3} /> : step.number}
          </span>
          {/* Full title for every screen and for assistive technology; the
              short label replaces it visually on narrow phones only. */}
          <span className="lf-step-title">
            <span className="lf-step-title-full">{step.title}</span>
            <span className="lf-step-title-short" aria-hidden="true">{step.shortTitle}</span>
            <span className="visually-hidden">
              {done ? ' (completed)' : active ? ' (current step)' : ''}
            </span>
          </span>
        </li>
      )
    })}
  </ol>
)

export default StepIndicator
