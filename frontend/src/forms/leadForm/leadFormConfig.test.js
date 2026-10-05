// @vitest-environment node
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import {
  USE_OF_FUNDS, AVERAGE_MONTHLY_SALE, BUSINESS_VINTAGE, CREDIT_SCORE, buildRules, toLeadPayload, stepOfField, STEPS,
  normalizeIndianMobile
} from './leadFormConfig'

// The option values the form submits must be exactly those the API accepts.
// Tests run from frontend/; the backend is its sibling.
const BACKEND = resolve(process.cwd(), '../backend/src/constants')
const require = createRequire(resolve(process.cwd(), 'package.json'))
const backendOptions = require(resolve(BACKEND, 'leadOptions.js'))

const values = (list) => list.map((o) => o.value).sort()

describe('option values match the backend', () => {
  test.each([
    ['useOfFunds', USE_OF_FUNDS, 'USE_OF_FUNDS'],
    ['averageMonthlySale', AVERAGE_MONTHLY_SALE, 'AVERAGE_MONTHLY_SALE'],
    ['businessVintage', BUSINESS_VINTAGE, 'BUSINESS_VINTAGE'],
    ['creditScore', CREDIT_SCORE, 'CREDIT_SCORE']
  ])('%s', (_, list, key) => {
    expect(values(list)).toEqual(Object.keys(backendOptions[key]).sort())
  })

  test('average monthly sale keeps the reference values', () => {
    expect(values(AVERAGE_MONTHLY_SALE)).toEqual(['1.5L-3L', '3L-5L', '50k-1.5L', '5L+'])
  })

  test('analytics field allowlist covers every form field', () => {
    const src = readFileSync(resolve(BACKEND, 'analytics.js'), 'utf8')
    for (const step of STEPS) for (const f of step.fields) expect(src).toContain(`'${f}'`)
  })
})

describe('rules', () => {
  const rules = buildRules({ min: 10000, max: 5000000 })
  const run = (field, v) => {
    const r = rules[field].validate
    for (const fn of Object.values(typeof r === 'function' ? { r } : r)) {
      const out = fn(v)
      if (out !== true) return out
    }
    return true
  }

  test('PIN', () => {
    expect(run('pinCode', '226001')).toBe(true)
    for (const v of ['', '22600', '022600', '2260011']) expect(run('pinCode', v)).not.toBe(true)
  })

  test('phone', () => {
    for (const v of ['6000000000', '7123456789', '8999999999', '9876543210']) expect(run('phoneNumber', v)).toBe(true)
    for (const v of ['', '5876543210', '987654321', '0987654321']) expect(run('phoneNumber', v)).not.toBe(true)
  })

  test('amount bounds are inclusive', () => {
    expect(run('desiredLoanAmount', '10000')).toBe(true)
    expect(run('desiredLoanAmount', '5000000')).toBe(true)
    expect(run('desiredLoanAmount', '9999')).toMatch(/Minimum/)
    expect(run('desiredLoanAmount', '5000001')).toMatch(/Maximum/)
  })

  test('names: blank-only, too long and markup are rejected', () => {
    expect(run('ownerName', '   ')).toMatch(/required/)
    expect(run('ownerName', 'a'.repeat(101))).toMatch(/at most 100/)
    expect(run('ownerName', 'a'.repeat(100))).toBe(true)
    expect(run('ownerName', "D'Souza-Rao Jr.")).toBe(true)
    expect(run('ownerName', 'रवि शर्मा')).toBe(true)
    expect(run('businessName', '<b>x</b>')).not.toBe(true)
    expect(run('businessName', 'A1 Traders & Sons (Pvt.)')).toBe(true)
  })
})

test('payload converts the amount to a number and trims text', () => {
  const p = toLeadPayload({
    pinCode: '226001', state: ' UP ', district: 'Lucknow ', country: 'India', desiredLoanAmount: '250000',
    useOfFunds: 'other', averageMonthlySale: '5L+', businessVintage: 'lt-1', creditScore: '750+',
    businessName: ' Shop ', ownerName: ' Ravi ', phoneNumber: '9876543210', consentAccepted: true
  })
  expect(p.desiredLoanAmount).toBe(250000)
  expect(p.state).toBe('UP')
  expect(p.businessName).toBe('Shop')
  expect(p.phoneNumber).toBe('9876543210')
})

describe('normalizeIndianMobile', () => {
  test.each([
    ['+91 98765 43210', '9876543210'],
    ['+91-98765-43210', '9876543210'],
    ['919876543210', '9876543210'],
    ['09876543210', '9876543210'],
    ['9876543210', '9876543210'],
    ['98765 43210', '9876543210'],
    ['(+91) 98765-43210', '9876543210']
  ])('%s → %s', (input, expected) => {
    expect(normalizeIndianMobile(input)).toBe(expected)
  })

  test('a 10-digit number beginning 91 is not mistaken for a prefix', () => {
    expect(normalizeIndianMobile('9123456789')).toBe('9123456789')
  })

  test('never shortens other input to a different 10-digit number', () => {
    expect(normalizeIndianMobile('98765432101')).toBe('98765432101')
    expect(normalizeIndianMobile('9876543210123')).toBe('987654321012')
    // Prefix stripped, remainder kept as-is for validation to reject.
    expect(normalizeIndianMobile('915876543210')).toBe('5876543210')
  })

  test('typing "+91…" one key at a time ends at the 10-digit number', () => {
    let value = ''
    for (const ch of '+91 98765 43210') value = normalizeIndianMobile(value + ch)
    expect(value).toBe('9876543210')
  })

  test('typing "0…" one key at a time ends at the 10-digit number', () => {
    let value = ''
    for (const ch of '09876543210') value = normalizeIndianMobile(value + ch)
    expect(value).toBe('9876543210')
  })
})

test('stepOfField', () => {
  expect(stepOfField('district')).toBe(1)
  expect(stepOfField('consentAccepted')).toBe(4)
  expect(stepOfField('nope')).toBeNull()
})
