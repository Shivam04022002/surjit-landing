import { ArrowRight, MapPin, IndianRupee, TrendingUp, Building2, Check } from 'lucide-react'
import { hero } from '../content/siteContent'
import { track } from '../services/analytics'

const STEP_ICONS = [MapPin, IndianRupee, TrendingUp, Building2]

// No contact CTA: no verified phone number or email has been supplied, so the
// secondary action points to the process instead.
const Hero = () => (
  <section id="home" className="hero" aria-labelledby="hero-title">
    <div className="container hero-inner">
      <div className="hero-copy">
        <span className="eyebrow">{hero.eyebrow}</span>
        <h1 id="hero-title">{hero.title}</h1>
        <p className="hero-lead">{hero.description}</p>
        <div className="hero-actions">
          <a href="#apply" className="btn btn-primary btn-lg" onClick={() => track('cta_click', { ctaId: 'hero_apply' })}>
            {hero.primaryCta} <ArrowRight size={20} aria-hidden="true" />
          </a>
          <a href="#how-it-works" className="btn btn-secondary btn-lg" onClick={() => track('nav_click', { navTarget: 'how-it-works' })}>
            {hero.secondaryCta}
          </a>
        </div>
      </div>

      {/* A schematic of the form itself rather than a stock photo: it shows
          exactly what the visitor will be asked, and costs no image download. */}
      <div className="hero-visual" aria-hidden="true">
        <div className="hero-visual-card">
          <p className="hero-visual-title">{hero.visualTitle}</p>
          <ol className="hero-visual-steps">
            {hero.visualSteps.map((label, i) => {
              const Icon = STEP_ICONS[i]
              return (
                <li key={label}>
                  <span className="hero-visual-icon"><Icon size={20} /></span>
                  <span className="hero-visual-label">{label}</span>
                  <Check size={18} className="hero-visual-check" />
                </li>
              )
            })}
          </ol>
          <p className="hero-visual-note">{hero.visualNote}</p>
        </div>
      </div>
    </div>
  </section>
)

export default Hero
