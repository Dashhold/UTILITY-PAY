"use client";

import { motion } from "framer-motion";
import { howItWorks } from "@/data/content";
import { SectionHeading } from "@/components/ui/SectionHeading";

export function HowItWorks() {
  return (
    <section className="container-app py-20 md:py-28">
      <SectionHeading
        eyebrow="How It Works"
        title="Get Started in Three Simple Steps"
        description="Onboarding is quick and effortless. Go from sign-up to earning in no time."
      />

      <div className="relative mt-16 grid grid-cols-1 gap-8 md:grid-cols-3">
        {/* Connecting line */}
        <div className="pointer-events-none absolute left-0 right-0 top-8 hidden h-0.5 bg-gradient-to-r from-transparent via-brand-yellow/50 to-transparent md:block" />

        {howItWorks.map((step, i) => {
          const Icon = step.icon;
          return (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className="relative flex flex-col items-center text-center"
            >
              <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-2xl border border-brand-yellow/30 bg-white text-brand-yellow-dark shadow-soft dark:bg-brand-ink dark:text-brand-yellow">
                <Icon size={26} />
                <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-brand-yellow text-xs font-bold text-brand-ink">
                  {i + 1}
                </span>
              </div>
              <h3 className="mt-5 text-lg font-semibold text-brand-ink dark:text-white">
                {step.title}
              </h3>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-brand-grey dark:text-gray-400">
                {step.description}
              </p>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
