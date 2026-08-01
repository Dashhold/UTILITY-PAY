import {
  ShieldCheck,
  Zap,
  Clock,
  Headphones,
  BadgeIndianRupee,
  Layers,
  UserPlus,
  FileCheck2,
  Rocket,
  type LucideIcon,
} from "lucide-react";

export interface Feature {
  title: string;
  description: string;
  icon: LucideIcon;
}

export const features: Feature[] = [
  {
    title: "Bank-Grade Security",
    description:
      "End-to-end encryption, PCI-DSS aligned infrastructure, and secure gateways protect every transaction.",
    icon: ShieldCheck,
  },
  {
    title: "Instant Settlements",
    description:
      "Real-time processing with instant confirmations so your money never waits.",
    icon: Zap,
  },
  {
    title: "99.9% Uptime",
    description:
      "A resilient, highly available platform engineered for round-the-clock reliability.",
    icon: Clock,
  },
  {
    title: "24x7 Support",
    description:
      "Dedicated support team ready to assist you and your customers any time, any day.",
    icon: Headphones,
  },
  {
    title: "Best-in-Class Payouts",
    description:
      "Competitive commissions and transparent pricing built to grow your business.",
    icon: BadgeIndianRupee,
  },
  {
    title: "All-in-One Platform",
    description:
      "Recharge, bill payments, BBPS, and collections unified in a single dashboard.",
    icon: Layers,
  },
];

export interface Step {
  title: string;
  description: string;
  icon: LucideIcon;
}

export const howItWorks: Step[] = [
  {
    title: "Create Your Account",
    description:
      "Sign up in minutes with basic details and get instant access to the dashboard.",
    icon: UserPlus,
  },
  {
    title: "Complete Verification",
    description:
      "Submit KYC and business documents for a quick and secure activation.",
    icon: FileCheck2,
  },
  {
    title: "Start Transacting",
    description:
      "Offer recharge, bill payments, and BBPS services and start earning right away.",
    icon: Rocket,
  },
];

export interface Stat {
  value: number;
  suffix: string;
  label: string;
  prefix?: string;
}

export const stats: Stat[] = [
  { value: 1000, suffix: "+", label: "BBPS Billers" },
  { value: 18, suffix: "+", label: "Bill Categories" },
  { value: 99.9, suffix: "%", label: "Platform Uptime" },
  { value: 28, suffix: "", label: "States · Pan-India Reach" },
];

export interface Testimonial {
  name: string;
  role: string;
  quote: string;
  rating: number;
}

export const testimonials: Testimonial[] = [
  {
    name: "Rajesh Kumar",
    role: "Retail Partner, Pune",
    quote:
      "UTILIPAY HUB transformed my shop. I now offer recharge and bill payments to hundreds of customers with instant settlements.",
    rating: 5,
  },
  {
    name: "Priya Sharma",
    role: "Distributor, Jaipur",
    quote:
      "The dashboard is clean and the commissions are the best I've seen. Support is quick and genuinely helpful.",
    rating: 5,
  },
  {
    name: "Mohammed Irfan",
    role: "Merchant, Hyderabad",
    quote:
      "BBPS integration is seamless. My customers trust the instant receipts and I trust the reliability.",
    rating: 5,
  },
  {
    name: "Anita Desai",
    role: "Business Owner, Surat",
    quote:
      "From FASTag to electricity bills, everything works flawlessly. It has genuinely grown my daily footfall.",
    rating: 5,
  },
];

export interface Faq {
  question: string;
  answer: string;
}

export const faqs: Faq[] = [
  {
    question: "What is UTILIPAY HUB?",
    answer:
      "UTILIPAY HUB (OPC) PRIVATE LIMITED is a fintech platform offering recharge, utility bill payments, FASTag, BBPS-enabled services, and digital collection solutions for retailers, distributors, and businesses.",
  },
  {
    question: "Is the platform BBPS-enabled?",
    answer:
      "Yes. Our bill payment services are integrated with the Bharat Bill Payment System (BBPS), ensuring standardized, secure, and reliable transactions with instant digital receipts.",
  },
  {
    question: "How do I become a partner?",
    answer:
      "Simply visit our Partner page, fill in the registration form, complete KYC verification, and get activated within a short time to start offering services.",
  },
  {
    question: "How secure are transactions?",
    answer:
      "We use bank-grade encryption, secure payment gateways, and PCI-DSS aligned infrastructure to protect every transaction end-to-end.",
  },
  {
    question: "What are the settlement timelines?",
    answer:
      "Most transactions are settled instantly. Settlement timelines may vary slightly based on the service type and partner bank.",
  },
  {
    question: "Do you provide support?",
    answer:
      "Yes, we offer 24x7 dedicated support to help you and your customers with any queries or issues.",
  },
];

export interface PartnerBenefit {
  title: string;
  description: string;
  icon: LucideIcon;
}

export const partnerBenefits: PartnerBenefit[] = [
  {
    title: "Attractive Commissions",
    description:
      "Earn competitive margins on every recharge, bill payment, and BBPS transaction.",
    icon: BadgeIndianRupee,
  },
  {
    title: "Instant Activation",
    description:
      "Get onboarded quickly with a simple KYC process and start earning the same day.",
    icon: Rocket,
  },
  {
    title: "Powerful Dashboard",
    description:
      "Track transactions, commissions, and reports in real time from one place.",
    icon: Layers,
  },
  {
    title: "Dedicated Support",
    description:
      "A relationship manager and 24x7 team to keep your business running smoothly.",
    icon: Headphones,
  },
];
