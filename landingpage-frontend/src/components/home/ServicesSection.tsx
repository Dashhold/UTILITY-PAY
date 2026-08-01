"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { services } from "@/data/services";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ServiceCard } from "@/components/ui/ServiceCard";
import { StaggerContainer } from "@/components/ui/Reveal";

export function ServicesSection() {
  const featured = services.slice(0, 8);
  return (
    <section id="services" className="container-app py-20 md:py-28">
      <SectionHeading
        eyebrow="Our Services"
        title="Everything Your Customers Need, In One Place"
        description="From recharges to utility bills and BBPS payments, offer a complete suite of digital services under a single trusted brand."
      />

      <StaggerContainer className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {featured.map((service) => (
          <ServiceCard key={service.slug} service={service} />
        ))}
      </StaggerContainer>

      <div className="mt-12 flex justify-center">
        <Link href="/services" className="btn-secondary">
          View All Services
          <ArrowRight size={16} />
        </Link>
      </div>
    </section>
  );
}
