"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, LogIn } from "lucide-react";

import { appUrls } from "@/lib/site";

const APP_LOGIN_URL = appUrls.login;
const APP_REGISTER_URL = appUrls.register;

export function ContactCTA() {
  return (
    <section className="container-app py-12 md:py-20">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-yellow via-brand-yellow to-brand-yellow-dark px-6 py-14 text-center shadow-glow md:px-12 md:py-20"
      >
        <div className="pointer-events-none absolute inset-0 bg-grid-light bg-[size:32px_32px] opacity-40" />
        <div className="relative mx-auto max-w-2xl">
          <h2 className="text-3xl font-extrabold tracking-tight text-brand-ink sm:text-4xl">
            Ready to Grow Your Business with UTILIPAY HUB?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-brand-ink/80">
            Create your account in minutes and start offering secure recharge,
            bill payments, and BBPS services. Already registered? Just log in.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={APP_REGISTER_URL}
              className="btn inline-flex bg-brand-ink text-white hover:-translate-y-0.5 hover:bg-brand-grey-dark"
            >
              Register Now
              <ArrowRight size={16} />
            </a>
            <a
              href={APP_LOGIN_URL}
              className="btn inline-flex border border-brand-ink/20 bg-white/70 text-brand-ink hover:-translate-y-0.5 hover:bg-white"
            >
              <LogIn size={16} />
              Login
            </a>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
