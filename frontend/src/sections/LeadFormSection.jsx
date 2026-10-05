import MultiStepLeadForm from '../forms/leadForm/MultiStepLeadForm'
import { leadForm } from '../content/siteContent'

// The form's own heading ("Apply for Loan") names this section.
const LeadFormSection = () => (
  <section id="apply" className="section section-apply" aria-labelledby="lead-form-title">
    <div className="container">
      <MultiStepLeadForm copy={leadForm} />
    </div>
  </section>
)

export default LeadFormSection
