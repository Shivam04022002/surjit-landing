import { describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MultiStepLeadForm from './MultiStepLeadForm'
import { leadForm as copy } from '../../content/siteContent'
import { lookupPincode } from '../../services/pincodeService'
import { submitLead, getLeadConfig } from '../../services/leadService'
import { track } from '../../services/analytics'

vi.mock('../../services/pincodeService', () => ({ lookupPincode: vi.fn() }))
vi.mock('../../services/analytics', () => ({ track: vi.fn() }))
vi.mock('../../services/leadService', async (importOriginal) => ({
  ...(await importOriginal()),
  submitLead: vi.fn(),
  getLeadConfig: vi.fn()
}))

const LUCKNOW = { state: 'Uttar Pradesh', district: 'Lucknow', country: 'India' }
const DELHI = { state: 'Delhi', district: 'New Delhi', country: 'India' }

const deferred = () => {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const apiError = (status, body = {}) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data: body } })

const field = (label) => screen.getByLabelText(label)
const stepHeading = () => screen.getByRole('heading', { level: 3 })
const continueBtn = () => screen.getByRole('button', { name: /continue/i })

const setup = () => {
  const user = userEvent.setup()
  render(<MultiStepLeadForm copy={copy} />)
  return user
}

const fillStep1 = async (user, { lookup = true } = {}) => {
  await user.type(field(/PIN Code/), '226001')
  if (lookup) {
    await waitFor(() => expect(field(/^State/)).toHaveValue('Uttar Pradesh'))
  } else {
    await user.type(field(/^State/), 'Uttar Pradesh')
    await user.type(field(/District/), 'Lucknow')
    await user.type(field(/Country/), 'India')
  }
  await user.click(continueBtn())
  await screen.findByRole('heading', { name: /Loan Details/ })
}

const fillStep2 = async (user, amount = '250000') => {
  await user.type(field(/Desired Loan Amount/), amount)
  await user.selectOptions(field(/Use of Funds/), 'working-capital')
  await user.click(continueBtn())
  await screen.findByRole('heading', { name: /Financial Health/ })
}

const fillStep3 = async (user) => {
  await user.selectOptions(field(/Average Monthly Sale/), '1.5L-3L')
  await user.selectOptions(field(/Business Vintage/), '3-5')
  await user.selectOptions(field(/Credit Score/), '650-750')
  await user.click(continueBtn())
  await screen.findByRole('heading', { name: /Business Info/ })
}

const fillStep4 = async (user) => {
  await user.type(field(/Business Name/), 'Sharma Traders')
  await user.type(field(/Full Name of Owner/), 'Ravi Sharma')
  await user.type(field(/Phone Number/), '9876543210')
  await user.click(field(/agree that Surjit Finance may contact me/))
}

const fillAll = async (user) => {
  await fillStep1(user)
  await fillStep2(user)
  await fillStep3(user)
  await fillStep4(user)
}

const submitBtn = () => screen.getByRole('button', { name: /submit enquiry|submitting/i })

beforeEach(() => {
  lookupPincode.mockResolvedValue(LUCKNOW)
  getLeadConfig.mockResolvedValue({ loanAmount: { min: 10000, max: 5000000 } })
  submitLead.mockResolvedValue({ reference: 'SFL-ABCD2345' })
  track.mockImplementation(() => {})
  localStorage.clear()
})

