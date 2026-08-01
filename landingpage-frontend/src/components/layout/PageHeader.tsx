import { Reveal } from "@/components/ui/Reveal";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
}

export function PageHeader({ eyebrow, title, description }: PageHeaderProps) {
  return (
    <section className="relative overflow-hidden border-b border-gray-100 dark:border-white/10">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-grid-light bg-[size:44px_44px] opacity-50 dark:bg-grid-dark" />
        <div className="absolute left-1/2 top-0 h-64 w-[480px] -translate-x-1/2 rounded-full bg-brand-yellow/20 blur-[110px]" />
      </div>
      <div className="container-app py-16 text-center md:py-24">
        <Reveal className="mx-auto flex max-w-3xl flex-col items-center gap-4">
          {eyebrow && <span className="chip">{eyebrow}</span>}
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            <span className="heading-gradient">{title}</span>
          </h1>
          {description && (
            <p className="max-w-2xl text-base leading-relaxed text-brand-grey dark:text-gray-400 sm:text-lg">
              {description}
            </p>
          )}
        </Reveal>
      </div>
    </section>
  );
}
