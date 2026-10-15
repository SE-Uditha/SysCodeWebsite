import Link from 'next/link';
import { ArrowUpRight, Check, Sparkles } from 'lucide-react';
import type { PricingTier } from '@/data/pricing';

function formatPrice(value: number) {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 0 }).format(value).replace(/\u00a0/g, ' ');
}

export function PricingCard({ tier }: { tier: PricingTier }) {
  return (
    <article
      className={`premium-panel interactive-card relative flex h-full min-w-0 flex-col p-6 focus-within:border-orange-300 sm:p-8 ${
        tier.popular ? '!border-orange-300 !shadow-[0_18px_60px_-20px_rgba(255,102,0,0.28)]' : ''
      }`}
    >
      {tier.popular ? <span aria-hidden="true" className="absolute inset-x-8 top-0 h-[3px] rounded-b-full bg-gradient-to-r from-white via-brand to-white" /> : null}
      <div className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 break-words text-base font-semibold tracking-[-0.025em] text-black">{tier.name}</p>
          {tier.popular ? <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-white px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[0.09em] text-orange-700"><Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />Most Popular</span> : null}
        </div>
        <div className="mt-8 text-black">
          <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-black/55">Starting From</span>
          <span className="mt-2 block break-words text-[clamp(1.8rem,2.5vw,2.8rem)] font-semibold leading-tight tracking-[-0.055em] tabular-nums">{formatPrice(tier.startPrice)}</span>
        </div>
      </div>

      <p className="break-words text-sm leading-7 text-black/75">{tier.description}</p>
      <p className="mt-3 break-words text-xs leading-6 text-black/60">{tier.audience}</p>

      <ul className="mt-6 space-y-3.5 border-t border-orange-100 pt-6 text-sm leading-6 text-black/80">
        {tier.features.map((feature, index) => (
          <li key={`${index}-${feature}`} className="flex items-start gap-2.5">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-orange-100 bg-white"><Check className="h-3 w-3 text-brand" strokeWidth={2.5} aria-hidden="true" /></span>
            <span className="min-w-0 break-words">{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-8">
        <Link
          href={{ pathname: '/', query: { package: tier.id }, hash: 'contact' }}
          className={`motion-button inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border px-4 py-3 text-center text-sm font-semibold transition ${
            tier.popular ? 'border-brand bg-gradient-to-br from-orange-300 via-brand to-orange-400 text-black shadow-[0_8px_20px_-8px_rgba(255,102,0,0.5)] hover:from-orange-200' : 'border-orange-200 bg-white text-orange-700 hover:border-brand'
          }`}
        >
          {tier.cta}<ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
