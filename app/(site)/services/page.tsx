import type { Metadata } from 'next';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { CTASection } from '@/components/sections/CTASection';
import { AnimatedSection } from '@/components/ui/AnimatedSection';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { services } from '@/data/services';

export const metadata: Metadata = {
  title: 'Services',
  description: 'Explore website development, e-commerce, custom software, POS systems, redesign, and website maintenance services from SysCode.',
};

export default function ServicesPage() {
  return (
    <div className="site-container py-16 sm:py-24 lg:py-28">
      <AnimatedSection>
        <SectionHeading as="h1"
          eyebrow="Services"
          title="Everything your business needs to grow online."
          description="Whether you need a professional website, a custom business system, or ongoing support, we build solutions that fit your goals."
        />
      </AnimatedSection>

      <div className="mt-12 space-y-7 sm:mt-16 sm:space-y-10">
        {services.map((service, index) => {
          const Icon = service.icon;
          const isReversed = index % 2 === 1;

          return (
            <AnimatedSection key={service.id} className="min-w-0">
              <div id={service.id} className={`premium-panel grid gap-8 p-5 sm:p-8 lg:grid-cols-2 lg:items-center lg:gap-16 lg:p-10 ${isReversed ? 'lg:[&>*:first-child]:order-2' : ''}`}>
                <div className="min-w-0">
                  <div className="premium-icon mb-6">
                    <Icon className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
                  </div>
                  <h2 className="break-words font-heading text-2xl font-bold leading-tight tracking-tight text-black sm:text-3xl">{service.title}</h2>
                  <p className="mt-4 max-w-xl text-sm leading-7 text-black/70">{service.description}</p>

                  <div className="mt-6 space-y-3">
                    {service.features.map((feature) => (
                      <div key={feature} className="flex items-start gap-3 text-sm leading-6 text-black">
                        <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-brand" />
                        <span className="min-w-0 break-words">{feature}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 border-t border-orange-100 pt-4">
                    {service.technologies.map((tech) => (
                      <span key={tech} className="rounded-md border border-orange-100 bg-white px-2.5 py-1.5 text-[11px] font-medium text-black/65">
                        {tech}
                      </span>
                    ))}
                  </div>

                  <Link href="/#contact" className="detail-link mt-5">
                    Discuss this service <ArrowRight className="h-4 w-4 shrink-0 text-brand" />
                  </Link>
                </div>

                <div aria-hidden="true" className="min-w-0 rounded-[20px] border border-orange-100 bg-gradient-to-br from-white to-orange-50/80 p-3 sm:p-8">
                  <div className="min-w-0 overflow-hidden rounded-xl border border-orange-100 bg-white shadow-[0_15px_45px_-24px_rgba(255,102,0,0.3)]">
                    <div className="flex items-center gap-1.5 border-b border-orange-100 px-4 py-3">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                      <span className="h-1.5 w-1.5 rounded-full bg-orange-200" />
                      <span className="h-1.5 w-1.5 rounded-full bg-orange-100" />
                    </div>
                    <div className="p-3 sm:p-7">
                      <div className="mb-5 flex items-center justify-between">
                        <div className="h-2 w-20 rounded-sm bg-orange-200" />
                        <div className="h-5 w-12 rounded-sm bg-orange-100" />
                      </div>
                      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="flex h-32 items-center justify-center rounded-md bg-gradient-to-br from-orange-200 to-orange-50">
                          <Icon className="h-10 w-10 text-brand" strokeWidth={1.5} />
                        </div>
                        <div className="min-w-0 space-y-3 py-3">
                          <div className="h-2 w-4/5 rounded-sm bg-orange-200" />
                          <div className="h-2 w-full rounded-sm bg-orange-100" />
                          <div className="h-2 w-3/4 rounded-sm bg-orange-100" />
                          <div className="!mt-5 h-6 w-20 rounded-sm bg-gradient-to-r from-brand to-orange-100" />
                        </div>
                        <div className="grid min-w-0 grid-cols-3 gap-2 sm:col-span-2 sm:gap-3">
                          {[1, 2, 3].map((item) => (
                            <div key={item} className="h-16 min-w-0 rounded-md border border-orange-100 bg-white p-2 sm:p-3">
                              <div className="h-2 w-6 rounded-sm bg-orange-100" />
                              <div className="mt-3 h-1.5 w-full rounded-sm bg-orange-100" />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </AnimatedSection>
          );
        })}
      </div>

      <CTASection
        title="Need a custom solution for your business?"
        description="Tell us what you need and we will recommend the right approach, timeline, and package for your goals."
        buttonLabel="Request a Quote"
        buttonHref="/#contact"
      />
    </div>
  );
}
