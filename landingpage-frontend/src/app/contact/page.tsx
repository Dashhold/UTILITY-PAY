import type { Metadata } from "next";
import { Phone, Mail, MapPin, MessageCircle, Clock } from "lucide-react";
import { siteConfig } from "@/lib/site";
import { PageHeader } from "@/components/layout/PageHeader";
import { Reveal } from "@/components/ui/Reveal";
import { ContactForm } from "@/components/forms/ContactForm";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Get in touch with UTILIPAY HUB (OPC) PRIVATE LIMITED. Call +91 9653127760 or email UTILIPAYHUP@GMAIL.COM for support, partnerships, and enquiries.",
  alternates: { canonical: "/contact" },
};

const contactMethods = [
  {
    icon: Phone,
    label: "Call Us",
    value: siteConfig.phone,
    href: `tel:${siteConfig.phoneRaw}`,
  },
  {
    icon: Mail,
    label: "Email Us",
    value: siteConfig.email,
    href: `mailto:${siteConfig.email}`,
  },
  {
    icon: MessageCircle,
    label: "WhatsApp",
    value: "Chat with us",
    href: `https://wa.me/${siteConfig.whatsapp}`,
  },
];

export default function ContactPage() {
  return (
    <>
      <PageHeader
        eyebrow="Contact Us"
        title="We'd Love to Hear From You"
        description="Have a question about our services or want to partner with us? Reach out and our team will respond quickly."
      />

      <section className="container-app py-16 md:py-24">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-5 lg:gap-12">
          {/* Info */}
          <div className="flex flex-col gap-5 lg:col-span-2">
            {contactMethods.map((method, i) => {
              const Icon = method.icon;
              return (
                <Reveal key={method.label} delay={i * 0.1}>
                  <a
                    href={method.href}
                    target={method.icon === MessageCircle ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    className="card-hover flex items-center gap-4"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-yellow/15 text-brand-yellow-dark dark:text-brand-yellow">
                      <Icon size={22} />
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-brand-grey dark:text-gray-400">
                        {method.label}
                      </p>
                      <p className="mt-0.5 break-all font-semibold text-brand-ink dark:text-white">
                        {method.value}
                      </p>
                    </div>
                  </a>
                </Reveal>
              );
            })}

            <Reveal delay={0.3} className="card flex flex-col gap-3">
              <div className="flex items-center gap-2 text-brand-yellow-dark dark:text-brand-yellow">
                <Clock size={18} />
                <span className="font-semibold">Support Hours</span>
              </div>
              <p className="text-sm text-brand-grey dark:text-gray-400">
                Our support team is available 24x7 to assist you and your
                customers.
              </p>
              <div className="flex items-center gap-2 pt-2 text-sm text-brand-grey-dark dark:text-gray-300">
                <MapPin size={16} className="text-brand-yellow-dark" />
                {siteConfig.address}
              </div>
            </Reveal>
          </div>

          {/* Form */}
          <Reveal delay={0.15} className="card p-6 sm:p-8 lg:col-span-3">
            <h2 className="text-2xl font-bold text-brand-ink dark:text-white">
              Send Us a Message
            </h2>
            <p className="mt-1 text-sm text-brand-grey dark:text-gray-400">
              Fill out the form and we&apos;ll get back to you shortly.
            </p>
            <div className="mt-6">
              <ContactForm />
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
