import { LoaderCircle, CircleCheck, Info } from 'lucide-react'
import { TextField, SelectField } from './fields'
import {
  USE_OF_FUNDS, AVERAGE_MONTHLY_SALE, BUSINESS_VINTAGE, CREDIT_SCORE, NAME_MAX_LENGTH,
  digitRegistration, normalizedRegistration, normalizeIndianMobile, PHONE_INPUT_MAX_LENGTH, formatRupees
} from './leadFormConfig'

// The fields of each step. Each receives React Hook Form's `register`, the
// rules for every field and the current errors; none of them talks to the API.

const err = (errors, name) => errors[name]?.message

export const StepLocation = ({ register, rules, errors, lookup }) => (
  <div className="lf-grid">
    <div className="lf-span-2">
      <TextField
        id="lf-pinCode"
        label="PIN Code"
        registration={digitRegistration(register('pinCode', rules.pinCode), 6)}
        error={err(errors, 'pinCode')}
        inputMode="numeric"
        autoComplete="postal-code"
        maxLength={6}
        placeholder="6-digit PIN code"
      />
      <p className={`lf-lookup is-${lookup.status}`} role="status" aria-live="polite">
        {lookup.status === 'loading' && <LoaderCircle className="lf-spin" size={16} aria-hidden="true" />}
        {lookup.status === 'found' && <CircleCheck size={16} aria-hidden="true" />}
        {lookup.status === 'error' && <Info size={16} aria-hidden="true" />}
        <span>{lookup.message}</span>
      </p>
    </div>
    <TextField
      id="lf-state"
      label="State"
      registration={register('state', rules.state)}
      error={err(errors, 'state')}
      autoComplete="address-level1"
      maxLength={100}
    />
    <TextField
      id="lf-district"
      label="District"
      registration={register('district', rules.district)}
      error={err(errors, 'district')}
      autoComplete="address-level2"
      maxLength={100}
    />
    <TextField
      id="lf-country"
      label="Country"
      registration={register('country', rules.country)}
      error={err(errors, 'country')}
      autoComplete="country-name"
      maxLength={100}
      className="lf-span-2"
    />
  </div>
)

export const StepLoan = ({ register, rules, errors, bounds, amount }) => (
  <div className="lf-grid lf-grid-single">
    <TextField
      id="lf-desiredLoanAmount"
      label="Desired Loan Amount"
      registration={digitRegistration(register('desiredLoanAmount', rules.desiredLoanAmount), 10)}
      error={err(errors, 'desiredLoanAmount')}
      prefix="₹"
      inputMode="numeric"
      autoComplete="off"
      placeholder={`Minimum ${formatRupees(bounds.min)}`}
      hint={amount && /^\d+$/.test(amount)
        ? `${formatRupees(amount)} · between ${formatRupees(bounds.min)} and ${formatRupees(bounds.max)}`
        : `Between ${formatRupees(bounds.min)} and ${formatRupees(bounds.max)}`}
    />
    <SelectField
      id="lf-useOfFunds"
      label="Use of Funds"
      registration={register('useOfFunds', rules.useOfFunds)}
      error={err(errors, 'useOfFunds')}
      options={USE_OF_FUNDS}
    />
  </div>
)

export const StepFinancial = ({ register, rules, errors }) => (
  <div className="lf-grid lf-grid-single">
    <SelectField
      id="lf-averageMonthlySale"
      label="Average Monthly Sale"
      registration={register('averageMonthlySale', rules.averageMonthlySale)}
      error={err(errors, 'averageMonthlySale')}
      options={AVERAGE_MONTHLY_SALE}
    />
    <SelectField
      id="lf-businessVintage"
      label="Business Vintage"
      registration={register('businessVintage', rules.businessVintage)}
      error={err(errors, 'businessVintage')}
      options={BUSINESS_VINTAGE}
    />
    <SelectField
      id="lf-creditScore"
      label="Estimated Personal Credit Score"
      registration={register('creditScore', rules.creditScore)}
      error={err(errors, 'creditScore')}
      options={CREDIT_SCORE}
    />
  </div>
)

export const StepBusiness = ({ register, rules, errors, copy }) => {
  const consentError = err(errors, 'consentAccepted')
  return (
    <div className="lf-grid lf-grid-single">
      <TextField
        id="lf-businessName"
        label="Business Name"
        registration={register('businessName', rules.businessName)}
        error={err(errors, 'businessName')}
        autoComplete="organization"
        maxLength={NAME_MAX_LENGTH}
      />
      <TextField
        id="lf-ownerName"
        label="Full Name of Owner"
        registration={register('ownerName', rules.ownerName)}
        error={err(errors, 'ownerName')}
        autoComplete="name"
        maxLength={NAME_MAX_LENGTH}
      />
      <TextField
        id="lf-phoneNumber"
        label="Phone Number"
        registration={normalizedRegistration(register('phoneNumber', rules.phoneNumber), normalizeIndianMobile)}
        error={err(errors, 'phoneNumber')}
        prefix="+91"
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        maxLength={PHONE_INPUT_MAX_LENGTH}
        placeholder="10-digit mobile number"
      />

      <div className="lf-field">
        <div className={`lf-consent ${consentError ? 'is-invalid' : ''}`}>
          <input
            id="lf-consentAccepted"
            type="checkbox"
            aria-invalid={consentError ? 'true' : 'false'}
            aria-describedby={['lf-privacy-notice', consentError ? 'lf-consentAccepted-error' : null].filter(Boolean).join(' ')}
            {...register('consentAccepted', rules.consentAccepted)}
          />
          <label htmlFor="lf-consentAccepted">{copy.consentLabel}</label>
        </div>
        {consentError && (
          <p id="lf-consentAccepted-error" className="lf-error">
            <Info size={16} aria-hidden="true" /><span>{consentError}</span>
          </p>
        )}
        <p id="lf-privacy-notice" className="lf-privacy">{copy.privacyNotice}</p>
      </div>
    </div>
  )
}
