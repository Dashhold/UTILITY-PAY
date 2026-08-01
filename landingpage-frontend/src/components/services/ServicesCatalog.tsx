"use client";

import { services } from "@/data/services";
import { ServiceCard } from "@/components/ui/ServiceCard";
import { StaggerContainer } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";

const categories = ["Recharge", "Utility", "Financial", "Business"] as const;

export function ServicesCatalog() {
  return (
    <>
      {categories.map((category) => {
        const items = services.filter((s) => s.category === category);
        if (items.length === 0) return null;
        return (
          <div key={category} className="mb-16 last:mb-0">
            <SectionHeading
              align="left"
              eyebrow={`${category} Services`}
              title={`${category} Payments & Recharges`}
            />
            <StaggerContainer className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((service) => (
                <ServiceCard
                  key={service.slug}
                  service={service}
                  showHighlights
                />
              ))}
            </StaggerContainer>
          </div>
        );
      })}
    </>
  );
}
