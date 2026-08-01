import { Hero } from "@/components/home/Hero";
import { ServicesSection } from "@/components/home/ServicesSection";
import { WhyChooseUs } from "@/components/home/WhyChooseUs";
import { BBPSHighlight } from "@/components/home/BBPSHighlight";
import { HowItWorks } from "@/components/home/HowItWorks";
import { Statistics } from "@/components/home/Statistics";
import { WorksWith } from "@/components/home/WorksWith";
import { Testimonials } from "@/components/home/Testimonials";
import { FAQ } from "@/components/home/FAQ";
import { ContactCTA } from "@/components/home/ContactCTA";
import { FaqJsonLd } from "@/components/seo/StructuredData";
import { faqs } from "@/data/content";

export default function HomePage() {
  return (
    <>
      <FaqJsonLd faqs={faqs} />
      <Hero />
      <WorksWith />
      <ServicesSection />
      <WhyChooseUs />
      <BBPSHighlight />
      <HowItWorks />
      <Statistics />
      <Testimonials />
      <FAQ />
      <ContactCTA />
    </>
  );
}
