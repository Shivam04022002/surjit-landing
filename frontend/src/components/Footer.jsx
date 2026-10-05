import Logo from './Logo'
import { brand, nav, footer } from '../content/siteContent'
import { track } from '../services/analytics'
import './Footer.css'

// Contact details, privacy policy and terms links are intentionally absent:
// none have been supplied or approved for this site (see README).
const Footer = () => (
  <footer className="site-footer">
    <div className="container footer-inner">
      <div className="footer-brand">
        <Logo height={32} />
        <p>{footer.tagline}</p>
      </div>

      <nav aria-label="Footer">
        <ul className="footer-links">
          {nav.map((item) => (
            <li key={item.target}>
              <a href={`#${item.target}`} onClick={() => track('nav_click', { navTarget: item.target })}>{item.label}</a>
            </li>
          ))}
          <li>
            <a href="#apply" onClick={() => track('nav_click', { navTarget: 'apply' })}>Apply for Loan</a>
          </li>
        </ul>
      </nav>
    </div>

    <div className="container footer-bottom">
      <p className="footer-note">{footer.note}</p>
      <p>© {new Date().getFullYear()} {brand.name}. All rights reserved.</p>
    </div>
  </footer>
)

export default Footer
