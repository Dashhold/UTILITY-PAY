import {
  Smartphone,
  Tv,
  Car,
  Zap,
  Droplets,
  Flame,
  Wifi,
  CreditCard,
  PlayCircle,
  ShieldCheck,
  BatteryCharging,
  Landmark,
  Wallet,
  ReceiptText,
  type LucideIcon,
} from "lucide-react";

export interface Service {
  slug: string;
  title: string;
  description: string;
  icon: LucideIcon;
  category: "Recharge" | "Utility" | "Financial" | "Business";
  highlights: string[];
}

export const services: Service[] = [
  {
    slug: "mobile-recharge",
    title: "Mobile Recharge",
    description:
      "Instant prepaid and postpaid mobile recharges across all major telecom operators in India.",
    icon: Smartphone,
    category: "Recharge",
    highlights: ["All operators", "Instant top-up", "Best-value plans"],
  },
  {
    slug: "dth-recharge",
    title: "DTH Recharge",
    description:
      "Recharge any DTH connection in seconds with real-time confirmation and offers.",
    icon: Tv,
    category: "Recharge",
    highlights: ["All DTH brands", "Auto-renew", "Instant activation"],
  },
  {
    slug: "fastag-recharge",
    title: "FASTag Recharge",
    description:
      "Top up your FASTag wallet instantly for hassle-free toll payments nationwide.",
    icon: Car,
    category: "Recharge",
    highlights: ["All banks", "Zero downtime", "Instant credit"],
  },
  {
    slug: "electricity-bill",
    title: "Electricity Bill Payments",
    description:
      "Pay electricity bills for every state board and private provider through BBPS.",
    icon: Zap,
    category: "Utility",
    highlights: ["BBPS enabled", "Auto reminders", "Instant receipt"],
  },
  {
    slug: "water-bill",
    title: "Water Bill Payments",
    description:
      "Clear municipal and private water bills securely with instant confirmation.",
    icon: Droplets,
    category: "Utility",
    highlights: ["Municipal boards", "Secure", "Digital receipts"],
  },
  {
    slug: "gas-bill",
    title: "Gas Bill Payments",
    description:
      "Pay piped and cylinder gas bills for all providers in a single tap.",
    icon: Flame,
    category: "Utility",
    highlights: ["Piped & LPG", "All providers", "Instant confirm"],
  },
  {
    slug: "broadband",
    title: "Broadband Payments",
    description:
      "Pay broadband and landline bills for every ISP with real-time status.",
    icon: Wifi,
    category: "Utility",
    highlights: ["All ISPs", "Zero hassle", "Instant"],
  },
  {
    slug: "credit-card-bill",
    title: "Credit Card Bill Payments",
    description:
      "Settle credit card dues across banks securely and on time, every time.",
    icon: CreditCard,
    category: "Financial",
    highlights: ["All banks", "Secure gateway", "On-time"],
  },
  {
    slug: "ott-subscription",
    title: "OTT Subscription Payments",
    description:
      "Subscribe and renew your favorite OTT platforms without interruptions.",
    icon: PlayCircle,
    category: "Financial",
    highlights: ["All platforms", "Auto renew", "Instant"],
  },
  {
    slug: "insurance",
    title: "Insurance Services",
    description:
      "Pay life, health, and general insurance premiums seamlessly through BBPS.",
    icon: ShieldCheck,
    category: "Financial",
    highlights: ["Life & health", "BBPS", "Timely alerts"],
  },
  {
    slug: "ev-charging",
    title: "EV Charging Payments",
    description:
      "Pay for electric vehicle charging at partnered stations digitally.",
    icon: BatteryCharging,
    category: "Utility",
    highlights: ["Partner stations", "Cashless", "Fast"],
  },
  {
    slug: "municipal-tax",
    title: "Municipal Tax Payments",
    description:
      "Pay property tax, house tax, and municipal dues digitally with receipts.",
    icon: Landmark,
    category: "Utility",
    highlights: ["Property tax", "Govt bodies", "Digital receipt"],
  },
  {
    slug: "digital-collections",
    title: "Digital Collections",
    description:
      "Streamlined collection solutions for businesses, agents, and merchants.",
    icon: Wallet,
    category: "Business",
    highlights: ["For merchants", "Real-time", "Reconciliation"],
  },
  {
    slug: "utility-payments",
    title: "Utility Payment Services",
    description:
      "A unified suite for all recurring utility payments under one dashboard.",
    icon: ReceiptText,
    category: "Business",
    highlights: ["Unified suite", "Single dashboard", "Reports"],
  },
];
