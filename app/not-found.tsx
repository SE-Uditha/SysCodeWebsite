import Link from 'next/link';

export default function NotFound() {
  return (
    <main id="main-content" className="site-container flex min-h-[70vh] flex-col items-center justify-center py-14 text-center sm:py-20">
      <div className="mb-6 inline-flex h-16 w-20 items-center justify-center rounded-md bg-gradient-to-r from-orange-100 to-white text-2xl font-bold text-black">
        404
      </div>
      <h1 className="max-w-full break-words text-3xl font-bold tracking-tight text-black sm:text-5xl">Page not found</h1>
      <p className="mt-5 max-w-xl leading-7 text-black">The page you are looking for may have moved, been removed, or never existed.</p>
      <Link href="/" className="mt-8 inline-flex min-h-11 max-w-full items-center justify-center rounded-md bg-gradient-to-r from-brand to-orange-100 px-5 py-3 text-sm font-semibold text-black transition hover:from-orange-400 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-500">
        Back to Home
      </Link>
    </main>
  );
}
