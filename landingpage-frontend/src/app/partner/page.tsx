import type { Metadata } from "next";
import { howItWorks } from "@/data/content";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal, StaggerContainer } from "@/components/ui/Reveal";
import { PartnerForm } from "@/components/forms/PartnerForm";
import { PartnerBenefitsGrid } from "@/components/partner/PartnerBenefitsGrid";

export const metadata: Metadata = {
  title: "Become a Partner",
  description:
    "Partner with UTILIPAY HUB to offer recharge, utility bill payments, and BBPS services. Enjoy attractive commissions, instant activation, and 24x7 support.",
  alternates: { canonical: "/partner" },
};

export default function PartnerPage() {
  return (
    <>
      <PageHeader
        eyebrow="Merchant / Partner Program"
        title="Grow Your Business as a UTILIPAY HUB Partner"
        description="Turn your shop or business into a one-stop digital payments destination. Earn on every transaction with the tools and support you need to succeed."
      />

      {/* Benefits */}
      <section className="container-app py-16 md:py-24">
        <SectionHeading
          eyebrow="Partner Benefits"
          title="Why Partner With Us"
          description="We give you everything to start earning quickly and scale confidently."
        />
        <PartnerBenefitsGrid />
      </section>

      {/* Onboarding flow */}
      <section className="bg-gray-50/70 py-16 dark:bg-white/[0.02] md:py-24">
        <div className="container-app">
          <SectionHeading
            eyebrow="Onboarding Flow"
            title="Get Onboarded in Three Steps"
            description="A simple, guided process from sign-up to your first transaction."
          />
          <div className="mx-auto mt-12 grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-3">
            {howItWorks.map((step, i) => {
              const Icon = step.icon;
              return (
                <StaggerContainer key={step.title}>
                  <div className="card flex h-full flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-yellow/15 text-brand-yellow-dark dark:text-brand-yellow">
                        <Icon size={22} />
                      </div>
                      <span className="text-3xl font-extrabold text-brand-yellow/40">
                        0{i + 1}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold text-brand-ink dark:text-white">
                      {step.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-brand-grey dark:text-gray-400">
                      {step.description}
                    </p>
                  </div>
                </StaggerContainer>
              );
            })}
          </div>
        </div>
      </section>

      {/* Registration form */}
      <section id="register" className="container-app py-16 md:py-24">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-start">
          <Reveal className="lg:sticky lg:top-28">
            <span className="chip">Registration</span>
            <h2 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
              <span className="heading-gradient">
                Register Your Partnership
              </span>
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-brand-grey dark:text-gray-400">
              Fill in your details and our onboarding team will reach out to
              activate your account. It only takes a few minutes to get started.
            </p>
            <ul className="mt-8 flex flex-col gap-3 text-sm text-brand-grey-dark dark:text-gray-300">
              <li>✓ No hidden charges — transparent pricing</li>
              <li>✓ Same-day activation after verification</li>
              <li>✓ Dedicated relationship manager</li>
              <li>✓ 24x7 technical &amp; business support</li>
            </ul>
          </Reveal>

          <Reveal delay={0.15} className="card p-6 sm:p-8">
            <PartnerForm />
          </Reveal>
        </div>
      </section>
    </>
  );
}
