'use client';

import { Children, isValidElement, useEffect, useRef, type ReactNode } from 'react';
import { useReducedMotionPreference } from '@/hooks/useReducedMotionPreference';

type Props = {
  children: ReactNode;
  className?: string;
  stretch?: boolean;
  itemClassNames?: string[];
  as?: 'div' | 'ol';
};

type FrameContext = { headerHeight: number; viewportHeight: number };
type Controller = { invalidate: () => void; read: (context: FrameContext) => () => void };
type Item = {
  slot: HTMLElement;
  body: HTMLElement;
  left: number;
  top: number;
  width: number;
  height: number;
  progress: number;
  signature: string;
};

const controllers = new Set<Controller>();
let frame: number | null = null;
let bodyObserver: ResizeObserver | null = null;

function scheduleFrame() {
  if (frame !== null || !controllers.size) return;
  frame = requestAnimationFrame(() => {
    frame = null;
    const headerRow = document.querySelector<HTMLElement>('header > .site-container');
    const context = {
      headerHeight: (headerRow?.getBoundingClientRect().height ?? 76) + 1,
      viewportHeight: window.innerHeight,
    };
    // Collect every geometry read before changing any visual wrapper.
    const paints = Array.from(controllers, (controller) => controller.read(context));
    paints.forEach((paint) => paint());
  });
}

function invalidateAll() {
  controllers.forEach((controller) => controller.invalidate());
  scheduleFrame();
}

function register(controller: Controller) {
  controllers.add(controller);
  if (controllers.size === 1) {
    window.addEventListener('scroll', scheduleFrame, { passive: true });
    window.addEventListener('resize', invalidateAll, { passive: true });
    document.addEventListener('load', invalidateAll, true);
    if (typeof ResizeObserver !== 'undefined') {
      bodyObserver = new ResizeObserver(invalidateAll);
      bodyObserver.observe(document.body);
    }
    void document.fonts?.ready.then(invalidateAll);
  }
  scheduleFrame();

  return () => {
    controllers.delete(controller);
    if (controllers.size) return;
    window.removeEventListener('scroll', scheduleFrame);
    window.removeEventListener('resize', invalidateAll);
    document.removeEventListener('load', invalidateAll, true);
    bodyObserver?.disconnect();
    bodyObserver = null;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  };
}

const managedStyles = ['transform', 'background-color', 'box-shadow', 'border-radius', 'pointer-events', 'z-index'];

function reset(items: Item[]) {
  for (const item of items) {
    managedStyles.forEach((property) => item.body.style.removeProperty(property));
    item.progress = 0;
    item.signature = '';
  }
}

