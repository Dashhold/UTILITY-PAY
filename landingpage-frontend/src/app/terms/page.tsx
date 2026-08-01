import type { Metadata } from "next";
import { siteConfig } from "@/lib/site";
import { PageHeader } from "@/components/layout/PageHeader";
import { LegalContent, type LegalBlock } from "@/components/legal/LegalSection";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: `Terms & Conditions governing the use of ${siteConfig.legalName} platform and services.`,
  alternates: { canonical: "/terms" },
};

const blocks: LegalBlock[] = [
  {
    heading: "1. Acceptance of Terms",
    paragraphs: [
      `By accessing or using the ${siteConfig.legalName} platform, you agree to be bound by these Terms & Conditions. If you do not agree, please do not use our services.`,
    ],
  },
  {
    heading: "2. Eligibility",
    paragraphs: [
      "You must be at least 18 years of age and legally capable of entering into a binding contract to use our services. Partners and merchants must provide accurate registration and KYC information.",
    ],
  },
  {
    heading: "3. Use of Services",
    paragraphs: ["You agree to use our services responsibly and to:"],
    list: [
      "Provide accurate and current information.",
      "Not misuse the platform for fraudulent or unlawful activity.",
      "Maintain the confidentiality of your account credentials.",
      "Comply with all applicable laws and regulations.",
    ],
  },
  {
    heading: "4. Transactions",
    paragraphs: [
      "All transactions are subject to availability, processing timelines, and confirmation from respective billers and operators. We are not liable for delays or failures caused by third-party service providers or banking networks.",
    ],
  },
  {
    heading: "5. Fees & Charges",
    paragraphs: [
      "Applicable fees, commissions, and charges will be communicated transparently. We reserve the right to revise pricing with prior notice.",
    ],
  },
  {
    heading: "6. Limitation of Liability",
    paragraphs: [
      "To the maximum extent permitted by law, we shall not be liable for any indirect, incidental, or consequential damages arising from the use of our services.",
    ],
  },
  {
    heading: "7. Intellectual Property",
    paragraphs: [
      "All content, trademarks, and materials on this platform are the property of the company and may not be used without prior written consent.",
    ],
  },
  {
    heading: "8. Changes to Terms",
    paragraphs: [
      "We may update these Terms & Conditions from time to time. Continued use of the platform constitutes acceptance of the revised terms.",
    ],
  },
  {
    heading: "9. Contact",
    paragraphs: [
      `For questions about these Terms, contact us at ${siteConfig.email} or ${siteConfig.phone}.`,
    ],
  },
];

export default function TermsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Legal"
        title="Terms & Conditions"
        description="Please read these terms carefully before using our platform and services."
      />
      <LegalContent blocks={blocks} updated="July 2, 2026" />
    </>
  );
}
