import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Check, Code2, Layers3, MessageSquareText, Sparkles } from 'lucide-react';
import { ContactForm } from '@/components/forms/ContactForm';
import { CTASection } from '@/components/sections/CTASection';
import { FAQAccordion } from '@/components/sections/FAQAccordion';
import { HeroSection } from '@/components/sections/HeroSection';
import { PortfolioCard } from '@/components/sections/PortfolioCard';
import { PricingCard } from '@/components/sections/PricingCard';
import { ProcessTimeline } from '@/components/sections/ProcessTimeline';
import { ServiceCard } from '@/components/sections/ServiceCard';
import { AnimatedSection } from '@/components/ui/AnimatedSection';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { ScrollCollection } from '@/components/ui/ScrollCollection';
import { TechnologyBadge } from '@/components/ui/TechnologyBadge';
import { reasons, services } from '@/data/services';
import { getSiteContent } from '@/lib/site-content';

const technologyBadges = ['Next.js', 'React', 'TypeScript', 'JavaScript', 'Node.js', 'Tailwind CSS', 'MySQL', 'PostgreSQL'];
const principles = [
  { label: 'Business first', text: 'We start with your goals, not a template.', icon: Layers3 },
  { label: 'Made to work', text: 'Clear design, fast pages, and an easy mobile experience.', icon: Code2 },
  { label: 'Here to help', text: 'Support and guidance for your next step.', icon: MessageSquareText },
];

