"use client";

import { motion } from "framer-motion";
import { stats } from "@/data/content";
import { AnimatedCounter } from "@/components/ui/AnimatedCounter";

export function Statistics() {
  return (
    <section className="container-app py-12 md:py-16">
      <div className="relative overflow-hidden rounded-3xl bg-brand-ink px-6 py-12 text-white shadow-soft-lg md:px-12 md:py-16">
        <div className="pointer-events-none absolute inset-0 bg-grid-dark bg-[size:36px_36px] opacity-30" />
        <div className="pointer-events-none absolute -left-10 top-0 h-56 w-56 rounded-full bg-brand-yellow/25 blur-[90px]" />
        <div className="pointer-events-none absolute -right-10 bottom-0 h-56 w-56 rounded-full bg-brand-yellow/20 blur-[90px]" />

        <div className="relative grid grid-cols-2 gap-8 lg:grid-cols-4">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="text-center"
            >
              <div className="text-4xl font-extrabold tracking-tight text-brand-yellow sm:text-5xl">
                <AnimatedCounter
                  value={stat.value}
                  suffix={stat.suffix}
                  prefix={stat.prefix}
                />
              </div>
              <p className="mt-2 text-sm font-medium text-gray-300">
                {stat.label}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
