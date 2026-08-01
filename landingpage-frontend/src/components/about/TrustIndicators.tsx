"use client";

import { ShieldCheck, Award, Users, TrendingUp } from "lucide-react";
import { StaggerContainer } from "@/components/ui/Reveal";
import { AboutValue } from "./AboutValue";

const trustIndicators = [
  { icon: ShieldCheck, label: "Bank-Grade Security", value: "PCI-DSS Aligned" },
  { icon: Award, label: "BBPS Enabled", value: "NPCI Integrated" },
  { icon: Users, label: "Growing Network", value: "50K+ Partners" },
  { icon: TrendingUp, label: "Reliable Platform", value: "99.9% Uptime" },
];

export function TrustIndicators() {
  return (
    <StaggerContainer className="grid grid-cols-2 gap-4">
      {trustIndicators.map((item) => (
        <AboutValue key={item.label} item={item} />
      ))}
    </StaggerContainer>
  );
}
