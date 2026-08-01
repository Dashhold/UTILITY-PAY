import type { Metadata } from "next";
import { siteConfig } from "@/lib/site";
import { PageHeader } from "@/components/layout/PageHeader";
import { LegalContent, type LegalBlock } from "@/components/legal/LegalSection";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: `Refund Policy for ${siteConfig.legalName}. Understand our approach to refunds for failed or disputed transactions.`,
  alternates: { canonical: "/refund-policy" },
};

const blocks: LegalBlock[] = [
  {
    heading: "1. Overview",
    paragraphs: [
      `This Refund Policy explains how ${siteConfig.legalName} handles refunds for transactions processed through our platform, including recharges and utility bill payments.`,
    ],
  },
  {
    heading: "2. Failed Transactions",
    paragraphs: [
      "If an amount is debited but the recharge or bill payment fails, the amount is typically auto-reversed to the source account or wallet within the standard settlement cycle of the respective bank or payment network.",
    ],
  },
  {
    heading: "3. Successful Transactions",
    paragraphs: [
      "Transactions that are completed successfully are generally non-refundable, as the value is delivered instantly to the operator or biller. Please verify all details before confirming a payment.",
    ],
  },
  {
    heading: "4. Refund Timelines",
    paragraphs: ["Refunds for eligible transactions are processed as follows:"],
    list: [
      "Wallet refunds: typically instant to within 24 hours.",
      "Bank/UPI refunds: usually within 5-7 working days, subject to the bank's processing time.",
      "Timelines may vary based on the payment method and partner institutions.",
    ],
  },
  {
    heading: "5. Raising a Refund Request",
    paragraphs: [
      "To raise a refund or dispute, contact our support team with your transaction ID, date, and details. We will investigate and respond promptly.",
    ],
  },
  {
    heading: "6. Non-Refundable Items",
    paragraphs: [
      "Convenience fees, service charges, and successfully delivered services are non-refundable unless required by law or in cases of proven system error.",
    ],
  },
  {
    heading: "7. Contact",
    paragraphs: [
      `For refund-related queries, reach us at ${siteConfig.email} or call ${siteConfig.phone}.`,
    ],
  },
];

export default function RefundPolicyPage() {
  return (
    <>
      <PageHeader
        eyebrow="Legal"
        title="Refund Policy"
        description="Our commitment to fair and transparent handling of refunds and disputes."
      />
      <LegalContent blocks={blocks} updated="July 2, 2026" />
    </>
  );
}
