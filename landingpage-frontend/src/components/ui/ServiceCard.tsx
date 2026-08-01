"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import type { Service } from "@/data/services";
import { staggerItem } from "./Reveal";

export function ServiceCard({
  service,
  showHighlights = false,
}: {
  service: Service;
  showHighlights?: boolean;
}) {
  const { icon: Icon, title, description, highlights } = service;
  return (
    <motion.article
      variants={staggerItem}
      className="group card-hover flex flex-col gap-4"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-yellow/15 text-brand-yellow-dark transition-colors duration-300 group-hover:bg-brand-yellow group-hover:text-brand-ink dark:text-brand-yellow">
        <Icon size={24} />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-brand-ink dark:text-white">
          {title}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-brand-grey dark:text-gray-400">
          {description}
        </p>
      </div>
      {showHighlights && (
        <ul className="mt-auto flex flex-col gap-1.5 pt-2">
          {highlights.map((h) => (
            <li
              key={h}
              className="flex items-center gap-2 text-xs font-medium text-brand-grey-dark dark:text-gray-300"
            >
              <Check size={14} className="text-brand-yellow-dark" />
              {h}
            </li>
          ))}
        </ul>
      )}
    </motion.article>
  );
}