export default async function HomePage() {
  const { packages, projects, faqs } = await getSiteContent();
  const minimumPrice = Math.min(...packages.map((tier) => tier.startPrice));
  const startingPrice = new Intl.NumberFormat('en-LK').format(minimumPrice);
  const featuredProjects = projects.slice(0, 3);
  return (
    <>
      <HeroSection startingPrice={packages.find((tier) => tier.id === 'basic')?.startPrice ?? minimumPrice} />
      <div className="relative border-b border-orange-100 bg-white">
        <div className="site-container grid gap-6 py-9 md:grid-cols-3 md:gap-0 lg:py-11">
          {principles.map(({ label, text, icon: Icon }, index) => (
            <div key={label} className="flex items-start gap-4 md:px-7 md:first:pl-0 md:last:pr-0 md:[&:not(:first-child)]:border-l md:[&:not(:first-child)]:border-orange-100">
              <span className="premium-icon shrink-0"><Icon className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" /></span>
              <div>
                <p className="font-heading text-sm font-bold tracking-tight text-black"><span className="mr-2 text-[10px] font-medium text-orange-700" aria-hidden="true">0{index + 1}</span>{label}</p>
                <p className="mt-2 max-w-xs text-sm leading-6 text-black/65">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <section id="services" tabIndex={-1} className="landing-section bg-white">
        <div className="site-container py-20 sm:py-24 lg:py-28">
          <AnimatedSection>
            <SectionHeading eyebrow="Our services" title="Everything your growing business needs." description="Websites, online stores, and custom software. Thoughtfully designed, carefully built." />
          </AnimatedSection>
          <ScrollCollection
            className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.05fr)_repeat(2,minmax(0,1fr))] xl:grid-cols-[minmax(0,1.05fr)_repeat(3,minmax(0,1fr))]"
            itemClassNames={['sm:col-span-2 lg:col-span-1 lg:row-span-3 xl:row-span-2']}
          >
            <AnimatedSection className="h-full">
              <div className="premium-panel relative flex h-full flex-col items-start overflow-hidden bg-gradient-to-br from-white via-white to-orange-50 p-7 lg:p-8">
                <div aria-hidden="true" className="absolute -right-14 -top-14 h-44 w-44 rounded-full border border-orange-100/90 p-7"><div className="h-full w-full rounded-full border border-orange-100/90 p-7"><div className="h-full w-full rounded-full border border-orange-200/80" /></div></div>
                <span className="premium-icon relative mb-10"><Sparkles className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" /></span>
                <p className="editorial-eyebrow">Your digital partner</p>
                <h3 className="relative mt-5 font-heading text-3xl font-bold leading-[1.15] tracking-[-0.04em] text-black sm:text-4xl">Good ideas.<br />Great <span className="text-brand">execution.</span></h3>
                <p className="mt-5 text-sm leading-7 text-black/65">We connect design and development to create practical solutions for your business. From your first website to the software behind your daily operations.</p>
                <Link href="/services" aria-label="See more details about our services" className="detail-link mt-9 lg:mt-auto lg:pt-10">See more details <ArrowRight className="h-4 w-4" /></Link>
              </div>
            </AnimatedSection>
            {services.map((service, index) => (
              <AnimatedSection key={service.id} delay={Math.min(index * 0.045, 0.18)} className="h-full"><ServiceCard service={service} compact /></AnimatedSection>
            ))}
          </ScrollCollection>
        </div>
      </section>
      <section id="about" tabIndex={-1} className="landing-section site-container py-20 sm:py-24 lg:py-28">
        <ScrollCollection stretch={false} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16 xl:gap-24">
          <AnimatedSection>
            <div className="premium-panel overflow-hidden p-2 sm:p-3">
              <div className="flex items-center justify-between px-3 pb-3 pt-2 sm:px-4 sm:pb-4">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black/55">Ideas into experiences</span>
                <span aria-hidden="true" className="flex gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-brand" /><span className="h-1.5 w-1.5 rounded-full bg-orange-200" /><span className="h-1.5 w-1.5 rounded-full bg-orange-100" /></span>
              </div>
              <Image src="/images/design-workspace-natural.webp" alt="Hands planning a website layout on paper beside a laptop" width={1200} height={900} sizes="(min-width: 3000px) 1080px, (min-width: 2200px) 760px, (min-width: 1600px) 640px, (min-width: 1024px) 50vw, (min-width: 640px) calc(100vw - 64px), calc(100vw - 40px)" className="aspect-[4/3] w-full rounded-[18px] object-cover" />
              <div className="flex items-center gap-3 px-3 py-4 sm:px-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-orange-100 text-brand"><Layers3 className="h-4 w-4" aria-hidden="true" /></span>
                <p className="text-xs font-medium leading-5 text-black/65">Thoughtful design. Practical development.<br /><span className="font-semibold text-black">One connected approach.</span></p>
              </div>
            </div>
          </AnimatedSection>
          <AnimatedSection>
            <SectionHeading eyebrow="About SysCode" title={<>Your vision.<br />Our full <span className="editorial-highlight">attention.</span></>} description="We help Sri Lankan businesses bring their ideas online through modern websites and custom software. Practical solutions, clear communication, and a focus on what your business needs." />
            <p className="mt-7 border-l-2 border-brand pl-5 text-sm font-semibold leading-7 text-black">Great websites do more than look good. They make your business easier to find, understand, and connect with.</p>
            <Link href="/about" aria-label="See more details about SysCode" className="detail-link mt-7">See more details <ArrowRight className="h-4 w-4" /></Link>
          </AnimatedSection>
        </ScrollCollection>
      </section>
      <section className="bg-white">
        <div className="site-container py-20 sm:py-24 lg:py-28">
          <AnimatedSection><SectionHeading eyebrow="How we work" title="A clear process. No surprises." description="From our first conversation to your launch, you know what happens next." /></AnimatedSection>
          <ProcessTimeline />
        </div>
      </section>
      <section className="site-container py-20 sm:py-24 lg:py-28">
        <AnimatedSection><SectionHeading eyebrow="Why SysCode" title="Built around your business." description="A considered approach to the details that make your website work better." /></AnimatedSection>
        <ScrollCollection className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {reasons.map(({ title, description, icon: Icon }, index) => (
            <AnimatedSection key={title} delay={Math.min(index * 0.04, 0.16)} className="h-full">
              <article className="premium-panel h-full p-6 sm:p-7">
                <div className="flex items-center justify-between gap-4"><span className="premium-icon"><Icon className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" /></span><span className="font-heading text-xs font-medium tracking-widest text-orange-700/70" aria-hidden="true">0{index + 1}</span></div>
                <h3 className="mt-7 font-heading text-lg font-bold tracking-tight text-black">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-black/65">{description}</p>
              </article>
            </AnimatedSection>
          ))}
        </ScrollCollection>
      </section>
      <section id="pricing" tabIndex={-1} className="landing-section bg-white">
        <div className="site-container py-20 sm:py-24 lg:py-28">
          <AnimatedSection><SectionHeading eyebrow="Pricing" title="Clear packages. Practical prices." description={`Professional websites from Rs. ${startingPrice}. Choose the starting point that fits your goals.`} /></AnimatedSection>
          <ScrollCollection className="mt-12 grid gap-5 lg:grid-cols-3">
            {packages.map((tier, index) => (<AnimatedSection key={tier.id} delay={index * 0.055} className="h-full"><PricingCard tier={tier} /></AnimatedSection>))}
          </ScrollCollection>
          <Link href="/pricing" aria-label="See more details about our pricing packages" className="detail-link mt-8">See more details <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>
      <section id="portfolio" tabIndex={-1} className="landing-section site-container py-20 sm:py-24 lg:py-28">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <AnimatedSection><SectionHeading eyebrow="Selected concepts" title="A little inspiration for your next project." description="Concept projects showing the kinds of digital experiences we can build for your business." /></AnimatedSection>
          <Link href="/portfolio" aria-label="See more details about our portfolio concepts" className="detail-link shrink-0">See more details <ArrowRight className="h-4 w-4" /></Link>
        </div>
        <ScrollCollection className={`mt-12 grid gap-5 ${featuredProjects.length === 2 ? 'sm:grid-cols-2' : featuredProjects.length > 2 ? 'sm:grid-cols-2 xl:grid-cols-3' : ''}`}>
          {featuredProjects.map((project, index) => (<AnimatedSection key={project.id} delay={index * 0.055} className="h-full"><PortfolioCard project={project} featured={featuredProjects.length === 1} /></AnimatedSection>))}
        </ScrollCollection>
      </section>
      <section id="faq" tabIndex={-1} className="landing-section bg-white">
        <div className="site-container grid gap-10 py-20 sm:py-24 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20 lg:py-28">
          <AnimatedSection>
            <SectionHeading eyebrow="FAQ" title={<>Questions?<br />We’re here to help.</>} />
            <p className="mt-5 text-sm leading-7 text-black/65">Have something else in mind? <Link href="/#contact" className="font-semibold text-orange-800 underline decoration-orange-200 underline-offset-4">Let’s talk.</Link></p>
          </AnimatedSection>
          <FAQAccordion items={faqs} />
        </div>
      </section>
      <div className="site-container py-10 sm:py-12">
        <div className="premium-panel flex flex-col gap-7 bg-gradient-to-r from-white via-white to-orange-50/60 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
          <div className="max-w-xs shrink-0"><p className="editorial-eyebrow">The technology behind it</p><p className="mt-3 font-heading text-lg font-bold tracking-tight text-black">A modern foundation.<br />Room to grow.</p></div>
          <div className="flex max-w-3xl flex-wrap gap-2.5">{technologyBadges.map((badge) => (<TechnologyBadge key={badge} label={badge} />))}</div>
        </div>
      </div>
      <CTASection title="Ready for your next chapter?" description="Tell us what you have in mind. We’ll help you find the right starting point." buttonLabel="Start a conversation" buttonHref="/#contact" />
      <section id="contact" tabIndex={-1} className="landing-section site-container grid items-start gap-10 py-20 sm:py-24 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20 lg:py-28">
        <AnimatedSection>
          <SectionHeading eyebrow="Contact" title={<>Let’s build your<br /><span className="editorial-highlight">next step.</span></>} description="A first website, a fresh start, or a custom solution. Share your idea and we’ll put together a quotation." />
          <ul className="mt-8 space-y-4 border-y border-orange-100 py-6 text-sm text-black/70">
            {['Tell us about your business and goals.', 'We’ll discuss the right approach for your project.', 'Receive a quotation based on what you need.'].map((item) => (<li key={item} className="flex items-start gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" /><span>{item}</span></li>))}
          </ul>
          <Link href="/contact" aria-label="See more details about contacting SysCode" className="detail-link mt-7">See more details <ArrowRight className="h-4 w-4" /></Link>
        </AnimatedSection>
        <ContactForm packages={packages} />
      </section>
    </>
  );
}
