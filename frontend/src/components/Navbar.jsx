import { useEffect, useRef, useState } from 'react'
import { Menu, X } from 'lucide-react'
import Logo from './Logo'
import { nav } from '../content/siteContent'
import { track } from '../services/analytics'
import './Navbar.css'

const Navbar = () => {
  const [open, setOpen] = useState(false)
  const toggleRef = useRef(null)

  // Escape closes the mobile menu and returns focus to its button.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const onNav = (target) => {
    track('nav_click', { navTarget: target })
    setOpen(false)
  }

  const onApply = (ctaId) => {
    track('cta_click', { ctaId })
    setOpen(false)
  }

  return (
    <header className="site-header">
      <div className="container nav-inner">
        <a href="#home" className="nav-brand" onClick={() => onNav('home')}>
          <Logo height={34} />
        </a>

        <nav className="nav-desktop" aria-label="Main">
          <ul>
            {nav.map((item) => (
              <li key={item.target}>
                <a href={`#${item.target}`} onClick={() => onNav(item.target)}>{item.label}</a>
              </li>
            ))}
          </ul>
        </nav>

        <a href="#apply" className="btn btn-primary nav-cta" onClick={() => onApply('nav_apply')}>
          Apply for Loan
        </a>

        <button
          ref={toggleRef}
          type="button"
          className="nav-toggle"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
          <span className="visually-hidden">{open ? 'Close menu' : 'Open menu'}</span>
        </button>
      </div>

      <nav id="mobile-menu" className={`nav-mobile ${open ? 'is-open' : ''}`} aria-label="Mobile" hidden={!open}>
        <ul className="container">
          {nav.map((item) => (
            <li key={item.target}>
              <a href={`#${item.target}`} onClick={() => onNav(item.target)}>{item.label}</a>
            </li>
          ))}
          <li>
            <a href="#apply" className="btn btn-primary" onClick={() => onApply('mobile_nav_apply')}>
              Apply for Loan
            </a>
          </li>
        </ul>
      </nav>
    </header>
  )
}

export default Navbar
