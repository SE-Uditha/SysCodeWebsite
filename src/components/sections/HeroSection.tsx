import Image from 'next/image';
import { ArrowRight, Check, Code2, Layers3, MoveUpRight } from 'lucide-react';
import { GradientButton } from '@/components/ui/GradientButton';
import { ScrollCollection } from '@/components/ui/ScrollCollection';
import type { CSSProperties } from 'react';

function revealDelay(delay: number): CSSProperties {
  return { '--reveal-delay': `${delay}s` } as CSSProperties;
}

export function HeroSection({ startingPrice }: { startingPrice: number }) {
  return (
    <section id="home" tabIndex={-1} className="landing-section relative isolate bg-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <Image
          src="/images/developer-workspace-background.png"
          alt=""
          fill
          preload
          sizes="100vw"
          className="object-cover object-[65%_center] lg:object-center"
        />
        <div className="hero-background-wash absolute inset-0" />
      </div>
      <div className="site-container relative py-8 sm:py-14 lg:py-20">
        <ScrollCollection stretch={false} className="grid items-center gap-8 sm:gap-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] lg:gap-10">
          <div className="min-w-0 rounded-[1.75rem] border border-white bg-white/95 p-6 shadow-[0_24px_80px_-48px_rgba(255,102,0,0.45)] sm:p-9 lg:p-10">
            <div className="hero-reveal inline-flex max-w-full items-center gap-2 rounded-full border border-orange-200 bg-white px-3 py-2" style={revealDelay(0.05)}>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
              <p className="text-[0.625rem] font-bold tracking-[0.16em] text-orange-700 uppercase sm:text-[0.6875rem]">Design · Build · Grow</p>
            </div>
            <h1 className="hero-reveal mt-6 max-w-xl text-[clamp(2.45rem,4.75vw,4.4rem)] font-bold leading-[1.12] tracking-[-0.06em] text-black" style={revealDelay(0.12)}>
              Build the website your business <span className="editorial-highlight inline-block pb-[0.08em]">deserves.</span>
            </h1>
            <p className="hero-reveal mt-5 max-w-md text-sm leading-7 text-black sm:text-base sm:leading-8" style={revealDelay(0.2)}>
              Thoughtful design. Reliable development. We turn your ideas into websites and software that help your business grow.
            </p>
            <div className="hero-reveal" style={revealDelay(0.28)}>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <GradientButton href="/#contact">Start your project <ArrowRight className="h-4 w-4" /></GradientButton>
                <GradientButton href="/#portfolio" variant="secondary">See our work <MoveUpRight className="h-4 w-4" /></GradientButton>
              </div>
              <p className="mt-6 flex items-start gap-2 border-t border-orange-100 pt-5 text-xs leading-6 text-black">
                <Check className="mt-1 h-4 w-4 shrink-0 text-orange-700" aria-hidden="true" />
                Professional websites from Rs. {new Intl.NumberFormat('en-LK').format(startingPrice)}
              </p>
            </div>
          </div>
          <div className="hero-reveal relative min-w-0 sm:pl-5 lg:pl-0" style={revealDelay(0.2)}>
            <div className="premium-panel relative overflow-hidden rounded-[1.5rem] border border-white bg-white p-2.5 shadow-[0_30px_90px_-42px_rgba(255,102,0,0.5)] sm:p-3">
              <div aria-hidden="true" className="flex items-center gap-1.5 px-2 pt-1 pb-3">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                <span className="h-1.5 w-1.5 rounded-full bg-orange-200" />
                <span className="h-1.5 w-1.5 rounded-full bg-orange-100" />
                <span className="ml-auto rounded-full border border-orange-100 px-3 py-1 text-[0.5625rem] font-semibold tracking-[0.1em] text-orange-700 uppercase">Ideas into experiences</span>
              </div>
              <div className="overflow-hidden rounded-[1rem]">
                <Image
                  src="/images/studio-collaboration-natural.webp"
                  alt="Creative professionals collaborating around a laptop in a bright studio"
                  width={1400}
                  height={933}
                  preload
                  sizes="(min-width: 3000px) 1080px, (min-width: 2200px) 760px, (min-width: 1600px) 640px, (min-width: 1024px) 50vw, (min-width: 640px) calc(100vw - 64px), calc(100vw - 40px)"
                  className="hero-image-reveal aspect-[4/3] w-full object-cover"
                  style={revealDelay(0.2)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-2 pt-4 pb-2 text-[0.625rem] font-semibold text-black sm:text-xs">
                <span className="inline-flex items-center gap-2"><Layers3 className="h-4 w-4 text-orange-700" aria-hidden="true" /> Thoughtful design</span>
                <span className="inline-flex items-center gap-2"><Code2 className="h-4 w-4 text-orange-700" aria-hidden="true" /> Reliable development</span>
              </div>
            </div>
            <div className="hero-reveal relative z-10 mt-3 ml-auto w-fit max-w-full rounded-2xl border border-orange-100 bg-white p-4 shadow-[0_14px_40px_-22px_rgba(255,102,0,0.5)] sm:mr-4 sm:px-5" style={revealDelay(0.28)}>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-orange-400 text-white" aria-hidden="true"><MoveUpRight className="h-5 w-5" /></span>
                <div className="min-w-0">
                  <p className="font-heading text-sm font-bold text-black">Good design. Better business.</p>
                  <p className="mt-1 text-[0.6875rem] leading-5 text-black">Built around your next chapter.</p>
                </div>
              </div>
            </div>
          </div>
        </ScrollCollection>
      </div>
    </section>
  );
}
