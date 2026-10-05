import { CircleAlert } from 'lucide-react'

// Accessible building blocks for the form. Every control has a visible label;
// its error (and any hint) is linked through aria-describedby, and the error
// carries an icon and text so it is never conveyed by colour alone.

const describedBy = (...ids) => ids.filter(Boolean).join(' ') || undefined

export const FieldError = ({ id, message }) =>
  message ? (
    <p id={id} className="lf-error">
      <CircleAlert size={16} aria-hidden="true" />
      <span>{message}</span>
    </p>
  ) : null

export const TextField = ({
  id, label, registration, error, hint, prefix, required = true, className = '', ...inputProps
}) => {
  const errorId = error ? `${id}-error` : null
  const hintId = hint ? `${id}-hint` : null
  return (
    <div className={`lf-field ${className}`}>
      <label htmlFor={id} className="lf-label">
        {label}{required && <span className="lf-required" aria-hidden="true"> *</span>}
      </label>
      <div className={`lf-input-wrap ${prefix ? 'has-prefix' : ''} ${error ? 'is-invalid' : ''}`}>
        {prefix && <span className="lf-prefix" aria-hidden="true">{prefix}</span>}
        <input
          id={id}
          className="lf-input"
          aria-invalid={error ? 'true' : 'false'}
          aria-required={required ? 'true' : undefined}
          aria-describedby={describedBy(hintId, errorId)}
          {...registration}
          {...inputProps}
        />
      </div>
      {hint && <p id={hintId} className="lf-hint">{hint}</p>}
      <FieldError id={errorId} message={error} />
    </div>
  )
}

export const SelectField = ({ id, label, registration, error, options, placeholder = 'Select an option' }) => {
  const errorId = error ? `${id}-error` : null
  return (
    <div className="lf-field">
      <label htmlFor={id} className="lf-label">
        {label}<span className="lf-required" aria-hidden="true"> *</span>
      </label>
      <div className={`lf-input-wrap is-select ${error ? 'is-invalid' : ''}`}>
        <select
          id={id}
          className="lf-input lf-select"
          aria-invalid={error ? 'true' : 'false'}
          aria-required="true"
          aria-describedby={describedBy(errorId)}
          {...registration}
        >
          <option value="">{placeholder}</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <FieldError id={errorId} message={error} />
    </div>
  )
}
