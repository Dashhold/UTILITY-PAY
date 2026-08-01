"use client";

import { motion } from "framer-motion";
import { features } from "@/data/content";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { StaggerContainer, staggerItem } from "@/components/ui/Reveal";

export function WhyChooseUs() {
  return (
    <section className="relative overflow-hidden bg-gray-50/70 py-20 dark:bg-white/[0.02] md:py-28">
      <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-brand-yellow/10 blur-[110px]" />
      <div className="container-app">
        <SectionHeading
          eyebrow="Why Choose Us"
          title="Built for Trust, Speed & Scale"
          description="A fintech platform engineered with enterprise-grade reliability so you can serve your customers with confidence."
        />

        <StaggerContainer className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                variants={staggerItem}
                className="group card-hover flex gap-4"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-yellow/15 text-brand-yellow-dark transition-colors group-hover:bg-brand-yellow group-hover:text-brand-ink dark:text-brand-yellow">
                  <Icon size={22} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-brand-ink dark:text-white">
                    {feature.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-brand-grey dark:text-gray-400">
                    {feature.description}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </StaggerContainer>
      </div>
    </section>
  );
}
