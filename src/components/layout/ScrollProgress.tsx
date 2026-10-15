'use client';

import { motion, useMotionValue, useScroll, useSpring, useTransform } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useReducedMotionPreference } from '@/hooks/useReducedMotionPreference';

export function ScrollProgress() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotionPreference();
  const { scrollYProgress } = useScroll();
  const scrollRange = useMotionValue(0);
  const progress = useTransform(() => {
    const range = scrollRange.get();
    const current = scrollYProgress.get();
    return range > 0 ? current : 0;
  });
  const smoothProgress = useSpring(progress, { stiffness: 240, damping: 34, mass: 0.3, restDelta: 0.001 });

  useEffect(() => {
    const updateProgress = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight;
      const next = total > 0 ? Math.min(1, Math.max(0, window.scrollY / total)) : 0;
      scrollRange.set(total);
      scrollYProgress.set(next);
      return next;
    };

    const frame = requestAnimationFrame(() => {
      smoothProgress.jump(updateProgress());
    });
    const resizeObserver = new ResizeObserver(updateProgress);
    resizeObserver.observe(document.body);
    window.addEventListener('resize', updateProgress, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateProgress);
    };
  }, [pathname, scrollRange, scrollYProgress, smoothProgress]);

  return (
    <div className="fixed inset-x-0 top-0 z-60 h-[2px] bg-transparent" aria-hidden="true">
      <motion.div className="h-full w-full origin-left bg-white" style={{ scaleX: reduceMotion ? progress : smoothProgress }} />
    </div>
  );
}
