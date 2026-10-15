'use client';

import { ChevronUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useReducedMotionPreference } from '@/hooks/useReducedMotionPreference';

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);
  const reduceMotion = useReducedMotionPreference();

  useEffect(() => {
    const toggleVisibility = () => {
      const next = window.scrollY > 300;
      if (next !== visibleRef.current) {
        visibleRef.current = next;
        setVisible(next);
      }
    };
    toggleVisibility();
    window.addEventListener('scroll', toggleVisibility, { passive: true });
    return () => window.removeEventListener('scroll', toggleVisibility);
  }, []);

  return (
    <button
      type="button"
      aria-label="Scroll back to top"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: reduceMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })}
      className={`motion-button fixed right-3 bottom-[calc(5rem_+_env(safe-area-inset-bottom))] z-40 inline-flex h-11 w-11 items-center justify-center rounded-md border border-orange-200 bg-white text-orange-700 transition hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 motion-reduce:translate-y-0 sm:right-5 ${
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
      }`}
    >
      <ChevronUp className="h-5 w-5" />
    </button>
  );
}
