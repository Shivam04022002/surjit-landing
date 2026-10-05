import { howItWorks } from '../content/siteContent'

const HowItWorks = () => (
  <section id="how-it-works" className="section section-alt" aria-labelledby="how-title">
    <div className="container">
      <div className="section-head">
        <h2 id="how-title">{howItWorks.title}</h2>
        <p>{howItWorks.intro}</p>
      </div>
      <ol className="process">
        {howItWorks.steps.map((step, i) => (
          <li key={step.title} className="process-step">
            <span className="process-number" aria-hidden="true">{i + 1}</span>
            <div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  </section>
)

export default HowItWorks
