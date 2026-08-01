"use client";

import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2, Send } from "lucide-react";

export function ContactForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("loading");
    // Simulated submission — connect to your API/email service here.
    setTimeout(() => setStatus("success"), 1200);
  };

  if (status === "success") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-4 rounded-2xl border border-brand-yellow/30 bg-brand-yellow/10 p-10 text-center"
      >
        <CheckCircle2 className="h-14 w-14 text-brand-yellow-dark" />
        <h3 className="text-xl font-bold text-brand-ink dark:text-white">
          Message Sent!
        </h3>
        <p className="max-w-sm text-sm text-brand-grey dark:text-gray-400">
          Thanks for reaching out. Our team will get back to you as soon as
          possible.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="btn-secondary mt-2"
        >
          Send Another Message
        </button>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="c-name" className="text-sm font-medium text-brand-ink dark:text-gray-200">
            Full Name
          </label>
          <input id="c-name" name="name" required placeholder="Your name" className="input-base" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="c-phone" className="text-sm font-medium text-brand-ink dark:text-gray-200">
            Mobile Number
          </label>
          <input
            id="c-phone"
            name="phone"
            type="tel"
            pattern="[0-9]{10}"
            required
            placeholder="10-digit number"
            className="input-base"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="c-email" className="text-sm font-medium text-brand-ink dark:text-gray-200">
          Email Address
        </label>
        <input
          id="c-email"
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          className="input-base"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="c-subject" className="text-sm font-medium text-brand-ink dark:text-gray-200">
          Subject
        </label>
        <input
          id="c-subject"
          name="subject"
          required
          placeholder="How can we help?"
          className="input-base"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="c-message" className="text-sm font-medium text-brand-ink dark:text-gray-200">
          Message
        </label>
        <textarea
          id="c-message"
          name="message"
          rows={5}
          required
          placeholder="Write your message..."
          className="input-base resize-none"
        />
      </div>

      <button type="submit" disabled={status === "loading"} className="btn-primary w-full sm:w-auto">
        {status === "loading" ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Sending...
          </>
        ) : (
          <>
            Send Message
            <Send size={16} />
          </>
        )}
      </button>
    </form>
  );
}
