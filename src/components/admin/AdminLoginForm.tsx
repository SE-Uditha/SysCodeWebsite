'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, CircleAlert, Eye, EyeOff, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react';
import { BrandLogo } from '@/components/ui/BrandLogo';

export function AdminLoginForm({ configured, unavailable = false }: { configured: boolean; unavailable?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured) {
      setError(unavailable ? 'Admin sign-in is temporarily unavailable. Please try again shortly.' : 'Complete the first-time setup before signing in.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to sign in. Check your credentials and try again.');
      router.replace('/admin');
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to sign in. Please try again.');
    } finally { setSubmitting(false); }
  }

  return <main id="main-content" tabIndex={-1} className="grid min-h-dvh min-w-0 bg-white text-black outline-none lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" data-admin-login>
    <section className="relative flex min-w-0 flex-col overflow-hidden bg-[#ff6600] px-6 py-7 text-white sm:px-10 lg:min-h-dvh lg:px-[clamp(2rem,5vw,8rem)] lg:py-12"><Link href="/" aria-label="SysCode public website" className="relative z-10 w-fit"><BrandLogo className="!w-40 sm:!w-48" /></Link><div aria-hidden="true" className="pointer-events-none absolute -right-32 -bottom-48 h-[34rem] w-[34rem] rounded-full border border-white/20" /><div aria-hidden="true" className="pointer-events-none absolute -right-20 -bottom-36 h-[26rem] w-[26rem] rounded-full border border-white/20" /><div className="relative my-auto hidden py-20 lg:block"><span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/35"><ShieldCheck aria-hidden="true" className="h-6 w-6" /></span><p className="mt-8 text-[0.625rem] font-bold tracking-[0.2em] uppercase">Your team workspace</p><h1 className="mt-4 max-w-lg text-[clamp(2.6rem,4vw,4.5rem)] leading-[1.1] font-bold tracking-[-0.055em]">Good projects start with a conversation.</h1><p className="mt-6 max-w-sm text-sm leading-7 text-white/90">A simple place to manage enquiries, keep your notes, and move your next project forward.</p></div><p className="relative hidden text-xs text-white/90 lg:block">SysCode Software Solutions</p></section>
    <section className="flex min-w-0 items-center justify-center px-5 py-12 sm:px-10 lg:px-16"><div className="w-full max-w-md"><Link href="/" className="mb-10 inline-flex min-h-9 items-center gap-2 text-xs font-semibold text-orange-800"><ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />Back to website</Link><span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-orange-200 bg-white text-orange-700 shadow-[0_4px_20px_-10px_rgba(255,102,0,0.2)]"><LockKeyhole aria-hidden="true" className="h-5 w-5" /></span><p className="mt-6 text-[0.625rem] font-bold tracking-[0.18em] text-orange-800 uppercase">Private team access</p><h2 className="mt-2 text-3xl leading-tight font-bold tracking-[-0.045em] sm:text-4xl">Welcome back.</h2><p className="mt-3 text-sm leading-6 text-black/60">Sign in with the account provided by your administrator. Staff changes are reviewed before they are applied.</p>
      {!configured ? (
        <div id="admin-setup-notice" role="status" className="mt-6 rounded-2xl border border-orange-200 bg-white p-4 sm:p-5">
          <h3 className="text-sm font-bold">{unavailable ? 'Sign-in temporarily unavailable' : 'First-time setup required'}</h3>
          {unavailable ? <p className="mt-2 text-xs leading-6 text-black/65">The admin database could not be reached. Check that MySQL Server is running and the website connection is configured, then reload this page.</p> : <>
          <p className="mt-2 text-xs leading-6 text-black/65">Configure the MySQL connection, then create your admin account from the project terminal using your own email address:</p>
          <code className="mt-3 block rounded-lg border border-orange-100 bg-orange-50 px-3 py-3 text-xs leading-6 text-orange-900 [overflow-wrap:anywhere]">node scripts/setup-admin.mjs --email you@example.com</code>
          <p className="mt-3 text-xs leading-6 text-black/65">Choose a password of at least 16 characters, restart the website, then return here to sign in.</p>
          </>}
        </div>
      ) : null}
      <form onSubmit={login} className="mt-8 space-y-5"><div><label htmlFor="admin-email" className="mb-2 block text-xs font-bold">Email address</label><input id="admin-email" name="email" type="email" autoComplete="username" required disabled={submitting} value={email} onChange={(event) => setEmail(event.target.value)} className="min-h-12 w-full min-w-0 rounded-xl border border-orange-200 bg-white px-4 py-3 text-base text-black outline-none transition focus:border-orange-600 focus:ring-2 focus:ring-orange-100" /></div><div><label htmlFor="admin-password" className="mb-2 block text-xs font-bold">Password</label><div className="relative"><input id="admin-password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" required disabled={submitting} value={password} onChange={(event) => setPassword(event.target.value)} className="min-h-12 w-full min-w-0 rounded-xl border border-orange-200 bg-white py-3 pr-12 pl-4 text-base text-black outline-none transition focus:border-orange-600 focus:ring-2 focus:ring-orange-100" /><button type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} className="absolute top-1/2 right-1.5 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-orange-800 transition hover:bg-orange-50">{visible ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}</button></div></div>{error ? <p role="alert" className="flex items-start gap-2 rounded-xl border border-orange-200 p-3 text-xs leading-6"><CircleAlert aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-orange-800" />{error}</p> : null}<button type="submit" disabled={!configured || submitting} aria-describedby={!configured ? 'admin-setup-notice' : undefined} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#ff6600] px-5 py-3 text-sm font-bold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}{submitting ? 'Signing inâ€¦' : 'Sign in'}{!submitting ? <ArrowRight aria-hidden="true" className="h-4 w-4" /> : null}</button></form>
      <p className="mt-8 flex items-center gap-2 border-t border-orange-100 pt-5 text-[0.625rem] leading-5 text-black/55"><ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-orange-700" />Private workspace. Authorised administrators and staff only.</p></div></section>
  </main>;
}


