import { useEffect } from 'react'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Hero from './sections/Hero'
import Benefits from './sections/Benefits'
import LeadFormSection from './sections/LeadFormSection'
import HowItWorks from './sections/HowItWorks'
import Faq from './sections/Faq'
import FinalCta from './sections/FinalCta'
import { trackPageView } from './services/analytics'
import './sections/sections.css'

const App = () => {
  useEffect(() => {
    trackPageView()
  }, [])

  return (
    <>
      <a href="#apply" className="skip-link">Skip to the enquiry form</a>
      <Navbar />
      <main>
        <Hero />
        <Benefits />
        <LeadFormSection />
        <HowItWorks />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  )
}

export default App
