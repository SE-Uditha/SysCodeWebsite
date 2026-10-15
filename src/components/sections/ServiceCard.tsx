import Link from 'next/link';
import type { Service } from '@/data/services';
import { ArrowUpRight } from 'lucide-react';

export function ServiceCard({ service, compact = false }: { service: Service; compact?: boolean }) {
  const Icon = service.icon;

  return (
    <article className="premium-panel interactive-card group relative flex h-full min-w-0 flex-col p-6 hover:border-orange-300 focus-within:border-orange-300 sm:p-7">
      <div className="mb-7 flex items-start justify-between gap-4">
        <span className="premium-icon inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl">
          <Icon className="h-[22px] w-[22px]" strokeWidth={1.7} aria-hidden="true" />
        </span>
        <span aria-hidden="true" className="mt-1 h-1.5 w-1.5 rounded-full bg-brand/50" />
      </div>
      <h3 className="break-words text-xl font-semibold leading-snug tracking-[-0.035em] text-black">{service.title}</h3>
      <p className="mt-3 break-words text-sm leading-7 text-black/75">{service.shortDescription}</p>
      {!compact ? <ul className="mt-6 space-y-3 border-t border-orange-100 pt-5 text-sm leading-6 text-black/80">
        {service.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-brand" />
            <span className="min-w-0 break-words">{feature}</span>
          </li>
        ))}
      </ul> : null}
      <Link href={compact ? `/services#${service.id}` : '/#contact'} className="detail-link mt-auto inline-flex min-h-11 w-fit max-w-full items-center gap-2 pt-7 text-xs font-semibold">
        {compact ? 'See more details' : 'Discuss this service'} <ArrowUpRight className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none" aria-hidden="true" />
      </Link>
    </article>
  );
}
