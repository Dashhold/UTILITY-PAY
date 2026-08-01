"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Zap, Star } from "lucide-react";
import {
  Smartphone,
  Tv,
  Car,
  Zap as Bolt,
  Droplets,
  Wifi,
} from "lucide-react";

import { appUrls } from "@/lib/site";

const APP_LOGIN_URL = appUrls.login;
const APP_REGISTER_URL = appUrls.register;

const floatingIcons = [
  { Icon: Smartphone, className: "left-[6%] top-[18%]", delay: 0 },
  { Icon: Tv, className: "right-[10%] top-[12%]", delay: 0.6 },
  { Icon: Car, className: "left-[12%] bottom-[16%]", delay: 1.2 },
  { Icon: Bolt, className: "right-[8%] bottom-[22%]", delay: 0.9 },
  { Icon: Droplets, className: "left-[46%] top-[8%]", delay: 1.5 },
  { Icon: Wifi, className: "right-[26%] bottom-[10%]", delay: 0.3 },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-grid-light bg-[size:44px_44px] opacity-60 dark:bg-grid-dark" />
        <div className="absolute left-1/2 top-0 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-brand-yellow/25 blur-[120px]" />
        <div className="absolute right-0 top-40 h-72 w-72 rounded-full bg-brand-yellow/15 blur-[100px]" />
      </div>

      {/* Floating service icons (desktop) */}
      {floatingIcons.map(({ Icon, className, delay }, i) => (
        <motion.div
          key={i}
          className={`absolute hidden lg:flex ${className} h-14 w-14 items-center justify-center rounded-2xl border border-white/50 bg-white/70 text-brand-yellow-dark shadow-soft backdrop-blur-md dark:border-white/10 dark:bg-white/5 dark:text-brand-yellow`}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1, y: [0, -12, 0] }}
          transition={{
            opacity: { delay, duration: 0.5 },
            scale: { delay, duration: 0.5 },
            y: { duration: 5, repeat: Infinity, ease: "easeInOut", delay },
          }}
        >
          <Icon size={24} />
        </motion.div>
      ))}

      <div className="container-app flex flex-col items-center gap-8 py-20 text-center md:py-28 lg:py-32">
        <motion.span
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="chip"
        >
          <ShieldCheck size={14} />
          BBPS Enabled • Bank-Grade Security
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.08 }}
          className="max-w-4xl text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl"
        >
          One Platform for{" "}
          <span className="relative whitespace-nowrap text-brand-yellow-dark dark:text-brand-yellow">
            Recharge
            <svg
              className="absolute -bottom-2 left-0 w-full"
              viewBox="0 0 200 12"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2 9C50 3 150 3 198 9"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </svg>
          </span>
          , Bill Payments &amp; Digital Utility Services
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.16 }}
          className="max-w-2xl text-base leading-relaxed text-brand-grey dark:text-gray-400 sm:text-lg"
        >
          UTILIPAY HUB unifies mobile recharge, DTH, FASTag, electricity, water,
          gas and more into a single, secure, BBPS-enabled fintech platform
          built for retailers, distributors, and businesses.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.24 }}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <a href={APP_REGISTER_URL} className="btn-primary text-base">
            Register
            <ArrowRight size={18} />
          </a>
          <a href={APP_LOGIN_URL} className="btn-secondary text-base">
            Login
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.32 }}
          className="mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-brand-grey dark:text-gray-400"
        >
          <span className="flex items-center gap-2">
            <Zap size={16} className="text-brand-yellow-dark" />
            Instant Settlements
          </span>
          <span className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-brand-yellow-dark" />
            100% Secure
          </span>
          <span className="flex items-center gap-2">
            <Star size={16} className="fill-brand-yellow text-brand-yellow" />
            Trusted by 50K+ Retailers
          </span>
        </motion.div>
      </div>
    </section>
  );
}
