import { ChevronDown } from 'lucide-react'
import { faq } from '../content/siteContent'
import { track } from '../services/analytics'

// Native <details>/<summary>: keyboard operable and announced as expandable
// without any extra ARIA. Opening a question records its id, not its text.
const Faq = () => (
  <section id="faq" className="section" aria-labelledby="faq-title">
    <div className="container faq-container">
      <div className="section-head">
        <h2 id="faq-title">{faq.title}</h2>
      </div>
      <div className="faq-list">
        {faq.items.map((item) => (
          <details
            key={item.id}
            className="faq-item"
            onToggle={(e) => { if (e.currentTarget.open) track('faq_open', { faqId: item.id }) }}
          >
            <summary>
              <span className="faq-question">{item.question}</span>
              <ChevronDown className="faq-chevron" size={20} aria-hidden="true" />
            </summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </div>
  </section>
)

export default Faq
