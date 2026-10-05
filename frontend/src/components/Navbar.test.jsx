import { describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Navbar from './Navbar'
import { track } from '../services/analytics'

vi.mock('../services/analytics', () => ({ track: vi.fn() }))

// jsdom has no layout, so which of the desktop/mobile navs is *visible* at a
// given width is decided by CSS media queries (desktop nav from 960px) and
// must be checked in a real browser. These tests cover structure and behaviour.

const NAV = [
  ['Home', '#home', 'home'],
  ['Business Loan', '#benefits', 'benefits'],
  ['How It Works', '#how-it-works', 'how-it-works'],
  ['FAQs', '#faq', 'faq']
]

const setup = () => {
  const user = userEvent.setup()
  render(<Navbar />)
  return user
}

const toggle = () => screen.getByRole('button', { name: /menu/i })
const mobileMenu = () => document.getElementById('mobile-menu')

beforeEach(() => {
  track.mockImplementation(() => {})
})

describe('Navbar rendering', () => {
  test('shows the logo with its accessible name, linking home', () => {
    setup()
    const logo = screen.getByRole('img', { name: 'Surjit Finance' })
    expect(logo).toHaveAttribute('width')
    expect(logo).toHaveAttribute('height')
    expect(logo.closest('a')).toHaveAttribute('href', '#home')
  })

  test('the header is a banner landmark with a labelled main navigation', () => {
    setup()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })
})

describe('Desktop navigation', () => {
  test('lists every section link with the right target', () => {
    setup()
    const main = screen.getByRole('navigation', { name: 'Main' })
    const links = within(main).getAllByRole('link')
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual(NAV.map(([label, href]) => [label, href]))
  })

  test('a section link records a nav_click with its target', async () => {
    const user = setup()
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'FAQs' }))
    expect(track).toHaveBeenCalledWith('nav_click', { navTarget: 'faq' })
  })

  test('the Apply for Loan CTA goes to the form and records a cta_click', async () => {
    const user = setup()
    const cta = screen.getAllByRole('link', { name: 'Apply for Loan' })[0]
    expect(cta).toHaveAttribute('href', '#apply')
    await user.click(cta)
    expect(track).toHaveBeenCalledWith('cta_click', { ctaId: 'nav_apply' })
  })
})

describe('Mobile menu', () => {
  test('starts closed: hidden, and the button says it opens the menu', () => {
    setup()
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(toggle()).toHaveAttribute('aria-controls', 'mobile-menu')
    expect(toggle()).toHaveAccessibleName('Open menu')
    expect(mobileMenu()).not.toBeVisible()
    expect(screen.queryByRole('navigation', { name: 'Mobile' })).not.toBeInTheDocument()
  })

  test('opens on click, showing every link and the Apply CTA', async () => {
    const user = setup()
    await user.click(toggle())
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    expect(toggle()).toHaveAccessibleName('Close menu')
    const menu = screen.getByRole('navigation', { name: 'Mobile' })
    expect(menu).toBeVisible()
    const labels = within(menu).getAllByRole('link').map((a) => a.textContent.trim())
    expect(labels).toEqual([...NAV.map(([label]) => label), 'Apply for Loan'])
  })

  test('closes when the button is pressed again', async () => {
    const user = setup()
    await user.click(toggle())
    await user.click(toggle())
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(mobileMenu()).not.toBeVisible()
  })

  test('Escape closes it and returns focus to the menu button', async () => {
    const user = setup()
    await user.click(toggle())
    await user.tab() // move focus into the menu
    await user.keyboard('{Escape}')
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(mobileMenu()).not.toBeVisible()
    expect(toggle()).toHaveFocus()
  })

  test('Escape does nothing while the menu is closed', async () => {
    const user = setup()
    await user.keyboard('{Escape}')
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
  })

  test('choosing a section closes the menu and records the nav_click', async () => {
    const user = setup()
    await user.click(toggle())
    await user.click(within(screen.getByRole('navigation', { name: 'Mobile' })).getByRole('link', { name: 'How It Works' }))
    expect(track).toHaveBeenCalledWith('nav_click', { navTarget: 'how-it-works' })
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(mobileMenu()).not.toBeVisible()
  })

  test('the mobile Apply CTA closes the menu and records its own CTA id', async () => {
    const user = setup()
    await user.click(toggle())
    const cta = within(screen.getByRole('navigation', { name: 'Mobile' })).getByRole('link', { name: 'Apply for Loan' })
    expect(cta).toHaveAttribute('href', '#apply')
    await user.click(cta)
    expect(track).toHaveBeenCalledWith('cta_click', { ctaId: 'mobile_nav_apply' })
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
  })

  test('is operable by keyboard alone', async () => {
    const user = setup()
    toggle().focus()
    await user.keyboard('{Enter}')
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard(' ')
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
  })
})
