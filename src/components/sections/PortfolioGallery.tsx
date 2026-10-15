'use client';

import { forwardRef, useMemo, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, useIsPresent } from 'framer-motion';
import { CTASection } from '@/components/sections/CTASection';
import { PortfolioCard } from '@/components/sections/PortfolioCard';
import { AnimatedSection } from '@/components/ui/AnimatedSection';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { projectFilters, type Project } from '@/data/projects';
import { useReducedMotionPreference } from '@/hooks/useReducedMotionPreference';

const PortfolioResult = forwardRef<HTMLDivElement, { project: Project; reduceMotion: boolean; featured: boolean }>(function PortfolioResult({ project, reduceMotion, featured }, ref) {
  const isPresent = useIsPresent();

  return (
    <motion.div
      ref={ref}
      layout={reduceMotion ? false : 'position'}
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion
        ? { opacity: 1, transition: { duration: 0 } }
        : { opacity: 0, y: 6, transition: { duration: 0.14, ease: 'easeOut' } }}
      transition={{ duration: reduceMotion ? 0 : 0.24, ease: 'easeOut', layout: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}
      className={`min-w-0 ${featured ? 'col-span-full' : ''}`}
      role="listitem"
      aria-hidden={!isPresent}
      inert={!isPresent || undefined}
      style={{ pointerEvents: isPresent ? undefined : 'none' }}
    >
      <PortfolioCard project={project} featured={featured} />
    </motion.div>
  );
});

export function PortfolioGallery({ projects }: { projects: Project[] }) {
  const [activeFilter, setActiveFilter] = useState<(typeof projectFilters)[number]>('All');
  const reduceMotion = useReducedMotionPreference();

  const filteredProjects = useMemo(() => {
    if (activeFilter === 'All') return projects;
    return projects.filter((project) => project.category === activeFilter);
  }, [activeFilter, projects]);

  return (
    <div className="site-container py-14 sm:py-20 lg:py-24">
      <AnimatedSection>
        <SectionHeading as="h1"
          eyebrow="Portfolio"
          title="A few ideas for your next big thing."
          description="A curated set of concept projects showing the types of polished digital experiences we can build for businesses in Sri Lanka."
        />
      </AnimatedSection>

      <LayoutGroup id="portfolio-filters">
        <div className="mt-10 flex w-fit max-w-full flex-wrap gap-2 rounded-2xl border border-orange-100 bg-white p-2 shadow-[0_12px_40px_-30px_#ff660040]">
          {projectFilters.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setActiveFilter(filter)}
              aria-pressed={activeFilter === filter}
              className={`relative isolate min-h-11 min-w-11 max-w-full break-words rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-500 ${
                activeFilter === filter ? 'border-orange-200' : 'border-transparent hover:border-orange-200'
              }`}
            >
              {activeFilter === filter ? (
                <motion.span
                  layoutId="active-filter"
                  initial={false}
                  transition={{ duration: reduceMotion ? 0 : 0.26, ease: [0.22, 1, 0.36, 1] }}
                  className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-orange-200 via-orange-100 to-white"
                  aria-hidden="true"
                />
              ) : null}
              <span className="relative">{filter}</span>
            </button>
          ))}
        </div>
      </LayoutGroup>

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        Showing {filteredProjects.length} {filteredProjects.length === 1 ? 'project' : 'projects'}{activeFilter === 'All' ? '.' : ` in ${activeFilter}.`}
      </p>

      <div role="list" aria-label="Portfolio projects" className="portfolio-grid relative mt-10 grid min-w-0 gap-6 sm:mt-12 md:grid-cols-2 xl:grid-cols-3 2xl:gap-8 min-[2200px]:grid-cols-4">
        <AnimatePresence initial={false} mode={reduceMotion ? 'sync' : 'popLayout'}>
          {filteredProjects.map((project) => (
            <PortfolioResult key={project.id} project={project} reduceMotion={reduceMotion} featured={filteredProjects.length === 1} />
          ))}
        </AnimatePresence>
      </div>

      {filteredProjects.length === 0 ? <p className="mt-8 text-sm text-black" role="status">No projects in this category yet. Explore another category or tell us about your idea.</p> : null}

      <CTASection
        title="Need a project like this for your business?"
        description="We can create a tailored website or digital product that reflects your brand and helps your business attract and convert more customers."
        buttonLabel="Book a Consultation"
        buttonHref="/#contact"
      />
    </div>
  );
}
