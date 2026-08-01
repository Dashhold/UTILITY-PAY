"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { staggerItem } from "@/components/ui/Reveal";

export function AboutValue({
  item,
}: {
  item: { icon: LucideIcon; label: string; value: string };
}) {
  const Icon = item.icon;
  return (
    <motion.div
      variants={staggerItem}
      className="card flex flex-col gap-3 text-center"
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-yellow/15 text-brand-yellow-dark dark:text-brand-yellow">
        <Icon size={24} />
      </div>
      <p className="text-lg font-bold text-brand-ink dark:text-white">
        {item.value}
      </p>
      <p className="text-xs font-medium uppercase tracking-wide text-brand-grey dark:text-gray-400">
        {item.label}
      </p>
    </motion.div>
  );
}
