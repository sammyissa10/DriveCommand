// Landing page composition — each section is a separate component for maintainability.
// Server component: no client-side hooks. FadeIn (client component) is used within sections.

import { HeroSection } from "./hero-section"
import { FeaturesSection } from "./features-section"
import { HowItWorksSection } from "./how-it-works-section"
import { IntegrationsSection } from "./integrations-section"
import { TestimonialsSection } from "./testimonials-section"
import { PricingSection } from "./pricing-section"
import { CTASection } from "./cta-section"
import { FooterSection } from "./footer-section"

export function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col bg-[#0a0e1a]">
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <IntegrationsSection />
      <TestimonialsSection />
      <PricingSection />
      <CTASection />
      <FooterSection />
    </main>
  )
}
