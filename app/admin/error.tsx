'use client';

export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <main id="main-content" className="flex min-h-dvh flex-col items-center justify-center gap-5 p-6 text-center">
      <p className="text-xs font-bold uppercase tracking-widest text-orange-800">SysCode admin</p>
      <h1 className="text-3xl font-bold tracking-tight">We couldn’t open your workspace.</h1>
      <p className="max-w-md text-sm leading-6">Please try again. Your saved content and enquiries will be available when the connection is restored.</p>
      <button type="button" onClick={reset} className="min-h-11 rounded-lg bg-brand px-6 py-3 text-sm font-bold text-white">Try again</button>
    </main>
  );
}
