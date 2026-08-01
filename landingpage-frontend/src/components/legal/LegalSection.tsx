import { Reveal } from "@/components/ui/Reveal";

export interface LegalBlock {
  heading: string;
  paragraphs?: string[];
  list?: string[];
}

export function LegalContent({
  blocks,
  updated,
}: {
  blocks: LegalBlock[];
  updated: string;
}) {
  return (
    <section className="container-app py-16 md:py-20">
      <div className="mx-auto max-w-3xl">
        <p className="mb-10 text-sm text-brand-grey dark:text-gray-400">
          Last updated: {updated}
        </p>
        <div className="flex flex-col gap-10">
          {blocks.map((block, i) => (
            <Reveal key={block.heading} delay={i * 0.03}>
              <h2 className="text-xl font-bold text-brand-ink dark:text-white">
                {block.heading}
              </h2>
              {block.paragraphs?.map((p, idx) => (
                <p
                  key={idx}
                  className="mt-3 text-sm leading-relaxed text-brand-grey dark:text-gray-400"
                >
                  {p}
                </p>
              ))}
              {block.list && (
                <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-brand-grey dark:text-gray-400">
                  {block.list.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
