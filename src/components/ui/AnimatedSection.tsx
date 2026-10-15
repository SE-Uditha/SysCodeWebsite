'use client';

import { motion, useAnimationControls, useInView } from 'framer-motion';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useReducedMotionPreference } from '@/hooks/useReducedMotionPreference';

const visible = { opacity: 1, y: 0 };
const revealEase = [0.22, 1, 0.36, 1] as const;

export function AnimatedSection({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<HTMLDivElement | null>(null);
  const prepared = useRef(false);
  const revealed = useRef(false);
  const controls = useAnimationControls();
  const reduceMotion = useReducedMotionPreference();
  const isInView = useInView(observerRef, { once: true, amount: 0.12, margin: '0px 0px -24px 0px' });
  const boundedDelay = Number.isFinite(delay) ? Math.min(Math.max(delay, 0), 0.18) : 0;

  const setElementRef = useCallback((element: HTMLDivElement | null) => {
    elementRef.current = element;
    observerRef.current = typeof IntersectionObserver === 'undefined' ? null : element;
  }, []);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const showContent = () => {
      prepared.current = false;
      revealed.current = true;
      controls.stop();
      controls.set(visible);
    };
    // Server HTML and the first client render stay visible. Only elements
    // safely below the viewport are prepared after enhancement is available.
    if (
      revealed.current || preference.matches || !observerRef.current ||
      element.getBoundingClientRect().top <= window.innerHeight + 32
    ) {
      showContent();
    } else {
      prepared.current = true;
      controls.set({ opacity: 0, y: 16 });
    }

    return () => {
      prepared.current = false;
      controls.stop();
      element.style.opacity = '1';
      element.style.transform = 'none';
    };
  }, [controls]);

  useEffect(() => {
    // The hydration snapshot is deliberately static. Consult the browser too,
    // so that snapshot cannot cancel a normal below-fold reveal on first load.
    if (!reduceMotion || !window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    prepared.current = false;
    revealed.current = true;
    controls.stop();
    controls.set(visible);
  }, [controls, reduceMotion]);

  useEffect(() => {
    if (!isInView || !prepared.current || revealed.current) return;

    prepared.current = false;
    revealed.current = true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      controls.stop();
      controls.set(visible);
      return;
    }

    void controls.start({
      ...visible,
      transition: { duration: 0.48, delay: boundedDelay, ease: revealEase },
    }).catch(() => {
      const element = elementRef.current;
      if (element) {
        element.style.opacity = '1';
        element.style.transform = 'none';
      }
    });
  }, [boundedDelay, controls, isInView]);

  return (
    <motion.div
      ref={setElementRef}
      initial={false}
      animate={controls}
      className={className}
    >
      {children}
    </motion.div>
  );
}
