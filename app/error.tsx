'use client';

export default function Error({ reset }: { reset: () => void }) {
  return (
    <main id="main-content" className="site-container flex min-h-[70vh] flex-col items-center justify-center py-14 text-center sm:py-20">
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-black">A small interruption</p>
      <h2 className="max-w-full break-words text-3xl font-bold tracking-tight text-black sm:text-5xl">Something went wrong.</h2>
      <p className="mt-5 max-w-xl leading-7 text-black">We could not load this part of the site right now. Please try again.</p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-8 inline-flex min-h-11 max-w-full items-center justify-center rounded-md bg-gradient-to-r from-brand to-orange-100 px-5 py-3 text-sm font-semibold text-black transition hover:from-orange-400 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-500"
      >
        Try again
      </button>
    </main>
  );
}
