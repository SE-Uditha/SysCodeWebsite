import type { Metadata } from 'next';
import { ArrowRight, CheckCircle2, Lightbulb, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { CTASection } from '@/components/sections/CTASection';
import { AnimatedSection } from '@/components/ui/AnimatedSection';
import { SectionHeading } from '@/components/ui/SectionHeading';

export const metadata: Metadata = {
  title: 'About Us',
  description: 'Learn more about SysCode Software Solutions and the values that guide our digital growth work for businesses in Sri Lanka.',
};

const values = [
  { title: 'Quality', description: 'We focus on clean, reliable work that supports long-term business growth.', icon: CheckCircle2 },
  { title: 'Innovation', description: 'We use practical, modern approaches to help businesses stay competitive online.', icon: Lightbulb },
  { title: 'Transparency', description: 'Clear communication, honest guidance, and realistic project expectations matter to us.', icon: ShieldCheck },
  { title: 'Customer Focus', description: 'Every solution is designed around the needs, goals, and challenges of the client.', icon: TrendingUp },
  { title: 'Continuous Improvement', description: 'We refine and improve digital experiences to deliver better results over time.', icon: Sparkles },
];

export default function AboutPage() {
  return (
    <div className="site-container py-16 sm:py-24 lg:py-28">
      <AnimatedSection>
        <SectionHeading as="h1"
          eyebrow="About Us"
          title="A practical partner for your next step."
          description="SysCode Software Solutions helps businesses establish and improve their online presence through modern websites and custom software solutions. We focus on practical, affordable, and user-friendly digital experiences."
        />
      </AnimatedSection>

      <div className="mt-12 grid gap-8 sm:mt-16 lg:grid-cols-2 lg:items-center lg:gap-16">
        <AnimatedSection className="min-w-0">
          <Image
            src="/images/design-workspace-natural.webp"
            alt="Hands sketching a website layout beside a laptop and a cup of coffee"
            width={1200}
            height={900}
            sizes="(min-width: 3000px) 1080px, (min-width: 2200px) 760px, (min-width: 1600px) 640px, (min-width: 1152px) 512px, (min-width: 1024px) calc((100vw - 128px) / 2), (min-width: 640px) calc(100vw - 64px), calc(100vw - 40px)"
            className="aspect-[4/3] w-full rounded-[24px] border border-orange-100 object-cover shadow-[0_20px_65px_-40px_rgba(255,102,0,0.35)]"
          />
        </AnimatedSection>

        <AnimatedSection className="min-w-0">
          <div className="premium-panel max-w-xl space-y-8 break-words bg-gradient-to-br from-white via-white to-orange-50/60 p-6 sm:p-8 lg:p-10">
            <div>
              <p className="editorial-eyebrow mb-4">Our Mission</p>
              <h2 className="max-w-md font-heading text-2xl font-bold leading-tight tracking-tight text-black sm:text-3xl">Good technology, within reach.</h2>
              <p className="mt-4 text-sm leading-7 text-black/70">We make professional web development and software solutions accessible to businesses of different sizes. Clear communication and useful, reliable work guide every project.</p>
            </div>
            <div className="border-t border-orange-100 pt-6">
              <p className="editorial-eyebrow">Our Vision</p>
              <p className="mt-4 text-sm leading-7 text-black/70">To help businesses grow through innovative, reliable, and affordable technology solutions.</p>
            </div>
            <Link href="/#contact" className="detail-link">
              Start your project <ArrowRight className="h-4 w-4 shrink-0 text-brand" />
            </Link>
          </div>
        </AnimatedSection>
      </div>

      <section className="mt-16 border-t border-orange-100 pt-16 sm:mt-24 sm:pt-24">
        <AnimatedSection>
          <SectionHeading eyebrow="Values" title="What drives our work." />
        </AnimatedSection>
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
          {values.map(({ title, description, icon: Icon }) => (
            <AnimatedSection key={title} className="min-w-0">
              <article className="premium-panel h-full p-6">
                <div className="premium-icon mb-7">
                  <Icon className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
                </div>
                <h3 className="font-heading text-lg font-bold tracking-tight text-black">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-black/65">{description}</p>
              </article>
            </AnimatedSection>
          ))}
        </div>
      </section>

      <CTASection
        title="Need a digital partner for your next step?"
        description="We help businesses improve their online presence with affordable, professional, and scalable solutions."
        buttonLabel="Contact SysCode"
        buttonHref="/#contact"
      />
    </div>
  );
}
