'use client';

import Link, { type LinkProps } from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { navItems, type NavigationItem } from '@/config/company';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { GradientButton } from '@/components/ui/GradientButton';
import { useReducedMotionPreference } from '@/hooks/useReducedMotionPreference';
import { useActiveSection } from '@/hooks/useActiveSection';

type PendingNavigation = { href: string; sectionId: string; changeRoute: boolean };
type NavigationEvent = Parameters<NonNullable<LinkProps['onNavigate']>>[0];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const reduceMotion = useReducedMotionPreference();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const scrolledRef = useRef(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const headerRowRef = useRef<HTMLDivElement>(null);
  const pendingNavigationRef = useRef<PendingNavigation | null>(null);
  const routeFocusRef = useRef<string | null>(null);
  const navigationFrameRef = useRef<number | null>(null);
  const activeSection = useActiveSection(pathname === '/', headerRowRef);

  const completeNavigation = useCallback(() => {
    const pending = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    navigationFrameRef.current = null;
    if (!pending) return;

    if (pending.changeRoute) {
      routeFocusRef.current = pending.sectionId;
      router.push(pending.href);
      return;
    }

    const target = document.getElementById(pending.sectionId);
    if (!target) return;

    const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (currentHref !== pending.href) window.history.pushState(null, '', pending.href);

    const headerHeight = (headerRowRef.current?.getBoundingClientRect().height ?? 76) + 1;
    const top = Math.max(0, window.scrollY + target.getBoundingClientRect().top - headerHeight - 16);
    const instant = reduceMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top, behavior: instant ? 'instant' : 'smooth' });
    target.focus({ preventScroll: true });
  }, [reduceMotion, router]);

  const scheduleNavigation = useCallback(() => {
    if (navigationFrameRef.current !== null) cancelAnimationFrame(navigationFrameRef.current);
    navigationFrameRef.current = requestAnimationFrame(completeNavigation);
  }, [completeNavigation]);

  const cancelNavigation = useCallback(() => {
    pendingNavigationRef.current = null;
    routeFocusRef.current = null;
    if (navigationFrameRef.current !== null) cancelAnimationFrame(navigationFrameRef.current);
    navigationFrameRef.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener('popstate', cancelNavigation);
    return () => {
      window.removeEventListener('popstate', cancelNavigation);
      cancelNavigation();
    };
  }, [cancelNavigation]);

  useEffect(() => {
    if (pathname !== '/' || !routeFocusRef.current) return;

    const sectionId = routeFocusRef.current;
    let frame: number | null = null;
    const focusTarget = () => {
      frame = null;
      const target = document.getElementById(sectionId);
      if (!target) return;
      // A cached landing route can retain its initial fragment. Keep this
      // navigation's URL aligned with the section that Next has scrolled to.
      const hash = `#${sectionId}`;
      if (window.location.hash !== hash) {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
      }
      target.focus({ preventScroll: true });
      routeFocusRef.current = null;
      observer.disconnect();
    };
    const scheduleFocus = () => {
      if (frame === null) frame = requestAnimationFrame(focusTarget);
    };
    const observer = new MutationObserver(scheduleFocus);
    const main = document.querySelector('main');
    if (main) observer.observe(main, { childList: true, subtree: true });
    scheduleFocus();

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [pathname]);

  const handleSectionNavigation = (event: NavigationEvent, sectionId: string, href: string) => {
    const onLanding = pathname === '/';
    if (!onLanding && !open) {
      routeFocusRef.current = sectionId;
      return;
    }
    if (onLanding && !document.getElementById(sectionId)) return;

    // Next invokes onNavigate only for same-tab navigation, preserving modifier clicks.
    event.preventDefault();
    pendingNavigationRef.current = { href, sectionId, changeRoute: !onLanding };
    setOpen(false);
    if (!open) scheduleNavigation();
  };

  useEffect(() => {
    const handleScroll = () => {
      const next = window.scrollY > 18;
      if (next !== scrolledRef.current) {
        scrolledRef.current = next;
        setScrolled(next);
      }
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };

    desktopQuery.addEventListener('change', closeOnDesktop);
    return () => desktopQuery.removeEventListener('change', closeOnDesktop);
  }, []);

  useEffect(() => {
    if (!open) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        menuButtonRef.current?.focus();
      }
    };

    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  const currentLocation = (item: NavigationItem): 'page' | 'location' | undefined => {
    if (pathname === '/') return activeSection === item.sectionId ? 'location' : undefined;
    return item.detailsHref && (pathname === item.detailsHref || pathname?.startsWith(`${item.detailsHref}/`)) ? 'page' : undefined;
  };
  const underlineTransition = reduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 440, damping: 36 };

  return (
    <header
      style={{ viewTransitionName: 'site-header' }}
      className={`sticky top-0 z-50 border-b bg-brand transition-[border-color,box-shadow] duration-200 ${
        scrolled ? 'border-white/40 shadow-[0_8px_28px_-18px_rgba(255,102,0,0.7)]' : 'border-white/25'
      }`}
    >
      <div ref={headerRowRef} className="site-container flex min-h-[76px] items-center justify-between gap-3 py-3 sm:gap-6">
        <Link href="/#home" onNavigate={(event) => handleSectionNavigation(event, 'home', '/#home')} className="flex min-h-11 min-w-0 max-w-[65%] shrink-0 items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-950 lg:max-w-none">
          <BrandLogo />
        </Link>

        <nav aria-label="Main navigation" className="hidden min-w-0 items-center gap-0.5 rounded-full border border-white/20 bg-white/5 p-1 font-heading text-sm font-bold tracking-[0.01em] text-white lg:flex xl:gap-1 min-[1600px]:text-base">
          {navItems.map((item) => {
            const current = currentLocation(item);
            const active = Boolean(current);
            return (
              <Link key={item.href} href={item.href} onNavigate={(event) => handleSectionNavigation(event, item.sectionId, item.href)} aria-current={current} className={`group relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-2.5 transition-colors hover:bg-white/15 focus-visible:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-950 xl:px-3 ${active ? 'bg-white/15' : ''}`}>
                {item.label}
                <span aria-hidden="true" className="absolute right-3 bottom-1.5 left-3 h-[2px] origin-left scale-x-0 rounded-full bg-white/60 transition-transform duration-200 group-hover:scale-x-100 group-focus-visible:scale-x-100 motion-reduce:transition-none" />
                {active ? <motion.span aria-hidden="true" layoutId="desktop-nav-underline" transition={underlineTransition} className="absolute right-3 bottom-1.5 left-3 h-[2px] rounded-full bg-white" /> : null}
              </Link>
            );
          })}
        </nav>

        <div className="hidden shrink-0 lg:block">
          <GradientButton href="/#contact" variant="onOrange" onNavigate={(event) => handleSectionNavigation(event, 'contact', '/#contact')}>
            Get a Free Quote
          </GradientButton>
        </div>

        <button
          type="button"
          ref={menuButtonRef}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="mobile-navigation"
          onClick={() => {
            cancelNavigation();
            setOpen((current) => !current);
          }}
          className="motion-button inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/50 bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-950 lg:hidden"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      <div id="mobile-navigation" aria-hidden={!open} inert={!open} className="lg:hidden">
        <AnimatePresence initial={false} onExitComplete={scheduleNavigation}>
          {open ? (
            <motion.div
              key="mobile-menu"
              initial={reduceMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="max-h-[calc(100dvh-77px)] overflow-y-auto overscroll-contain border-t border-white/30 bg-brand py-4">
                <nav aria-label="Mobile navigation" className="site-container flex min-w-0 flex-col gap-1 font-heading text-base font-bold tracking-[0.02em] text-white">
                  {navItems.map((item) => {
                    const current = currentLocation(item);
                    const active = Boolean(current);
                    return (
                      <Link key={item.href} href={item.href} onNavigate={(event) => handleSectionNavigation(event, item.sectionId, item.href)} aria-current={current} className={`group relative flex min-h-11 items-center rounded-xl px-3 py-2 transition-colors hover:bg-white/15 focus-visible:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-950 ${active ? 'bg-white/15' : ''}`}>
                        {item.label}
                        <span aria-hidden="true" className="absolute right-3 bottom-1 left-3 h-[2px] origin-left scale-x-0 rounded-full bg-white/60 transition-transform duration-200 group-hover:scale-x-100 group-focus-visible:scale-x-100 motion-reduce:transition-none" />
                        {active ? <motion.span aria-hidden="true" layoutId="mobile-nav-underline" transition={underlineTransition} className="absolute right-3 bottom-1 left-3 h-[2px] rounded-full bg-white" /> : null}
                      </Link>
                    );
                  })}
                  <GradientButton href="/#contact" variant="onOrange" className="mt-2 w-full" onNavigate={(event) => handleSectionNavigation(event, 'contact', '/#contact')}>
                    Get a Free Quote
                  </GradientButton>
                </nav>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </header>
  );
}
