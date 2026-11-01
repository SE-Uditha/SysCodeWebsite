'use client';

import { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';

export const IDLE_LIMIT_MS = 2 * 60 * 1000;
const WARNING_MS = 20 * 1000;
const activityEvents = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'scroll', 'touchstart'] as const;

export function IdleLogout({ onIdle, paused }: { onIdle: () => void; paused: boolean }) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const onIdleRef = useRef(onIdle);
  useEffect(() => { onIdleRef.current = onIdle; });

  useEffect(() => {
    if (paused) return;
    let lastActivity = Date.now();
    let fired = false;
    const markActive = () => { if (!fired) lastActivity = Date.now(); };
    // Timestamps (not a countdown) so a sleeping laptop or throttled background tab still signs out on time.
    const check = () => {
      const idleFor = Date.now() - lastActivity;
      if (idleFor >= IDLE_LIMIT_MS) {
        if (fired) return;
        fired = true;
        setSecondsLeft(0);
        onIdleRef.current();
      } else {
        const remaining = IDLE_LIMIT_MS - idleFor;
        setSecondsLeft(remaining <= WARNING_MS ? Math.ceil(remaining / 1000) : null);
      }
    };
    for (const name of activityEvents) window.addEventListener(name, markActive, { passive: true, capture: true });
    document.addEventListener('visibilitychange', check);
    const timer = window.setInterval(check, 1000);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      for (const name of activityEvents) window.removeEventListener(name, markActive, { capture: true });
    };
  }, [paused]);

  if (secondsLeft === null) return null;
  return <div role="alert" className="fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-orange-300 bg-white p-4 text-xs shadow-[0_18px_60px_-20px_rgba(255,102,0,0.45)] sm:bottom-6">
    <Clock aria-hidden="true" className="h-5 w-5 shrink-0 text-orange-700" />
    <p className="min-w-0 flex-1 leading-5"><strong>Still there?</strong> You will be signed out in {secondsLeft}s because of inactivity. Press a key or move the mouse to stay signed in.</p>
  </div>;
}
