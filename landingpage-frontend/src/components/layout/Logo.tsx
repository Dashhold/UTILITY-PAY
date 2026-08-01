import Image from "next/image";
import Link from "next/link";
import { siteConfig } from "@/lib/site";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`group flex items-center gap-2.5 ${className}`}
      aria-label={`${siteConfig.name} home`}
    >
      <span className="relative h-10 w-10 overflow-hidden rounded-xl ring-1 ring-brand-yellow/40 transition-transform duration-300 group-hover:scale-105">
        <Image
          src={siteConfig.logo}
          alt={`${siteConfig.legalName} logo`}
          fill
          sizes="40px"
          className="object-cover"
          priority
        />
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-base font-extrabold tracking-tight text-brand-ink dark:text-white">
          UTILIPAY <span className="text-brand-yellow-dark dark:text-brand-yellow">HUB</span>
        </span>
      </span>
    </Link>
  );
}
