import { ClipboardList, Briefcase, FileText, PhoneCall } from 'lucide-react'
import { benefits } from '../content/siteContent'

const ICONS = { ClipboardList, Briefcase, FileText, PhoneCall }

const Benefits = () => (
  <section id="benefits" className="section" aria-labelledby="benefits-title">
    <div className="container">
      <div className="section-head">
        <h2 id="benefits-title">{benefits.title}</h2>
        <p>{benefits.intro}</p>
      </div>
      <ul className="benefit-grid">
        {benefits.items.map((item) => {
          const Icon = ICONS[item.icon]
          return (
            <li key={item.title} className="benefit-card">
              <span className="benefit-icon" aria-hidden="true"><Icon size={24} /></span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </li>
          )
        })}
      </ul>
    </div>
  </section>
)

export default Benefits
