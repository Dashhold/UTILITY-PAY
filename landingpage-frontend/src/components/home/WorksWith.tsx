"use client";

import Image from "next/image";
import { SectionHeading } from "@/components/ui/SectionHeading";

const partners = [
  { name: "UPI", src: "/unified-payment-interface-upi-seeklogo.png" },
  { name: "BHIM", src: "/bhim-bharat-interface-for-money-seeklogo.png" },
  { name: "Google Pay", src: "/Google_Pay-Logo.wine.png" },
  { name: "PhonePe", src: "/PhonePe-Logo.wine.png" },
  { name: "Paytm", src: "/paytm-log.png" },
  { name: "Amazon Pay", src: "/vecteezy_amazon-logo-png-amazon-icon-transparent-png_19766240.png" },
  { name: "Visa", src: "/visa-seeklogo.png" },
  { name: "Mastercard", src: "/mastercard-26161.png" },
];

export function WorksWith() {
  // Duplicate the list for a seamless, infinite marquee loop.
  const loop = [...partners, ...partners];

  return (
    <section className="py-20 md:py-28">
      <div className="container-app">
        <SectionHeading
          eyebrow="Works With"
          title="Pay Using Any App, Any Card, Any Bank"
          description="UTILIPAY HUB supports every major UPI app, wallet, and card network — giving your customers the freedom to pay however they prefer."
        />
      </div>

      <div
        className="group relative mt-14 overflow-hidden"
        aria-label="Supported payment partners"
      >
        {/* Edge fades */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-white to-transparent dark:from-brand-ink sm:w-32" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-white to-transparent dark:from-brand-ink sm:w-32" />

        <div className="flex w-max animate-marquee items-center gap-6 group-hover:[animation-play-state:paused]">
          {loop.map((partner, i) => (
            <div
              key={`${partner.name}-${i}`}
              className="flex h-24 w-40 shrink-0 items-center justify-center rounded-2xl border border-gray-100 bg-white px-6 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-soft-lg dark:border-white/10 dark:bg-white/[0.04]"
            >
              <div className="relative h-12 w-full">
                <Image
                  src={partner.src}
                  alt={`${partner.name} logo`}
                  fill
                  sizes="160px"
                  className="object-contain"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
