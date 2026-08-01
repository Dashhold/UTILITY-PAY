import Link from "next/link";
import type { ElementType } from "react";
import {
  Mail,
  Phone,
  MapPin,
  Instagram,
  Facebook,
  Linkedin,
  Youtube,
} from "lucide-react";
import { siteConfig, navLinks, legalLinks } from "@/lib/site";
import { services } from "@/data/services";
import { Logo } from "./Logo";

function XIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

function WhatsAppIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884" />
    </svg>
  );
}

const socials: {
  label: string;
  href: string;
  Icon: ElementType;
}[] = [
  { label: "Instagram", href: siteConfig.social.instagram, Icon: Instagram },
  { label: "Facebook", href: siteConfig.social.facebook, Icon: Facebook },
  { label: "X", href: siteConfig.social.twitter, Icon: XIcon },
  { label: "LinkedIn", href: siteConfig.social.linkedin, Icon: Linkedin },
  { label: "YouTube", href: siteConfig.social.youtube, Icon: Youtube },
];

export function Footer() {
  const year = new Date().getFullYear();
  const whatsappHref = `https://wa.me/${siteConfig.whatsapp}`;

  return (
    <footer className="relative mt-24 border-t border-gray-200 bg-gray-50/60 dark:border-white/10 dark:bg-white/[0.02]">
      <div className="container-app grid grid-cols-1 gap-10 py-16 md:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-5">
          <Logo />
          <p className="max-w-xs text-sm leading-relaxed text-brand-grey dark:text-gray-400">
            {siteConfig.legalName} — your trusted platform for recharge, utility
            bill payments, and BBPS-enabled fintech services.
          </p>
          <div className="flex flex-col gap-2.5 text-sm">
            <a
              href={`tel:${siteConfig.phoneRaw}`}
              className="flex items-center gap-2.5 text-brand-grey-dark transition-colors hover:text-brand-yellow-dark dark:text-gray-300 dark:hover:text-brand-yellow"
            >
              <Phone size={16} className="shrink-0 text-brand-yellow-dark" />
              <span>Customer Care: {siteConfig.phone}</span>
            </a>
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 text-brand-grey-dark transition-colors hover:text-brand-yellow-dark dark:text-gray-300 dark:hover:text-brand-yellow"
            >
              <span className="shrink-0 text-brand-yellow-dark">
                <WhatsAppIcon />
              </span>
              <span>WhatsApp: {siteConfig.whatsappDisplay}</span>
            </a>
            <a
              href={`mailto:${siteConfig.email}`}
              className="flex items-center gap-2.5 break-all text-brand-grey-dark transition-colors hover:text-brand-yellow-dark dark:text-gray-300 dark:hover:text-brand-yellow"
            >
              <Mail size={16} className="shrink-0 text-brand-yellow-dark" />
              {siteConfig.email}
            </a>
            <span className="flex items-start gap-2.5 text-brand-grey-dark dark:text-gray-300">
              <MapPin size={16} className="mt-0.5 shrink-0 text-brand-yellow-dark" />
              {siteConfig.address}
            </span>
          </div>

          {/* Social links */}
          <div className="flex items-center gap-2.5 pt-1">
            {socials.map(({ label, href, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-brand-grey-dark transition-all hover:-translate-y-0.5 hover:border-brand-yellow hover:text-brand-yellow-dark dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:text-brand-yellow"
              >
                <Icon size={16} />
              </a>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-brand-ink dark:text-white">
            Company
          </h3>
          <ul className="flex flex-col gap-2.5 text-sm">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-brand-grey transition-colors hover:text-brand-yellow-dark dark:text-gray-400 dark:hover:text-brand-yellow"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-brand-ink dark:text-white">
            Services
          </h3>
          <ul className="flex flex-col gap-2.5 text-sm">
            {services.slice(0, 7).map((service) => (
              <li key={service.slug}>
                <Link
                  href="/services"
                  className="text-brand-grey transition-colors hover:text-brand-yellow-dark dark:text-gray-400 dark:hover:text-brand-yellow"
                >
                  {service.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-brand-ink dark:text-white">
            Legal
          </h3>
          <ul className="flex flex-col gap-2.5 text-sm">
            {legalLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-brand-grey transition-colors hover:text-brand-yellow-dark dark:text-gray-400 dark:hover:text-brand-yellow"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-6 rounded-xl border border-brand-yellow/30 bg-brand-yellow/10 p-4">
            <p className="text-xs font-semibold text-brand-yellow-dark dark:text-brand-yellow">
              BBPS Enabled
            </p>
            <p className="mt-1 text-xs text-brand-grey dark:text-gray-400">
              Secure bill payments powered by Bharat Bill Payment System.
            </p>
          </div>
        </div>
      </div>

      {/* Registration details */}
      <div className="border-t border-gray-200 dark:border-white/10">
        <div className="container-app flex flex-col gap-2 py-5 text-xs text-brand-grey dark:text-gray-400 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8">
          <span>
            <span className="font-semibold text-brand-grey-dark dark:text-gray-300">
              CIN:
            </span>{" "}
            {siteConfig.cin}
          </span>
          <span>
            <span className="font-semibold text-brand-grey-dark dark:text-gray-300">
              GST:
            </span>{" "}
            {siteConfig.gst}
          </span>
        </div>
      </div>

      <div className="border-t border-gray-200 dark:border-white/10">
        <div className="container-app flex flex-col items-center justify-between gap-3 py-6 text-center text-xs text-brand-grey dark:text-gray-400 sm:flex-row sm:text-left">
          <p>
            © {year} {siteConfig.legalName}. All rights reserved.
          </p>
          <p>Made in India 🇮🇳 with a commitment to secure digital payments.</p>
        </div>
      </div>
    </footer>
  );
}
