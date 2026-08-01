"use client";

import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2 } from "lucide-react";

const businessTypes = [
  "Retailer",
  "Distributor",
  "Merchant",
  "Agent",
  "Other",
];

export function PartnerForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("loading");
    // Simulated submission — connect to your API/CRM endpoint here.
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
          Application Received!
        </h3>
        <p className="max-w-sm text-sm text-brand-grey dark:text-gray-400">
          Thank you for your interest in partnering with UTILIPAY HUB. Our team
          will reach out to you shortly to complete onboarding.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="btn-secondary mt-2"
        >
          Submit Another Application
        </button>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Full Name" name="name" placeholder="Your full name" required />
        <Field
          label="Business Name"
          name="business"
          placeholder="Your business / shop name"
          required
        />
        <Field
          label="Mobile Number"
          name="phone"
          type="tel"
          placeholder="10-digit mobile number"
          pattern="[0-9]{10}"
          required
        />
        <Field
          label="Email Address"
          name="email"
          type="email"
          placeholder="you@example.com"
          required
        />
        <Field label="City" name="city" placeholder="Your city" required />
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="type"
            className="text-sm font-medium text-brand-ink dark:text-gray-200"
          >
            Business Type
          </label>
          <select
            id="type"
            name="type"
            required
            defaultValue=""
            className="input-base"
          >
            <option value="" disabled>
              Select type
            </option>
            {businessTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="message"
          className="text-sm font-medium text-brand-ink dark:text-gray-200"
        >
          Message (optional)
        </label>
        <textarea
          id="message"
          name="message"
          rows={4}
          placeholder="Tell us a bit about your business..."
          className="input-base resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={status === "loading"}
        className="btn-primary w-full sm:w-auto"
      >
        {status === "loading" ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Submitting...
          </>
        ) : (
          "Submit Application"
        )}
      </button>
      <p className="text-xs text-brand-grey dark:text-gray-500">
        By submitting, you agree to our Terms &amp; Conditions and Privacy
        Policy.
      </p>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  required,
  pattern,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  pattern?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={name}
        className="text-sm font-medium text-brand-ink dark:text-gray-200"
      >
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        pattern={pattern}
        className="input-base"
      />
    </div>
  );
}