describe('Layout and progress', () => {
  test('shows the heading, subtitle, four steps and only step 1 fields', () => {
    setup()
    expect(screen.getByRole('heading', { level: 2, name: 'Apply for Loan' })).toBeInTheDocument()
    expect(screen.getByText(copy.subtitle)).toBeInTheDocument()
    const progress = screen.getByRole('list', { name: 'Form progress' })
    expect(within(progress).getAllByRole('listitem')).toHaveLength(4)
    expect(within(progress).getByText('Location', { selector: '.lf-step-title-full' }).closest('li'))
      .toHaveAttribute('aria-current', 'step')
    // Narrow-phone labels exist for every step and are hidden from assistive
    // technology, which reads the full titles instead.
    const shorts = progress.querySelectorAll('.lf-step-title-short')
    expect([...shorts].map((s) => s.textContent)).toEqual(['Location', 'Loan', 'Finances', 'Business'])
    shorts.forEach((s) => expect(s).toHaveAttribute('aria-hidden', 'true'))
    expect(field(/PIN Code/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Desired Loan Amount/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument()
  })

  test('completed steps are marked as completed, not by colour alone', async () => {
    const user = setup()
    await fillStep1(user)
    const progress = screen.getByRole('list', { name: 'Form progress' })
    expect(within(progress).getByText('(completed)', { exact: false })).toBeInTheDocument()
    expect(within(progress).getByText('Loan Details').closest('li')).toHaveAttribute('aria-current', 'step')
  })
})

describe('Step 1 — Location', () => {
  test('required fields block Continue and show messages tied to each field', async () => {
    const user = setup()
    await user.click(continueBtn())
    expect(await screen.findByText('PIN code is required')).toBeInTheDocument()
    expect(stepHeading()).toHaveTextContent('Location')
    const pin = field(/PIN Code/)
    expect(pin).toHaveAttribute('aria-invalid', 'true')
    expect(pin.getAttribute('aria-describedby')).toContain('lf-pinCode-error')
    expect(screen.getByText('State is required')).toBeInTheDocument()
  })

  test('the PIN accepts digits only, at most six', async () => {
    const user = setup()
    await user.type(field(/PIN Code/), 'ab22-60 01xyz9')
    expect(field(/PIN Code/)).toHaveValue('226001')
    expect(field(/PIN Code/)).toHaveAttribute('inputmode', 'numeric')
  })

  test('a malformed PIN is rejected', async () => {
    const user = setup()
    await user.type(field(/PIN Code/), '12345')
    await user.click(continueBtn())
    expect(await screen.findByText('Enter a valid 6-digit PIN code')).toBeInTheDocument()
    expect(lookupPincode).not.toHaveBeenCalled()
  })

  test('a valid PIN is looked up and fills state, district and country, which stay editable', async () => {
    const user = setup()
    await user.type(field(/PIN Code/), '226001')
    await waitFor(() => expect(field(/District/)).toHaveValue('Lucknow'))
    expect(field(/^State/)).toHaveValue('Uttar Pradesh')
    expect(field(/Country/)).toHaveValue('India')
    expect(lookupPincode).toHaveBeenCalledTimes(1)
    expect(lookupPincode.mock.calls[0][0]).toBe('226001')
    expect(screen.getByText(/Location filled from your PIN code/)).toBeInTheDocument()

    await user.clear(field(/District/))
    await user.type(field(/District/), 'Lucknow City')
    expect(field(/District/)).toHaveValue('Lucknow City')
  })

  test('shows a loading state while the lookup is in flight', async () => {
    const pending = deferred()
    lookupPincode.mockReturnValue(pending.promise)
    const user = setup()
    await user.type(field(/PIN Code/), '226001')
    expect(await screen.findByText('Looking up your PIN code…')).toBeInTheDocument()
    pending.resolve(LUCKNOW)
    await waitFor(() => expect(field(/^State/)).toHaveValue('Uttar Pradesh'))
  })

  test('a failed lookup shows a non-blocking message and manual entry still works', async () => {
    lookupPincode.mockRejectedValue(apiError(503))
    const user = setup()
    await user.type(field(/PIN Code/), '226001')
    expect(await screen.findByText(/could not look up this PIN code right now/)).toBeInTheDocument()
    await user.type(field(/^State/), 'Uttar Pradesh')
    await user.type(field(/District/), 'Lucknow')
    await user.type(field(/Country/), 'India')
    await user.click(continueBtn())
    expect(await screen.findByRole('heading', { name: /Loan Details/ })).toBeInTheDocument()
  })

  test('an unknown PIN says so', async () => {
    lookupPincode.mockRejectedValue(apiError(404))
    const user = setup()
    await user.type(field(/PIN Code/), '999999')
    expect(await screen.findByText(/could not find this PIN code/)).toBeInTheDocument()
  })

  test('an outdated lookup response never overwrites the address for a newer PIN', async () => {
    const slowDelhi = deferred()
    lookupPincode.mockImplementation((pin) => (pin === '110001' ? slowDelhi.promise : Promise.resolve(LUCKNOW)))
    const user = setup()

    await user.type(field(/PIN Code/), '110001')
    await waitFor(() => expect(lookupPincode).toHaveBeenCalledWith('110001', expect.anything()))

    await user.clear(field(/PIN Code/))
    await user.type(field(/PIN Code/), '226001')
    await waitFor(() => expect(field(/^State/)).toHaveValue('Uttar Pradesh'))

    // The stale answer for the old PIN arrives last.
    slowDelhi.resolve(DELHI)
    await new Promise((r) => setTimeout(r, 50))
    expect(field(/^State/)).toHaveValue('Uttar Pradesh')
    expect(field(/District/)).toHaveValue('Lucknow')
  })
})

describe('Step 2 — Loan details', () => {
  test('amount is required, digits only, and within the configured bounds', async () => {
    const user = setup()
    await fillStep1(user)

    await user.click(continueBtn())
    expect(await screen.findByText('Loan amount is required')).toBeInTheDocument()
    expect(screen.getByText('Please select how you will use the funds')).toBeInTheDocument()

    await user.type(field(/Desired Loan Amount/), '9,999abc')
    expect(field(/Desired Loan Amount/)).toHaveValue('9999')
    await user.click(continueBtn())
    expect(await screen.findByText('Minimum loan amount is ₹10,000')).toBeInTheDocument()

    await user.clear(field(/Desired Loan Amount/))
    await user.type(field(/Desired Loan Amount/), '5000001')
    await user.click(continueBtn())
    expect(await screen.findByText('Maximum loan amount is ₹50,00,000')).toBeInTheDocument()
  })

  test('the maximum follows the API config', async () => {
    getLeadConfig.mockResolvedValue({ loanAmount: { min: 10000, max: 200000 } })
    const user = setup()
    await fillStep1(user)
    await user.type(field(/Desired Loan Amount/), '250000')
    await user.selectOptions(field(/Use of Funds/), 'inventory')
    await user.click(continueBtn())
    expect(await screen.findByText('Maximum loan amount is ₹2,00,000')).toBeInTheDocument()
  })
})

describe('Step 3 — Financial health', () => {
  test('all three selections are required', async () => {
    const user = setup()
    await fillStep1(user)
    await fillStep2(user)
    await user.click(continueBtn())
    expect(await screen.findByText('Please select your average monthly sale')).toBeInTheDocument()
    expect(screen.getByText('Please select your business vintage')).toBeInTheDocument()
    expect(screen.getByText('Please select your estimated credit score')).toBeInTheDocument()
  })
})

describe('Step 4 — Business info', () => {
  test('pasted or typed numbers with +91, 91 or 0 become the 10-digit mobile', async () => {
    const user = setup()
    await fillStep1(user)
    await fillStep2(user)
    await fillStep3(user)
    expect(screen.getByText('+91')).toBeInTheDocument()
    const phone = field(/Phone Number/)

    const paste = async (text) => {
      await user.clear(phone)
      await user.click(phone)
      await user.paste(text)
      return phone.value
    }
    const type = async (text) => {
      await user.clear(phone)
      await user.type(phone, text)
      return phone.value
    }

    // The full pasted text must reach the input: no browser cut at 10 chars.
    expect(phone).toHaveAttribute('maxlength', '16')
    expect(await paste('+91 98765 43210')).toBe('9876543210')
    expect(await paste('+91-98765-43210')).toBe('9876543210')
    expect(await paste('919876543210')).toBe('9876543210')
    expect(await paste('09876543210')).toBe('9876543210')
    expect(await paste('9876543210')).toBe('9876543210')
    expect(await type('+91 98765 43210')).toBe('9876543210')
    expect(await type('09876543210')).toBe('9876543210')
    expect(await type('98765x43210')).toBe('9876543210')
  })

  test('the submitted phone is the 10 digits only, without +91', async () => {
    const user = setup()
    await fillStep1(user)
    await fillStep2(user)
    await fillStep3(user)
    await user.type(field(/Business Name/), 'Sharma Traders')
    await user.type(field(/Full Name of Owner/), 'Ravi Sharma')
    await user.click(field(/Phone Number/))
    await user.paste('+91 98765 43210')
    await user.click(field(/agree that Surjit Finance may contact me/))
    await user.click(submitBtn())
    await screen.findByText(copy.successTitle)
    expect(submitLead.mock.calls[0][0].phoneNumber).toBe('9876543210')
  })

  test('invalid numbers are never turned into valid-looking ones and are rejected', async () => {
    const user = setup()
    await fillStep1(user)
    await fillStep2(user)
    await fillStep3(user)
    const phone = field(/Phone Number/)

    // Not a +91/0 form: kept as entered (no silent truncation), so it fails.
    await user.click(phone)
    await user.paste('98765432101')
    expect(phone).toHaveValue('98765432101')
    await user.click(submitBtn())
    expect(await screen.findByText(/valid 10-digit mobile number starting with 6, 7, 8 or 9/)).toBeInTheDocument()

    // Prefix removed, but what remains is not a mobile number: still rejected.
    for (const bad of ['+91 58765 43210', '05876543210', '5876543210', '987654321']) {
      await user.clear(phone)
      await user.click(phone)
      await user.paste(bad)
      await user.click(submitBtn())
      expect(await screen.findByText(/valid 10-digit mobile number starting with 6, 7, 8 or 9/)).toBeInTheDocument()
    }
    expect(submitLead).not.toHaveBeenCalled()
  })

  test('blank-only names and missing consent are rejected; consent starts unticked', async () => {
    const user = setup()
    await fillStep1(user)
    await fillStep2(user)
    await fillStep3(user)
    expect(field(/agree that Surjit Finance may contact me/)).not.toBeChecked()

    await user.type(field(/Business Name/), '    ')
    await user.type(field(/Full Name of Owner/), '   ')
    await user.type(field(/Phone Number/), '9876543210')
    await user.click(submitBtn())
    expect(await screen.findByText('Business name is required')).toBeInTheDocument()
    expect(screen.getByText("Owner's full name is required")).toBeInTheDocument()
    expect(screen.getByText(/confirm you agree to be contacted/)).toBeInTheDocument()
    expect(submitLead).not.toHaveBeenCalled()
  })

  test('shows the privacy notice beside the submit action', async () => {
    const user = setup()
    await fillStep1(user)
    await fillStep2(user)
    await fillStep3(user)
    expect(screen.getByText(copy.privacyNotice)).toBeInTheDocument()
  })
})

describe('Navigation', () => {
  test('values survive moving back and forward', async () => {
    const user = setup()
    await fillStep1(user)
    await fillStep2(user, '300000')
    await user.click(screen.getByRole('button', { name: /back/i }))
    expect(await screen.findByRole('heading', { name: /Loan Details/ })).toBeInTheDocument()
    expect(field(/Desired Loan Amount/)).toHaveValue('300000')
    expect(field(/Use of Funds/)).toHaveValue('working-capital')

    await user.click(screen.getByRole('button', { name: /back/i }))
    expect(field(/PIN Code/)).toHaveValue('226001')
    expect(field(/District/)).toHaveValue('Lucknow')

    await user.click(continueBtn())
    await user.click(await screen.findByRole('button', { name: /continue/i }))
    expect(await screen.findByRole('heading', { name: /Financial Health/ })).toBeInTheDocument()
  })
})

describe('Submission', () => {
  test('shows a loading state, ignores repeat clicks, and succeeds only after the API confirms', async () => {
    const pending = deferred()
    submitLead.mockReturnValue(pending.promise)
    const user = setup()
    await fillAll(user)

    await user.click(submitBtn())
    expect(await screen.findByRole('button', { name: /submitting/i })).toBeDisabled()
    await user.click(submitBtn())
    await user.dblClick(submitBtn())
    expect(submitLead).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(copy.successTitle)).not.toBeInTheDocument()
    expect(track).not.toHaveBeenCalledWith('form_submit_succeeded')

    pending.resolve({ reference: 'SFL-ABCD2345' })
    expect(await screen.findByText(copy.successTitle)).toBeInTheDocument()
    expect(screen.getByText('SFL-ABCD2345')).toBeInTheDocument()

    const [payload, key] = submitLead.mock.calls[0]
    expect(payload).toEqual({
      pinCode: '226001', state: 'Uttar Pradesh', district: 'Lucknow', country: 'India',
      desiredLoanAmount: 250000, useOfFunds: 'working-capital',
      averageMonthlySale: '1.5L-3L', businessVintage: '3-5', creditScore: '650-750',
      businessName: 'Sharma Traders', ownerName: 'Ravi Sharma', phoneNumber: '9876543210',
      consentAccepted: true
    })
    expect(typeof key).toBe('string')
    expect(key.length).toBeGreaterThanOrEqual(16)

    const names = track.mock.calls.map((c) => c[0])
    expect(names.indexOf('form_submit_attempted')).toBeLessThan(names.indexOf('form_submit_succeeded'))
  })

  test('a failure keeps the data, explains, and a retry reuses the same idempotency key', async () => {
    submitLead.mockRejectedValueOnce(apiError(503, { success: false, message: 'The service is temporarily unavailable. Please try again shortly.' }))
    const user = setup()
    await fillAll(user)

    await user.click(submitBtn())
    expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable')
    expect(field(/Business Name/)).toHaveValue('Sharma Traders')
    expect(field(/Phone Number/)).toHaveValue('9876543210')
    expect(track).toHaveBeenCalledWith('form_submit_failed', { reason: 'server' })
    expect(track).not.toHaveBeenCalledWith('form_submit_succeeded')

    await user.click(submitBtn())
    expect(await screen.findByText(copy.successTitle)).toBeInTheDocument()
    expect(submitLead).toHaveBeenCalledTimes(2)
    expect(submitLead.mock.calls[1][1]).toBe(submitLead.mock.calls[0][1])
  })

  test('changing details after a failure uses a new idempotency key; unchanged retries keep it', async () => {
    submitLead
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockRejectedValueOnce(new Error('Network Error'))
    const user = setup()
    await fillAll(user)

    await user.click(submitBtn())
    await screen.findByRole('alert')
    await user.click(submitBtn())               // same details
    await screen.findByRole('alert')
    expect(submitLead.mock.calls[1][1]).toBe(submitLead.mock.calls[0][1])

    await user.clear(field(/Business Name/))
    await user.type(field(/Business Name/), 'Sharma Traders and Sons')
    await user.click(submitBtn())               // different details
    await screen.findByText(copy.successTitle)
    expect(submitLead).toHaveBeenCalledTimes(3)
    expect(submitLead.mock.calls[2][1]).not.toBe(submitLead.mock.calls[1][1])
    expect(submitLead.mock.calls[2][0].businessName).toBe('Sharma Traders and Sons')
  })

  test('a 409 from the API is shown as an error, with the data kept', async () => {
    submitLead.mockRejectedValueOnce(apiError(409, {
      success: false,
      message: 'This submission was already received with different details. Please refresh the page and submit your enquiry again.',
      errors: [{ field: 'Idempotency-Key', message: 'Already used for a different submission' }]
    }))
    const user = setup()
    await fillAll(user)
    await user.click(submitBtn())
    expect(await screen.findByRole('alert')).toHaveTextContent('already received with different details')
    expect(field(/Business Name/)).toHaveValue('Sharma Traders')
    expect(screen.queryByText(copy.successTitle)).not.toBeInTheDocument()
  })

  test('a network failure is reported as such', async () => {
    submitLead.mockRejectedValueOnce(new Error('Network Error'))
    const user = setup()
    await fillAll(user)
    await user.click(submitBtn())
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach our server/)
    expect(track).toHaveBeenCalledWith('form_submit_failed', { reason: 'network' })
  })

  test('server field errors are shown on the right field, returning to its step', async () => {
    submitLead.mockRejectedValueOnce(apiError(422, {
      success: false, message: 'Please correct the highlighted fields',
      errors: [{ field: 'district', message: 'District contains invalid characters' }]
    }))
    const user = setup()
    await fillAll(user)
    await user.click(submitBtn())
    expect(await screen.findByText('District contains invalid characters')).toBeInTheDocument()
    expect(stepHeading()).toHaveTextContent('Location')
    expect(field(/District/)).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(field(/District/)).toHaveFocus())
  })

  test('after success the visitor can start a new, empty enquiry with a new key', async () => {
    const user = setup()
    await fillAll(user)
    await user.click(submitBtn())
    await screen.findByText(copy.successTitle)

    await user.click(screen.getByRole('button', { name: /submit another enquiry/i }))
    expect(await screen.findByRole('heading', { name: /Location/ })).toBeInTheDocument()
    expect(field(/PIN Code/)).toHaveValue('')

    await fillAll(user)
    await user.click(submitBtn())
    await screen.findByText(copy.successTitle)
    expect(submitLead.mock.calls[1][1]).not.toBe(submitLead.mock.calls[0][1])
  })
})

describe('Analytics', () => {
  test('tracks progress events and never any value the visitor typed', async () => {
    const user = setup()
    await user.click(continueBtn())
    await fillAll(user)
    await user.click(submitBtn())
    await screen.findByText(copy.successTitle)

    const names = track.mock.calls.map((c) => c[0])
    for (const n of ['form_start', 'form_step_viewed', 'form_step_completed', 'validation_error', 'form_submit_attempted', 'form_submit_succeeded']) {
      expect(names).toContain(n)
    }
    expect(track).toHaveBeenCalledWith('validation_error', { step: 1, field: 'pinCode' })
    expect(track).toHaveBeenCalledWith('form_step_completed', { step: 4 })

    const sent = JSON.stringify(track.mock.calls)
    for (const v of ['226001', 'Lucknow', 'Uttar Pradesh', '250000', 'working-capital', '1.5L-3L', '3-5', '650-750',
      'Sharma', 'Ravi', '9876543210']) {
      expect(sent).not.toContain(v)
    }
  })
})
