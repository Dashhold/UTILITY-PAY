import { Reveal } from "./Reveal";

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
}: SectionHeadingProps) {
  const isCenter = align === "center";
  return (
    <Reveal
      className={`flex flex-col gap-4 ${
        isCenter ? "mx-auto max-w-2xl text-center" : "max-w-2xl text-left"
      }`}
    >
      {eyebrow && (
        <span className={`chip ${isCenter ? "mx-auto" : ""}`}>{eyebrow}</span>
      )}
      <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
        <span className="heading-gradient">{title}</span>
      </h2>
      {description && (
        <p className="text-base leading-relaxed text-brand-grey dark:text-gray-400">
          {description}
        </p>
      )}
    </Reveal>
  );
}
