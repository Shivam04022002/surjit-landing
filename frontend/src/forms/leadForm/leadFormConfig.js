// Everything the four-step enquiry form is made of: option lists, steps,
// default values and validation rules. Option values must match
// backend/src/constants/leadOptions.js exactly — they are what the API accepts.

export const USE_OF_FUNDS = [
  { value: 'business-expansion', label: 'Business Expansion' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'machinery', label: 'Machinery' },
  { value: 'working-capital', label: 'Working Capital' },
  { value: 'personal-use', label: 'Personal Use' },
  { value: 'other', label: 'Other' }
]

export const AVERAGE_MONTHLY_SALE = [
  { value: '50k-1.5L', label: '₹50,000 – ₹1,50,000' },
  { value: '1.5L-3L', label: '₹1,50,000 – ₹3,00,000' },
  { value: '3L-5L', label: '₹3,00,000 – ₹5,00,000' },
  { value: '5L+', label: '₹5,00,000+' }
]

export const BUSINESS_VINTAGE = [
  { value: 'lt-1', label: 'Less than 1 year' },
  { value: '1-3', label: '1-3 years' },
  { value: '3-5', label: '3-5 years' },
  { value: '5+', label: '5+ years' }
]

export const CREDIT_SCORE = [
  { value: 'lt-550', label: 'Below 550' },
  { value: '550-650', label: '550-650' },
  { value: '650-750', label: '650-750' },
  { value: '750+', label: '750+' }
]

// `shortTitle` is what the progress indicator shows on narrow phones (≤400px),
// where four full titles cannot sit side by side at a readable size.
export const STEPS = [
  { number: 1, key: 'location', title: 'Location', shortTitle: 'Location', fields: ['pinCode', 'state', 'district', 'country'] },
  { number: 2, key: 'loan', title: 'Loan Details', shortTitle: 'Loan', fields: ['desiredLoanAmount', 'useOfFunds'] },
  { number: 3, key: 'financial', title: 'Financial Health', shortTitle: 'Finances', fields: ['averageMonthlySale', 'businessVintage', 'creditScore'] },
  { number: 4, key: 'business', title: 'Business Info', shortTitle: 'Business', fields: ['businessName', 'ownerName', 'phoneNumber', 'consentAccepted'] }
]

export const stepOfField = (field) => STEPS.find((s) => s.fields.includes(field))?.number ?? null

export const DEFAULT_VALUES = {
  pinCode: '',
  state: '',
  district: '',
  country: '',
  desiredLoanAmount: '',
  useOfFunds: '',
  averageMonthlySale: '',
  businessVintage: '',
  creditScore: '',
  businessName: '',
  ownerName: '',
  phoneNumber: '',
  consentAccepted: false
}

export const DEFAULT_LOAN_BOUNDS = {
  min: Number(import.meta.env.VITE_LOAN_MIN_AMOUNT) || 10000,
  max: Number(import.meta.env.VITE_LOAN_MAX_AMOUNT) || 5000000
}

