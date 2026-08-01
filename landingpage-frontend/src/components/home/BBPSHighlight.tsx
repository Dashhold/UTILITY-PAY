"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ShieldCheck, Receipt, Landmark, ArrowRight } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";

const points = [
  {
    icon: Landmark,
    title: "Powered by NPCI",
    text: "Standardized bill payments through the Bharat Bill Payment System.",
  },
  {
    icon: ShieldCheck,
    title: "Secure & Certified",
    text: "Every transaction follows RBI-mandated security and compliance.",
  },
  {
    icon: Receipt,
    title: "Instant Receipts",
    text: "Digital confirmation and receipts for complete transparency.",
  },
];

export function BBPSHighlight() {
  return (
    <section className="container-app py-20 md:py-28">
      <div className="relative overflow-hidden rounded-3xl border border-brand-yellow/30 bg-gradient-to-br from-brand-yellow/15 via-white to-white p-8 shadow-soft dark:from-brand-yellow/10 dark:via-white/[0.03] dark:to-transparent md:p-14">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-brand-yellow/25 blur-[90px]" />

        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <Reveal>
              <span className="chip">Bharat Bill Payment System</span>
              <h2 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
                <span className="heading-gradient">
                  BBPS-Enabled Bill Payments You Can Trust
                </span>
              </h2>
              <p className="mt-4 max-w-lg text-base leading-relaxed text-brand-grey dark:text-gray-400">
                We are integrated with BBPS, the one-stop ecosystem for bill
                payments in India. Offer your customers a secure, interoperable,
                and accessible payment experience across thousands of billers.
              </p>
              <Link href="/services" className="btn-primary mt-8">
                Explore BBPS Services
                <ArrowRight size={16} />
              </Link>
            </Reveal>
          </div>

          <div className="flex flex-col gap-4">
            {points.map((point, i) => {
              const Icon = point.icon;
              return (
                <motion.div
                  key={point.title}
                  initial={{ opacity: 0, x: 30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.12 }}
                  className="glass flex items-center gap-4 rounded-2xl p-5"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-yellow text-brand-ink">
                    <Icon size={22} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-brand-ink dark:text-white">
                      {point.title}
                    </h3>
                    <p className="text-sm text-brand-grey dark:text-gray-400">
                      {point.text}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
