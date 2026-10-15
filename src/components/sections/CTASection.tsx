import { ArrowRight } from 'lucide-react';
import { GradientButton } from '@/components/ui/GradientButton';

export function CTASection({ title, description, buttonLabel, buttonHref }: { title: string; description: string; buttonLabel: string; buttonHref: string }) {
  return (
    <section className="bg-white">
      <div className="site-container py-12 sm:py-16">
        <div className="premium-panel relative isolate overflow-hidden !border-orange-200 p-7 sm:p-12 lg:p-16">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(255,102,0,0.08),transparent_65%)]" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-44 -z-10 h-96 w-96 rounded-full border border-orange-100" />
          <div className="flex min-w-0 flex-col justify-between gap-8 lg:flex-row lg:items-center lg:gap-12">
            <div className="min-w-0 max-w-2xl">
              <p className="editorial-eyebrow">Let’s make it happen</p>
              <h2 className="mt-5 text-[clamp(2rem,3.4vw,3.75rem)] font-semibold leading-[1.1] tracking-[-0.055em] text-black">{title}</h2>
              <p className="mt-5 max-w-lg text-sm leading-7 text-black/75 sm:text-base">{description}</p>
            </div>
            <GradientButton href={buttonHref} className="w-full shrink-0 sm:w-auto sm:self-start lg:self-center">{buttonLabel} <ArrowRight className="ml-3 h-4 w-4 shrink-0" aria-hidden="true" /></GradientButton>
          </div>
        </div>
      </div>
    </section>
  );
}