export function ScrollCollection({ children, className = '', stretch = true, itemClassNames = [], as: Group = 'div' }: Props) {
  const groupRef = useRef<HTMLElement | null>(null);
  const reduceMotion = useReducedMotionPreference();
  const childrenArray = Children.toArray(children);
  const count = childrenArray.length;

  useEffect(() => {
    const group = groupRef.current;
    if (!group || typeof requestAnimationFrame !== 'function' || typeof cancelAnimationFrame !== 'function') return;
    // The server snapshot is static; the actual browser preference decides enhancement.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const items: Item[] = Array.from(group.children).flatMap((slot) => {
      if (!(slot instanceof HTMLElement) || !slot.hasAttribute('data-collection-slot')) return [];
      const body = slot.firstElementChild;
      if (!(body instanceof HTMLElement) || !body.hasAttribute('data-collection-body')) return [];
      return [{ slot, body, left: 0, top: 0, width: 0, height: 0, progress: 0, signature: '' }];
    });
    let dirty = true;
    let disposed = false;
    let focusFrame: number | null = null;
    let focused = group.contains(document.activeElement);

    const controller: Controller = {
      invalidate: () => { dirty = true; },
      read: ({ headerHeight, viewportHeight }) => {
        const bounds = group.getBoundingClientRect();
        if (dirty) {
          for (const item of items) {
            const slotBounds = item.slot.getBoundingClientRect();
            item.left = slotBounds.left - bounds.left;
            item.top = slotBounds.top - bounds.top;
            item.width = slotBounds.width;
            item.height = slotBounds.height;
          }
          dirty = false;
        }

        const availableHeight = Math.max(0, viewportHeight - headerHeight);
        if (focused || availableHeight < 64 || bounds.width < 1) return () => reset(items);

        const depth = 4;
        const depthExtent = Math.max(0, items.length - 1) * depth;
        const heightCap = Math.min(130, availableHeight * 0.22);
        const widthCap = Math.min(180, Math.max(1, bounds.width - depthExtent - 16));
        const targets = items.map((item, index) => {
          const rotation = ((index % 3) - 1) * 2;
          const angle = rotation * Math.PI / 180;
          const rotatedWidth = Math.abs(item.width * Math.cos(angle)) + Math.abs(item.height * Math.sin(angle));
          const rotatedHeight = Math.abs(item.width * Math.sin(angle)) + Math.abs(item.height * Math.cos(angle));
          const scale = Math.min(0.5, widthCap / Math.max(1, rotatedWidth), heightCap / Math.max(1, rotatedHeight));
          return { rotation, scale, height: rotatedHeight * scale };
        });
        const deckExtent = Math.max(0, ...targets.map((target) => target.height)) + depthExtent;
        const deckTop = Math.min(headerHeight + 20, bounds.bottom - deckExtent - 12);
        // Begin in the upper third of the reading area, while departing cards
        // still have room to visibly gather beneath the header.
        const collectionLead = Math.max(heightCap + 24, Math.min(280, availableHeight * 0.35));
        const trigger = headerHeight + collectionLead;

        const poses = items.map((item, index) => {
          const bottom = bounds.top + item.top + item.height;
          const progress = Math.min(1, Math.max(0, (trigger - bottom) / 180));
          const eased = progress * progress * (3 - 2 * progress);
          const target = targets[index];
          const scale = 1 + (target.scale - 1) * eased;
          const rotation = target.rotation * eased;
          const angle = rotation * Math.PI / 180;
          const originalX = item.left + item.width / 2;
          const originalY = item.top + item.height / 2;
          const targetX = bounds.width / 2 + (index - (items.length - 1) / 2) * depth;
          const targetY = deckTop - bounds.top + index * depth + target.height / 2;
          const centerX = originalX + (targetX - originalX) * eased;
          const centerY = originalY + (targetY - originalY) * eased;
          const rotatedCenterX = scale * (item.width / 2 * Math.cos(angle) - item.height / 2 * Math.sin(angle));
          const rotatedCenterY = scale * (item.width / 2 * Math.sin(angle) + item.height / 2 * Math.cos(angle));
          const transform = `translate3d(${(centerX - item.left - rotatedCenterX).toFixed(2)}px, ${(centerY - item.top - rotatedCenterY).toFixed(2)}px, 0) rotate(${rotation.toFixed(3)}deg) scale(${scale.toFixed(5)})`;
          return { progress, eased, transform };
        });

        return () => {
          items.forEach((item, index) => {
            const pose = poses[index];
            const signature = `${pose.progress.toFixed(4)}:${pose.transform}`;
            if (signature === item.signature) return;
            item.signature = signature;
            item.progress = pose.progress;
            // Normal cards remain above the miniature packet while they are being read.
            item.body.style.zIndex = pose.progress > 0 ? String(index + 1) : String(items.length + 1);
            if (pose.progress === 0) {
              managedStyles.filter((property) => property !== 'z-index').forEach((property) => item.body.style.removeProperty(property));
              return;
            }
            item.body.style.transform = pose.transform;
            item.body.style.backgroundColor = `rgba(255, 255, 255, ${pose.eased.toFixed(3)})`;
            item.body.style.borderRadius = `${(12 * pose.eased).toFixed(2)}px`;
            item.body.style.boxShadow = `0 ${(6 * pose.eased).toFixed(2)}px ${(18 * pose.eased).toFixed(2)}px ${(-4 * pose.eased).toFixed(2)}px rgba(255, 102, 0, ${(0.24 * pose.eased).toFixed(3)})`;
            item.body.style.pointerEvents = pose.progress >= 0.86 ? 'none' : '';
          });
        };
      },
    };

    const invalidate = () => {
      controller.invalidate();
      scheduleFrame();
    };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(invalidate) : null;
    observer?.observe(group);
    items.forEach((item) => observer?.observe(item.slot));
    const headerRow = document.querySelector<HTMLElement>('header > .site-container');
    if (headerRow) observer?.observe(headerRow);

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      const collected = target instanceof HTMLElement && items.some((item) => item.progress > 0 && item.body.contains(target));
      focused = true;
      reset(items);
      if (focusFrame !== null) cancelAnimationFrame(focusFrame);
      if (collected && target instanceof HTMLElement) {
        focusFrame = requestAnimationFrame(() => {
          focusFrame = null;
          if (!disposed && group.contains(document.activeElement)) target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        });
      }
    };
    const onFocusOut = () => {
      queueMicrotask(() => {
        if (disposed) return;
        focused = group.contains(document.activeElement);
        scheduleFrame();
      });
    };

    group.addEventListener('focusin', onFocusIn);
    group.addEventListener('focusout', onFocusOut);
    const unregister = register(controller);

    return () => {
      disposed = true;
      unregister();
      observer?.disconnect();
      group.removeEventListener('focusin', onFocusIn);
      group.removeEventListener('focusout', onFocusOut);
      if (focusFrame !== null) cancelAnimationFrame(focusFrame);
      reset(items);
    };
  }, [className, count, reduceMotion, stretch]);

  const Slot = Group === 'ol' ? 'li' : 'div';

  return (
    <Group ref={(element: HTMLDivElement | HTMLOListElement | null) => { groupRef.current = element; }} className={`scroll-collection ${className}`} data-scroll-collection="">
      {childrenArray.map((child, index) => (
        <Slot key={isValidElement(child) ? child.key ?? index : index} className={`scroll-collection-slot min-w-0 ${stretch ? 'h-full' : ''} ${itemClassNames[index] ?? ''}`} data-collection-slot="">
          <div className={`scroll-collection-card min-w-0 ${stretch ? 'h-full' : ''}`} data-collection-body="">
            {child}
          </div>
        </Slot>
      ))}
    </Group>
  );
}
