import type { Metadata } from "next";
import { siteConfig } from "@/lib/site";
import { PageHeader } from "@/components/layout/PageHeader";
import { LegalContent, type LegalBlock } from "@/components/legal/LegalSection";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `Privacy Policy for ${siteConfig.legalName}. Learn how we collect, use, and protect your personal information.`,
  alternates: { canonical: "/privacy-policy" },
};

const blocks: LegalBlock[] = [
  {
    heading: "1. Introduction",
    paragraphs: [
      `${siteConfig.legalName} ("we", "us", or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform and services.`,
    ],
  },
  {
    heading: "2. Information We Collect",
    paragraphs: ["We may collect the following types of information:"],
    list: [
      "Personal identification information such as name, mobile number, and email address.",
      "Business details provided during partner or merchant registration.",
      "Transaction data related to recharges and bill payments.",
      "Technical data such as device information, IP address, and usage patterns.",
    ],
  },
  {
    heading: "3. How We Use Your Information",
    paragraphs: ["Your information is used to:"],
    list: [
      "Process transactions and deliver our services.",
      "Verify identity and complete KYC requirements.",
      "Provide customer support and respond to enquiries.",
      "Improve, personalize, and secure our platform.",
      "Comply with legal and regulatory obligations.",
    ],
  },
  {
    heading: "4. Data Security",
    paragraphs: [
      "We implement bank-grade security measures, including encryption and access controls, to protect your data. However, no method of transmission over the internet is fully secure, and we cannot guarantee absolute security.",
    ],
  },
  {
    heading: "5. Sharing of Information",
    paragraphs: [
      "We do not sell your personal information. We may share data with trusted service providers, billers, banking partners, and regulatory authorities strictly as required to deliver services and comply with the law.",
    ],
  },
  {
    heading: "6. Your Rights",
    paragraphs: [
      "You may request access to, correction of, or deletion of your personal data, subject to applicable legal and regulatory requirements. To exercise these rights, contact us using the details below.",
    ],
  },
  {
    heading: "7. Contact Us",
    paragraphs: [
      `For any questions regarding this Privacy Policy, please contact us at ${siteConfig.email} or call ${siteConfig.phone}.`,
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <>
      <PageHeader
        eyebrow="Legal"
        title="Privacy Policy"
        description="Your privacy matters to us. Here's how we handle and protect your information."
      />
      <LegalContent blocks={blocks} updated="July 2, 2026" />
    </>
  );
}
