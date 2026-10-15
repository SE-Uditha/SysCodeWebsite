'use client';

import Image from 'next/image';
import { ExternalLink, Monitor } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Project } from '@/data/projects';
import { isSafeProjectMediaUrl } from '@/lib/project-media';

type PreviewProject = Pick<Project, 'name' | 'demoUrl' | 'previewImageUrl' | 'accent' | 'gradient'>;

function ConceptPreview({ project }: { project: PreviewProject }) {
  return <div className={`aspect-[16/10] w-full rounded-t-lg ${project.gradient} p-4 sm:p-5`}>
    <div className="flex h-full min-w-0 flex-col rounded-md border border-orange-100 bg-white p-3">
      <div className="mb-3 flex min-w-0 items-center justify-between gap-3 border-b border-orange-100 pb-2">
        <div className="flex shrink-0 items-center gap-1" aria-hidden="true">
          <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
          <span className="h-1.5 w-1.5 rounded-full bg-orange-200" />
          <span className="h-1.5 w-1.5 rounded-full bg-orange-100" />
        </div>
        <span className="min-w-0 break-words text-right text-[8px] uppercase tracking-[0.16em] text-orange-700">Concept preview</span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2" aria-hidden="true">
        <div className={`rounded-sm bg-gradient-to-br ${project.accent} opacity-20`} />
        <div className="rounded-sm bg-orange-50" />
        <div className="col-span-2 rounded-sm bg-orange-50" />
      </div>
    </div>
  </div>;
}

function WebsitePreview({ name, demoUrl, imageUrl }: { name: string; demoUrl: string; imageUrl: string }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [nearViewport, setNearViewport] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(imageUrl) && !imageFailed;

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const resize = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    // A demo may point back to this site. Do not recursively embed its cards.
    const visibility = new IntersectionObserver(([entry]) => setNearViewport(entry.isIntersecting && window.self === window.top), { rootMargin: '300px' });
    resize.observe(element);
    visibility.observe(element);
    return () => { resize.disconnect(); visibility.disconnect(); };
  }, []);

  const address = demoUrl ? new URL(demoUrl, 'https://preview.invalid') : null;
  const addressLabel = address?.hostname === 'preview.invalid' ? address.pathname : address?.hostname;

  return <div data-project-preview={showImage ? 'image' : demoUrl ? 'website' : 'unavailable'} className="relative min-w-0 overflow-hidden rounded-t-lg border-b border-orange-100 bg-white focus-within:ring-2 focus-within:ring-inset focus-within:ring-orange-500">
    <div className="flex h-9 min-w-0 items-center gap-3 border-b border-orange-100 bg-white px-3">
      <div className="flex shrink-0 gap-1" aria-hidden="true">
        <span className="h-1.5 w-1.5 rounded-full bg-orange-400" /><span className="h-1.5 w-1.5 rounded-full bg-orange-200" /><span className="h-1.5 w-1.5 rounded-full bg-orange-100" />
      </div>
      <span className="min-w-0 flex-1 truncate text-center text-[10px] font-medium text-black">{addressLabel || 'Project preview'}</span>
      <Monitor className="h-3 w-3 shrink-0 text-orange-700" aria-hidden="true" />
    </div>
    <div ref={viewport} className="relative aspect-[16/10] overflow-hidden bg-white">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-5 text-center">
        <Monitor className="h-7 w-7 text-orange-500" aria-hidden="true" />
        <p className="text-sm font-bold text-black">{name}</p>
        <p className="text-xs text-black">{demoUrl ? 'Open the live demo to explore this website.' : 'Preview image is unavailable.'}</p>
      </div>
      {showImage ? <Image src={imageUrl} alt={`Website preview of ${name}`} fill unoptimized className="object-cover object-top" loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} /> : null}
      {!showImage && demoUrl && nearViewport && width > 0 ? <iframe
        title={`Website preview of ${name}`}
        src={demoUrl}
        width={1280}
        height={800}
        loading="lazy"
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        allow="camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; fullscreen 'none'; autoplay 'none'"
        tabIndex={-1}
        aria-hidden="true"
        inert
        className="pointer-events-none absolute left-0 top-0 border-0 bg-white"
        style={{ width: 1280, height: 800, transform: `scale(${width / 1280})`, transformOrigin: 'top left' }}
      /> : null}
    </div>
    {demoUrl ? <a href={demoUrl} target="_blank" rel="noopener noreferrer" className="group absolute inset-0 flex items-end focus-visible:outline-none">
      <span className="sr-only">Open live demo of {name} (opens in a new tab).</span>
      <span aria-hidden="true" className="flex w-full items-center justify-between gap-2 border-t border-orange-100 bg-white/95 px-3 py-2 text-[10px] font-semibold text-orange-800 transition group-hover:bg-orange-50">Explore the live website<ExternalLink className="h-3 w-3 shrink-0" /></span>
    </a> : null}
  </div>;
}

export function ProjectPreview({ project }: { project: PreviewProject }) {
  const demoUrl = project.demoUrl?.trim() ?? '';
  const imageUrl = project.previewImageUrl?.trim() ?? '';
  const safeDemo = demoUrl && isSafeProjectMediaUrl(demoUrl) ? demoUrl : '';
  const safeImage = imageUrl && isSafeProjectMediaUrl(imageUrl) ? imageUrl : '';
  if (!safeDemo && !safeImage) return <ConceptPreview project={project} />;
  // Reset image errors and observers whenever an administrator changes a URL.
  return <WebsitePreview key={`${safeDemo}\n${safeImage}`} name={project.name} demoUrl={safeDemo} imageUrl={safeImage} />;
}
