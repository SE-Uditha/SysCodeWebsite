'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { navItems } from '@/config/company';

export function useActiveSection(enabled: boolean, headerRowRef: RefObject<HTMLElement | null>) {
  const [activeSection, setActiveSection] = useState(navItems[0]?.sectionId ?? 'home');
  const activeSectionRef = useRef(activeSection);

  useEffect(() => {
    if (!enabled) return;

    let frame: number | null = null;

    const update = () => {
      frame = null;
      const sections = navItems.flatMap(({ sectionId }) => {
        const element = document.getElementById(sectionId);
        return element ? [{ id: sectionId, element }] : [];
      });
      if (!sections.length) return;

      const headerHeight = (headerRowRef.current?.getBoundingClientRect().height ?? 76) + 1;
      const readingLine = headerHeight + Math.min(window.innerHeight * 0.18, 180);
      const atBottom = window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 3;
      let next = sections[0].id;

      if (atBottom) {
        next = sections[sections.length - 1].id;
      } else {
        for (const section of sections) {
          if (section.element.getBoundingClientRect().top <= readingLine) next = section.id;
        }
      }

      if (next !== activeSectionRef.current) {
        activeSectionRef.current = next;
        setActiveSection(next);
      }
    };

    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(update);
    };

    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(document.body);
    if (headerRowRef.current) resizeObserver.observe(headerRowRef.current);

    // Streaming content can introduce a section without changing the page height.
    const contentObserver = new MutationObserver(schedule);
    const main = document.querySelector('main');
    if (main) contentObserver.observe(main, { childList: true, subtree: true });

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('hashchange', schedule);
    window.addEventListener('popstate', schedule);
    schedule();

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      contentObserver.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('hashchange', schedule);
      window.removeEventListener('popstate', schedule);
    };
  }, [enabled, headerRowRef]);

  return enabled ? activeSection : null;
}
