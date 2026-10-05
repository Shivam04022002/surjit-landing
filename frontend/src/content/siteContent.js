// All visitor-facing copy for the landing page, in one place so it can be
// updated without touching components.
//
// Lines marked `CONFIRM:` are placeholder or reference copy that has NOT been
// verified as an approved company claim. Each must be reviewed by the business
// (and, for privacy and consent text, by legal) before production. The full
// list is in README.md → "Content requiring approval".
//
// Deliberately absent until supplied and approved: interest rates, processing
// times, loan limits as marketing claims, statistics, testimonials, lender or
// partner logos, awards, phone numbers, email addresses and office addresses.

export const brand = {
  name: 'Surjit Finance',
  logoAlt: 'Surjit Finance'
}

export const nav = [
  { label: 'Home', target: 'home' },
  { label: 'Business Loan', target: 'benefits' },
  { label: 'How It Works', target: 'how-it-works' },
  { label: 'FAQs', target: 'faq' }
]

export const hero = {
  eyebrow: 'Business Loans',
  // CONFIRM: headline and description are neutral placeholder copy.
  title: 'Finance to help your business grow',
  description:
    'Tell us what your business needs. Share a few details in a short four-step enquiry, and our team will get in touch to discuss your options.',
  primaryCta: 'Apply for Loan',
  secondaryCta: 'How it works',
  visualTitle: 'Your enquiry in four short steps',
  visualSteps: ['Location', 'Loan details', 'Financial health', 'Business info'],
  visualNote: 'Takes a few minutes. No documents needed to enquire.'
}

export const benefits = {
  title: 'A simple way to start your business loan enquiry',
  // CONFIRM: benefit wording. None of these promises a rate, time or outcome.
  intro: 'Whether you are expanding, buying stock or investing in equipment, start with a short enquiry.',
  items: [
    {
      icon: 'ClipboardList',
      title: 'Short, guided form',
      text: 'Four quick steps covering your location, loan need, business finances and contact details.'
    },
    {
      icon: 'Briefcase',
      title: 'Built around your business',
      text: 'Tell us how you plan to use the funds — expansion, inventory, machinery, working capital or other needs.'
    },
    {
      icon: 'FileText',
      title: 'No documents to enquire',
      text: 'You do not need to upload anything now. If you proceed, our team will explain which documents are required.'
    },
    {
      icon: 'PhoneCall',
      // CONFIRM: that the team follows up every enquiry by phone.
      title: 'A person follows up',
      text: 'A member of our team reviews your enquiry and contacts you to discuss suitable options.'
    }
  ]
}

export const leadForm = {
  title: 'Apply for Loan',
  // CONFIRM: "instant approval" is reference copy from the original form. It
  // must not go live unless it is an approved, accurate company claim — an
  // enquiry is not an approval.
  subtitle: 'Get instant approval with minimal documentation',
  // CONFIRM (legal): consent wording.
  consentLabel:
    'I agree that Surjit Finance may contact me by phone about this business loan enquiry.',
  // CONFIRM (legal): privacy notice. No privacy policy page has been supplied
  // for this site, so the notice is shown in full beside the submit button.
  privacyNotice:
    'Privacy notice: Surjit Finance will use the details in this form only to respond to your business loan enquiry. Your form details are not shared with analytics or advertising services. Submitting this form is an enquiry, not a loan application or approval.',
  // Accurate as implemented: form values are sent only to the lead API and
  // are never included in analytics events.
  securityNote: 'Your details are sent only to Surjit Finance and are never included in website analytics.',
  successTitle: 'Thank you! Your enquiry has been received.',
  // CONFIRM: follow-up commitment.
  successBody: 'Our team will review your enquiry and contact you on the phone number you provided.',
  successDisclaimer: 'Please keep your reference for any follow-up. Submitting an enquiry is not a loan approval.'
}

export const howItWorks = {
  title: 'How it works',
  intro: 'Submitting the form starts a conversation. It is not a loan application or an approval.',
  // CONFIRM: process steps 2–4 describe the follow-up process.
  steps: [
    { title: 'Submit your enquiry', text: 'Complete the four-step form with basic details about your business and loan need.' },
    { title: 'We review it', text: 'Our team looks at the details you shared to understand your requirement.' },
    { title: 'We get in touch', text: 'We contact you to discuss available options and, if you wish to proceed, the documents needed.' },
    { title: 'Application and assessment', text: 'Any loan is subject to a formal application, eligibility checks and approval.' }
  ]
}

export const faq = {
  title: 'Frequently asked questions',
  // `id` is stable and is what analytics records when a question is opened.
  items: [
    {
      id: 'is-this-an-application',
      question: 'Is this enquiry a loan application?',
      answer:
        'No. The form is an enquiry that helps our team understand your requirement. Any loan requires a separate formal application, eligibility checks and approval.'
    },
    {
      id: 'what-happens-next',
      question: 'What happens after I submit an enquiry?',
      // CONFIRM: follow-up process.
      answer:
        'Our team reviews your details and contacts you on the phone number you provided to discuss suitable options and next steps.'
    },
    {
      id: 'who-can-enquire',
      question: 'Who can submit an enquiry?',
      // CONFIRM: eligibility wording. No criteria are stated until approved.
      answer:
        'Business owners looking for finance for their business can submit an enquiry. Eligibility is assessed by our team, who will explain the criteria that apply to you.'
    },
    {
      id: 'documents-needed',
      question: 'Do I need any documents to enquire?',
      answer:
        'No documents are needed to submit this enquiry. If you decide to proceed, our team will tell you which documents are required for your application.'
    },
    {
      id: 'exact-credit-score',
      question: 'Do I need to know my exact credit score?',
      answer:
        'No. Choose the range that best matches your estimate. It only helps our team understand your profile before they speak with you.'
    },
    {
      id: 'how-details-used',
      question: 'How are my details used?',
      // CONFIRM (legal): data use statement.
      answer:
        'Your details are used to respond to your enquiry. They are not shared with analytics or advertising services. The website records anonymous usage statistics, such as page visits and form progress, that do not include anything you type into the form.'
    },
    {
      id: 'made-a-mistake',
      question: 'I made a mistake in my enquiry. What should I do?',
      answer:
        'Let our team know when they contact you, quoting your enquiry reference, and they will update your details.'
    }
  ]
}

export const finalCta = {
  title: 'Ready to tell us about your business?',
  text: 'Start your enquiry now. It only takes a few minutes.',
  cta: 'Apply for Loan'
}

export const footer = {
  // CONFIRM: add verified contact details (phone, email, address) when
  // supplied. None are shown until then.
  tagline: 'Business loan enquiries',
  note: 'Submitting an enquiry does not guarantee a loan. All loans are subject to eligibility, documentation and approval.'
}