export const NAME_MAX_LENGTH = 100
export const PIN_PATTERN = /^[1-9][0-9]{5}$/
export const PHONE_PATTERN = /^[6-9][0-9]{9}$/
const PLACE_PATTERN = /^[\p{L}\p{M} .'&()-]+$/u
const PERSON_PATTERN = /^[\p{L}\p{M} .'-]+$/u
// Anything but control characters (\p{Cc}) and angle brackets.
const BUSINESS_PATTERN = /^[^\p{Cc}<>]+$/u

export const digitsOnly = (value, maxLength) => String(value ?? '').replace(/\D/g, '').slice(0, maxLength)

// Wraps a React Hook Form registration so every typed or pasted value passes
// through `normalize` before the form sees it.
export const normalizedRegistration = (registration, normalize) => ({
  ...registration,
  onChange: (e) => {
    const cleaned = normalize(e.target.value)
    if (cleaned !== e.target.value) e.target.value = cleaned
    return registration.onChange(e)
  }
})

// Digits only, up to `maxLength`: letters, spaces and symbols are removed.
export const digitRegistration = (registration, maxLength) =>
  normalizedRegistration(registration, (v) => digitsOnly(v, maxLength))

// The longest Indian mobile written with its country code, digits only:
// 91 + 10 digits.
const MOBILE_MAX_DIGITS = 12

// A mobile number as typed or pasted → the 10 digits the API expects.
//
//   +91 98765 43210 → 9876543210      919876543210 → 9876543210
//   09876543210     → 9876543210      98765-43210  → 9876543210
//
// The 91 / 0 prefix is removed only when what remains is exactly ten digits,
// so typing "+91…" or "0…" one key at a time also ends up correct. Anything
// else is left as typed (at most 12 digits) and fails validation visibly — it
// is never cut down to a different, valid-looking number.
export const normalizeIndianMobile = (value) => {
  let d = String(value ?? '').replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  return d.slice(0, MOBILE_MAX_DIGITS)
}

// Characters the phone input must accept so a full "+91 98765 43210" (15)
// or "+91-98765-43210" pastes intact instead of being cut by the browser.
export const PHONE_INPUT_MAX_LENGTH = 16

export const formatRupees = (n) => `₹${Number(n).toLocaleString('en-IN')}`

const notBlank = (label) => (v) => String(v ?? '').trim() !== '' || `${label} is required`

const placeRules = (label) => ({
  validate: {
    required: notBlank(label),
    length: (v) => String(v).trim().length <= 100 || `${label} must be at most 100 characters`,
    chars: (v) => PLACE_PATTERN.test(String(v).trim()) || `${label} contains invalid characters`
  }
})

// React Hook Form rules for every field. Loan bounds come from the API's
// config, so the browser and server enforce the same numbers.
export const buildRules = ({ min, max }) => ({
  pinCode: {
    validate: {
      required: notBlank('PIN code'),
      format: (v) => PIN_PATTERN.test(v) || 'Enter a valid 6-digit PIN code'
    }
  },
  state: placeRules('State'),
  district: placeRules('District'),
  country: placeRules('Country'),
  desiredLoanAmount: {
    validate: {
      required: notBlank('Loan amount'),
      number: (v) => /^\d+$/.test(String(v)) || 'Enter the amount in whole rupees',
      min: (v) => Number(v) >= min || `Minimum loan amount is ${formatRupees(min)}`,
      max: (v) => Number(v) <= max || `Maximum loan amount is ${formatRupees(max)}`
    }
  },
  useOfFunds: { required: 'Please select how you will use the funds' },
  averageMonthlySale: { required: 'Please select your average monthly sale' },
  businessVintage: { required: 'Please select your business vintage' },
  creditScore: { required: 'Please select your estimated credit score' },
  businessName: {
    validate: {
      required: notBlank('Business name'),
      length: (v) => String(v).trim().length <= NAME_MAX_LENGTH || `Business name must be at most ${NAME_MAX_LENGTH} characters`,
      chars: (v) => BUSINESS_PATTERN.test(String(v).trim()) || 'Business name contains invalid characters'
    }
  },
  ownerName: {
    validate: {
      required: notBlank("Owner's full name"),
      length: (v) => String(v).trim().length <= NAME_MAX_LENGTH || `Name must be at most ${NAME_MAX_LENGTH} characters`,
      chars: (v) => PERSON_PATTERN.test(String(v).trim()) || 'Name may only contain letters, spaces, dots, apostrophes and hyphens'
    }
  },
  phoneNumber: {
    validate: {
      required: notBlank('Phone number'),
      format: (v) => PHONE_PATTERN.test(v) || 'Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9'
    }
  },
  consentAccepted: { validate: (v) => v === true || 'Please confirm you agree to be contacted about this enquiry' }
})

// What is sent to the API: trimmed text, the amount as a number, the phone as
// ten digits (the +91 prefix is display only).
export const toLeadPayload = (values) => ({
  pinCode: values.pinCode,
  state: values.state.trim(),
  district: values.district.trim(),
  country: values.country.trim(),
  desiredLoanAmount: Number(values.desiredLoanAmount),
  useOfFunds: values.useOfFunds,
  averageMonthlySale: values.averageMonthlySale,
  businessVintage: values.businessVintage,
  creditScore: values.creditScore,
  businessName: values.businessName.trim(),
  ownerName: values.ownerName.trim(),
  phoneNumber: values.phoneNumber,
  consentAccepted: values.consentAccepted === true
})
