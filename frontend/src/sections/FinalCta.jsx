import { ArrowRight } from 'lucide-react'
import { finalCta } from '../content/siteContent'
import { track } from '../services/analytics'

const FinalCta = () => (
  <section className="final-cta" aria-labelledby="final-cta-title">
    <div className="container final-cta-inner">
      <div>
        <h2 id="final-cta-title">{finalCta.title}</h2>
        <p>{finalCta.text}</p>
      </div>
      <a href="#apply" className="btn btn-light btn-lg" onClick={() => track('cta_click', { ctaId: 'final_apply' })}>
        {finalCta.cta} <ArrowRight size={20} aria-hidden="true" />
      </a>
    </div>
  </section>
)

export default FinalCta
