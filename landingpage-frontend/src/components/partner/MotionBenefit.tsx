"use client";

import { motion } from "framer-motion";
import type { PartnerBenefit } from "@/data/content";
import { staggerItem } from "@/components/ui/Reveal";

export function MotionBenefit({ benefit }: { benefit: PartnerBenefit }) {
  const Icon = benefit.icon;
  return (
    <motion.div variants={staggerItem} className="card-hover flex flex-col gap-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-yellow/15 text-brand-yellow-dark dark:text-brand-yellow">
        <Icon size={24} />
      </div>
      <h3 className="text-lg font-semibold text-brand-ink dark:text-white">
        {benefit.title}
      </h3>
      <p className="text-sm leading-relaxed text-brand-grey dark:text-gray-400">
        {benefit.description}
      </p>
    </motion.div>
  );
}
