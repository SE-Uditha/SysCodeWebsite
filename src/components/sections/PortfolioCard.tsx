import Link from 'next/link';
import type { Project } from '@/data/projects';
import { ProjectPreview } from '@/components/sections/ProjectPreview';
import { isSafeProjectMediaUrl } from '@/lib/project-media';
import { ArrowUpRight } from 'lucide-react';

export function PortfolioCard({ project, featured = false }: { project: Project; featured?: boolean }) {
  const demoUrl = project.demoUrl?.trim() ?? '';
  return (
    <article className={`premium-panel interactive-card group h-full min-w-0 p-2.5 focus-within:border-orange-300 ${featured ? 'grid items-center gap-2 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:gap-6 md:p-4' : 'flex flex-col'}`}>
      <div className="min-w-0 overflow-hidden rounded-[18px] border border-orange-100"><ProjectPreview project={project} /></div>
      <div className={`flex min-w-0 flex-1 flex-col px-3.5 pb-4 pt-6 sm:px-5 sm:pb-5 ${featured ? 'md:py-8 lg:px-8' : ''}`}>
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 break-words text-[10px] font-semibold uppercase tracking-[0.15em] text-orange-700">
            {project.category}
          </span>
        </div>
        <h3 className={`mt-3 break-words font-semibold leading-snug tracking-[-0.04em] text-black ${featured ? 'max-w-[22ch] text-2xl lg:text-4xl' : 'text-2xl'}`}>{project.name}</h3>
        <p className="mt-3 break-words text-sm leading-7 text-black/75">{project.overview}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {project.technologies.map((tech, index) => (
            <span key={`${index}-${tech}`} className="min-w-0 break-words rounded-md border border-orange-100 bg-white px-2.5 py-1 text-[10px] font-medium text-black/65">
              {tech}
            </span>
          ))}
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-1 pt-6">
          {demoUrl && isSafeProjectMediaUrl(demoUrl) ? (
            <a href={demoUrl} target="_blank" rel="noopener noreferrer" className="detail-link inline-flex min-h-11 max-w-full items-center gap-2 text-xs font-semibold">
              View live demo<ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="sr-only"> of {project.name} (opens in a new tab)</span>
            </a>
          ) : null}
          <Link href="/#contact" className="detail-link inline-flex min-h-11 max-w-full items-center text-xs font-semibold">
            Discuss this concept
          </Link>
        </div>
      </div>
    </article>
  );
}
