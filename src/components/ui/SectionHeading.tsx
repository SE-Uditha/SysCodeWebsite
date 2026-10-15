import type { ReactNode } from 'react';

type Props = {
  eyebrow?: string;
  title: ReactNode;
  description?: string;
  centered?: boolean;
  as?: 'h1' | 'h2';
};

export function SectionHeading({ eyebrow, title, description, centered = false, as: Heading = 'h2' }: Props) {
  return (
    <div className={`section-heading min-w-0 w-full max-w-2xl min-[2200px]:max-w-3xl ${centered ? 'mx-auto text-center' : ''}`}>
      {eyebrow ? (
        <p className="mb-5 inline-flex max-w-full items-center gap-2.5 rounded-full border border-orange-100 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-orange-800 [overflow-wrap:anywhere] min-[1600px]:text-[11px]">
          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand shadow-[0_0_0_3px_#fff0e5]" />
          {eyebrow}
        </p>
      ) : null}
      <Heading className={`max-w-[23ch] text-balance text-[clamp(1.875rem,1.2rem_+_1.8vw,3.5rem)] font-bold leading-[1.14] tracking-[-0.05em] text-black [overflow-wrap:anywhere] ${centered ? 'mx-auto' : ''}`}>{title}</Heading>
      {description ? <p className={`mt-5 max-w-[55ch] text-sm leading-[1.85] text-black/70 [overflow-wrap:anywhere] min-[1600px]:text-base ${centered ? 'mx-auto' : ''}`}>{description}</p> : null}
    </div>
  );
}
