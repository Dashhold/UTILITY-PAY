import type { Metadata } from "next";
import Link from "next/link";
import { Target, Eye, ArrowRight } from "lucide-react";
import { siteConfig } from "@/lib/site";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal, StaggerContainer } from "@/components/ui/Reveal";
import { TrustIndicators } from "@/components/about/TrustIndicators";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "Learn about UTILIPAY HUB (OPC) PRIVATE LIMITED — our mission, vision, and commitment to secure, accessible digital payments and BBPS-enabled utility services across India.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="About Us"
        title="Building India's Trusted Digital Payments Platform"
        description={`${siteConfig.legalName} is on a mission to make recharge, utility bill payments, and financial services accessible, secure, and effortless for everyone.`}
      />

      {/* Intro */}
      <section className="container-app py-16 md:py-24">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <span className="chip">Who We Are</span>
            <h2 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
              <span className="heading-gradient">
                A Fintech Company Focused on Trust &amp; Access
              </span>
            </h2>
            <div className="mt-5 flex flex-col gap-4 text-base leading-relaxed text-brand-grey dark:text-gray-400">
              <p>
                {siteConfig.legalName} is a modern fintech company delivering a
                unified platform for digital payments, recharge, and BBPS-enabled
                utility bill payments. We empower retailers, distributors, and
                businesses to serve their customers better.
              </p>
              <p>
                With a strong focus on security, reliability, and simplicity, we
                bring together the entire spectrum of everyday payment needs into
                a single, dependable ecosystem — built for India&apos;s
                fast-growing digital economy.
              </p>
            </div>
            <Link href="/contact" className="btn-primary mt-8">
              Get in Touch
              <ArrowRight size={16} />
            </Link>
          </Reveal>

          <TrustIndicators />
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="bg-gray-50/70 py-16 dark:bg-white/[0.02] md:py-24">
        <div className="container-app grid grid-cols-1 gap-6 md:grid-cols-2">
          <Reveal className="card flex flex-col gap-4 p-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-yellow text-brand-ink">
              <Target size={26} />
            </div>
            <h3 className="text-2xl font-bold text-brand-ink dark:text-white">
              Our Mission
            </h3>
            <p className="text-base leading-relaxed text-brand-grey dark:text-gray-400">
              To simplify digital payments for every Indian by delivering a
              secure, reliable, and accessible platform that brings recharge,
              utility bills, and financial services within everyone&apos;s reach.
            </p>
          </Reveal>

          <Reveal delay={0.12} className="card flex flex-col gap-4 p-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-ink text-brand-yellow">
              <Eye size={26} />
            </div>
            <h3 className="text-2xl font-bold text-brand-ink dark:text-white">
              Our Vision
            </h3>
            <p className="text-base leading-relaxed text-brand-grey dark:text-gray-400">
              To become India&apos;s most trusted fintech ecosystem, empowering
              millions of retailers and partners to build thriving digital
              payment businesses in every corner of the country.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Fintech positioning */}
      <section className="container-app py-16 md:py-24">
        <SectionHeading
          eyebrow="Our Positioning"
          title="Enterprise-Grade Fintech, Built for Everyone"
          description="We combine the reliability of enterprise infrastructure with the simplicity retailers and customers deserve."
        />
        <StaggerContainer className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
          {[
            {
              title: "Secure by Design",
              text: "Security is embedded at every layer — from encrypted transactions to compliant infrastructure.",
            },
            {
              title: "Built to Scale",
              text: "Our platform handles high transaction volumes with consistent speed and uptime.",
            },
            {
              title: "Partner-First",
              text: "We succeed when our partners succeed, with transparent pricing and dedicated support.",
            },
          ].map((card) => (
            <div key={card.title} className="card-hover">
              <h3 className="text-lg font-semibold text-brand-ink dark:text-white">
                {card.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-brand-grey dark:text-gray-400">
                {card.text}
              </p>
            </div>
          ))}
        </StaggerContainer>
      </section>
    </>
  );
}
