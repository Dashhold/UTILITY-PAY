"use client";

import { partnerBenefits } from "@/data/content";
import { StaggerContainer } from "@/components/ui/Reveal";
import { MotionBenefit } from "./MotionBenefit";

export function PartnerBenefitsGrid() {
  return (
    <StaggerContainer className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {partnerBenefits.map((benefit) => (
        <MotionBenefit key={benefit.title} benefit={benefit} />
      ))}
    </StaggerContainer>
  );
}
