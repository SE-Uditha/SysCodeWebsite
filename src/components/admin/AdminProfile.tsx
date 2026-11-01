'use client';

import { useState, type FormEvent } from 'react';
import { Check, CircleAlert, LoaderCircle, ShieldCheck } from 'lucide-react';
import type { AdminProfile as AdminProfileData } from '@/lib/admin/types';

const fieldClass = 'mt-2 min-h-11 w-full rounded-xl border border-orange-200 bg-white px-3.5 py-2.5 text-sm text-black outline-none transition focus:border-orange-600 focus:ring-2 focus:ring-orange-100';

export function AdminProfile({ initialProfile }: { initialProfile: AdminProfileData }) {
  const [profile, setProfile] = useState(initialProfile);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch('/api/admin/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: profile.phone, address: profile.address, postalCode: profile.postalCode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save profile details.');
      setProfile(data.profile);
      setFeedback({ type: 'success', message: 'Private profile details saved.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Unable to save profile details.' });
    } finally {
      setSaving(false);
    }
  }

  return <section className="max-w-3xl rounded-2xl border border-orange-200/80 bg-white p-5 sm:p-7" aria-labelledby="admin-profile-heading">
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-700"><ShieldCheck aria-hidden="true" className="h-5 w-5" /></span>
      <div><h2 id="admin-profile-heading" className="text-lg font-bold">Administrator details</h2><p className="mt-1 text-xs leading-6 text-black/60">These details are stored privately in the admin database and are not displayed on the public website.</p></div>
    </div>
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <div><span className="text-xs font-bold">Username</span><p className="mt-2 min-h-11 rounded-xl border border-orange-100 bg-orange-50/50 px-3.5 py-3 text-sm">{profile.username}</p></div>
      <div><span className="text-xs font-bold">Email</span><p className="mt-2 min-h-11 break-all rounded-xl border border-orange-100 bg-orange-50/50 px-3.5 py-3 text-sm">{profile.email}</p></div>
    </div>
    <form onSubmit={save} className="mt-5 space-y-4">
      <label className="block text-xs font-bold">Phone number<input autoComplete="tel" maxLength={40} className={fieldClass} value={profile.phone} onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))} /></label>
      <label className="block text-xs font-bold">Private address<textarea autoComplete="street-address" maxLength={500} rows={3} className={fieldClass} value={profile.address} onChange={(event) => setProfile((current) => ({ ...current, address: event.target.value }))} /></label>
      <label className="block text-xs font-bold sm:max-w-xs">Postal code<input autoComplete="postal-code" maxLength={20} className={fieldClass} value={profile.postalCode} onChange={(event) => setProfile((current) => ({ ...current, postalCode: event.target.value }))} /></label>
      {feedback ? <p role={feedback.type === 'error' ? 'alert' : 'status'} className="flex items-start gap-2 rounded-xl border border-orange-200 p-3 text-xs leading-6">{feedback.type === 'error' ? <CircleAlert aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-orange-800" /> : <Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-orange-800" />}{feedback.message}</p> : null}
      <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#ff6600] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}{saving ? 'Saving…' : 'Save private details'}</button>
    </form>
  </section>;
}
