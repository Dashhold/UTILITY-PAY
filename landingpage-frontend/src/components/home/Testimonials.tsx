"use client";

import { motion } from "framer-motion";
import { Star, Quote } from "lucide-react";
import { testimonials } from "@/data/content";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { StaggerContainer, staggerItem } from "@/components/ui/Reveal";

export function Testimonials() {
  return (
    <section className="relative overflow-hidden bg-gray-50/70 py-20 dark:bg-white/[0.02] md:py-28">
      <div className="container-app">
        <SectionHeading
          eyebrow="Testimonials"
          title="Trusted by Partners Across India"
          description="Retailers, distributors, and merchants rely on UTILIPAY HUB every day to grow their business."
        />

        <StaggerContainer className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {testimonials.map((t) => (
            <motion.figure
              key={t.name}
              variants={staggerItem}
              className="card-hover flex flex-col gap-4"
            >
              <Quote className="h-8 w-8 text-brand-yellow" />
              <blockquote className="flex-1 text-sm leading-relaxed text-brand-grey-dark dark:text-gray-300">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <div className="flex gap-0.5">
                {Array.from({ length: t.rating }).map((_, i) => (
                  <Star
                    key={i}
                    size={15}
                    className="fill-brand-yellow text-brand-yellow"
                  />
                ))}
              </div>
              <figcaption className="flex items-center gap-3 border-t border-gray-100 pt-4 dark:border-white/10">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-yellow/20 text-sm font-bold text-brand-yellow-dark dark:text-brand-yellow">
                  {t.name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-brand-ink dark:text-white">
                    {t.name}
                  </p>
                  <p className="text-xs text-brand-grey dark:text-gray-400">
                    {t.role}
                  </p>
                </div>
              </figcaption>
            </motion.figure>
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}
