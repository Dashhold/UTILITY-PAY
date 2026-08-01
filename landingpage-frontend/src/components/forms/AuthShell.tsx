import Link from "next/link";
import { ShieldCheck, Zap, Layers, Check } from "lucide-react";
import { siteConfig } from "@/lib/site";
import { Logo } from "@/components/layout/Logo";
import { Reveal } from "@/components/ui/Reveal";

const perks = [
  { icon: ShieldCheck, text: "Bank-grade security on every transaction" },
  { icon: Zap, text: "Instant settlements and real-time confirmations" },
  { icon: Layers, text: "1,000+ BBPS billers across 18+ categories" },
];

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="container-app py-14 md:py-20">
      <div className="mx-auto grid max-w-5xl grid-cols-1 overflow-hidden rounded-3xl border border-gray-100 shadow-soft-lg dark:border-white/10 lg:grid-cols-2">
        {/* Brand panel */}
        <div className="relative hidden flex-col justify-between bg-brand-ink p-10 text-white lg:flex">
          <div className="pointer-events-none absolute inset-0 bg-grid-dark bg-[size:34px_34px] opacity-30" />
          <div className="pointer-events-none absolute -left-10 top-10 h-56 w-56 rounded-full bg-brand-yellow/25 blur-[90px]" />
          <div className="relative">
            <Logo />
            <h2 className="mt-10 text-3xl font-extrabold leading-tight">
              Your gateway to{" "}
              <span className="text-brand-yellow">digital payments</span>
            </h2>
            <p className="mt-3 max-w-sm text-sm text-gray-300">
              Join thousands of partners powering recharge, bill payments, and
              BBPS services with {siteConfig.name}.
            </p>
          </div>
          <ul className="relative mt-10 flex flex-col gap-4">
            {perks.map((perk) => {
              const Icon = perk.icon;
              return (
                <li key={perk.text} className="flex items-center gap-3 text-sm">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-yellow/15 text-brand-yellow">
                    <Icon size={18} />
                  </span>
                  {perk.text}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Form panel */}
        <div className="bg-white p-8 dark:bg-brand-ink/60 sm:p-10">
          <Reveal>
            <div className="mb-8 lg:hidden">
              <Logo />
            </div>
            <h1 className="text-2xl font-bold text-brand-ink dark:text-white sm:text-3xl">
              {title}
            </h1>
            <p className="mt-1.5 text-sm text-brand-grey dark:text-gray-400">
              {subtitle}
            </p>
            <div className="mt-8">{children}</div>
          </Reveal>
        </div>
      </div>
      <p className="mt-6 text-center text-xs text-brand-grey dark:text-gray-500">
        <Link href="/" className="inline-flex items-center gap-1 hover:text-brand-yellow-dark dark:hover:text-brand-yellow">
          <Check size={12} /> Back to {siteConfig.name} home
        </Link>
      </p>
    </section>
  );
}
