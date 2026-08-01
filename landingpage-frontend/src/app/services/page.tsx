import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ServicesCatalog } from "@/components/services/ServicesCatalog";
import { appUrls } from "@/lib/site";

const APP_REGISTER_URL = appUrls.register;

export const metadata: Metadata = {
  title: "Services",
  description:
    "Explore UTILIPAY HUB services: mobile & DTH recharge, FASTag, electricity, water, gas, broadband, credit card bills, OTT, insurance, EV charging, municipal tax, and digital collections.",
  alternates: { canonical: "/services" },
};

export default function ServicesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Our Services"
        title="A Complete Suite of Digital Payment Services"
        description="Offer your customers everything from instant recharges to BBPS-enabled utility bill payments — all through one secure platform."
      />

      <div className="container-app py-16 md:py-20">
        <ServicesCatalog />

        <div className="mt-8 flex flex-col items-center gap-4 rounded-3xl border border-brand-yellow/30 bg-brand-yellow/10 p-10 text-center">
          <h3 className="text-2xl font-bold text-brand-ink dark:text-white">
            Want to offer these services?
          </h3>
          <p className="max-w-xl text-sm text-brand-grey dark:text-gray-400">
            Create your UTILIPAY HUB account and start earning on every
            transaction today.
          </p>
          <a href={APP_REGISTER_URL} className="btn-primary">
            Register Now
            <ArrowRight size={16} />
          </a>
        </div>
      </div>
    </>
  );
}
