'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, CircleAlert, KeyRound, LoaderCircle, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, Users, X } from 'lucide-react';
import type { StaffAccount } from '@/lib/admin/types';

const inputClass = 'min-h-11 w-full min-w-0 rounded-xl border border-orange-200 bg-white px-3.5 py-2.5 text-sm text-black outline-none focus:border-orange-600 focus:ring-2 focus:ring-orange-100';
const secondaryButton = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-orange-200 bg-white px-3 py-2 text-xs font-bold transition hover:border-orange-400 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50';
const primaryButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#ff6600] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50';
const dateFormatter = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Asia/Colombo' });
type Editor = { mode: 'create' | 'edit' | 'password'; member?: StaffAccount };

export function StaffManagement({ initialStaff, onStaffChanged }: { initialStaff: StaffAccount[]; onStaffChanged: (staff: StaffAccount[]) => void }) {
  const router = useRouter();
  const [staff, setStaff] = useState(initialStaff);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  async function refresh() {
    const response = await fetch('/api/admin/staff', { cache: 'no-store' });
    if (response.status === 401) { router.replace('/admin/login'); return; }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load staff accounts.');
    setStaff(data.staff);
    onStaffChanged(data.staff);
  }

  async function reload() {
    setBusy(true); setNotice(null);
    try { await refresh(); } catch (error) { setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Unable to load staff accounts.' }); }
    finally { setBusy(false); }
  }

  function open(next: Editor, trigger: HTMLElement) { triggerRef.current = trigger; setEditor(next); }
  function close() { setEditor(null); requestAnimationFrame(() => triggerRef.current?.isConnected && triggerRef.current.focus()); }

  async function remove(member: StaffAccount) {
    if (!window.confirm(`Remove ${member.name}'s staff account? They will lose access immediately. Their change history will be kept and their email stays reserved. Disable the account instead if they may need access again.`)) return;
    setBusy(true); setNotice(null);
    try {
      const response = await fetch(`/api/admin/staff/${encodeURIComponent(member.id)}`, { method: 'DELETE' });
      if (response.status === 401) { router.replace('/admin/login'); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to remove this account.');
      const nextStaff = staff.filter((item) => item.id !== member.id);
      setStaff(nextStaff); onStaffChanged(nextStaff);
      setNotice({ type: 'success', text: `${member.name}'s account has been removed.` });
    } catch (error) { setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Unable to remove this account.' }); }
    finally { setBusy(false); }
  }

  return <section className="mt-7 min-w-0" aria-labelledby="staff-heading" data-staff-management>
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-orange-200 bg-white p-5 sm:p-6"><div className="flex min-w-0 items-start gap-3"><Users aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-orange-700" /><div className="min-w-0"><h2 id="staff-heading" className="text-lg font-bold">Your team, with clear permissions.</h2><p className="mt-1 max-w-xl text-xs leading-6 text-black/60">Staff can review enquiries and edit website content. Every change waits for your approval. Only you can create or manage accounts.</p></div></div><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={reload} className={secondaryButton}><RefreshCw aria-hidden="true" className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />Refresh</button><button type="button" disabled={busy} onClick={(event) => open({ mode: 'create' }, event.currentTarget)} className={primaryButton}><Plus aria-hidden="true" className="h-4 w-4" />Add staff</button></div></div>
    {notice ? <p role={notice.type === 'error' ? 'alert' : 'status'} className="mt-4 flex items-start gap-2 rounded-xl border border-orange-200 p-4 text-sm leading-6">{notice.type === 'error' ? <CircleAlert aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-orange-700" /> : <Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-orange-700" />}{notice.text}</p> : null}
    <div className="mt-5 grid min-w-0 gap-4 xl:grid-cols-2">{staff.map((member) => <article key={member.id} data-staff-id={member.id} className="min-w-0 rounded-2xl border border-orange-200 bg-white p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="text-lg font-bold break-words">{member.name}</h3><p className="mt-1 text-xs break-all text-black/60">{member.email}</p></div><span className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.625rem] font-bold ${member.active ? 'border-orange-300 bg-orange-50 text-orange-800' : 'border-orange-200 text-black/60'}`}>{member.active ? 'Active' : 'Disabled'}</span></div><p className="mt-4 text-[0.625rem] leading-5 text-black/55">Created {dateFormatter.format(new Date(member.createdAt))}</p><div className="mt-5 flex flex-wrap gap-2 border-t border-orange-100 pt-4"><button type="button" disabled={busy} aria-label={`Edit account for ${member.name}`} onClick={(event) => open({ mode: 'edit', member }, event.currentTarget)} className={secondaryButton}><Pencil aria-hidden="true" className="h-3.5 w-3.5" />Edit account</button><button type="button" disabled={busy} aria-label={`Reset password for ${member.name}`} onClick={(event) => open({ mode: 'password', member }, event.currentTarget)} className={secondaryButton}><KeyRound aria-hidden="true" className="h-3.5 w-3.5" />Reset password</button><button type="button" disabled={busy} aria-label={`Remove account for ${member.name}`} onClick={() => remove(member)} className={`${secondaryButton} text-orange-800`}><Trash2 aria-hidden="true" className="h-3.5 w-3.5" />Remove</button></div></article>)}</div>
    {!staff.length ? <div className="mt-5 rounded-2xl border border-dashed border-orange-200 p-8 text-center"><ShieldCheck aria-hidden="true" className="mx-auto h-8 w-8 text-orange-600" /><h3 className="mt-4 text-lg font-bold">Invite your first teammate.</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-black/60">Create a staff account and give them the login details privately. There is no public registration.</p></div> : null}
    {editor ? <StaffEditor key={`${editor.mode}-${editor.member?.id ?? 'new'}`} editor={editor} onClose={close} onSaved={async () => { close(); setNotice({ type: 'success', text: editor.mode === 'create' ? 'Staff account created. Share the login details privately.' : editor.mode === 'password' ? 'Password reset. Existing sessions have been signed out.' : 'Staff account updated.' }); await refresh(); }} /> : null}
  </section>;
}

function StaffEditor({ editor, onClose, onSaved }: { editor: Editor; onClose: () => void; onSaved: () => Promise<void> }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(editor.member?.name ?? '');
  const [email, setEmail] = useState(editor.member?.email ?? '');
  const [active, setActive] = useState(editor.member?.active ?? true);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const passwordMode = editor.mode !== 'edit';
  const dirty = name !== (editor.member?.name ?? '') || email !== (editor.member?.email ?? '') || active !== (editor.member?.active ?? true) || Boolean(password);
  const title = editor.mode === 'create' ? 'Add a staff account' : editor.mode === 'password' ? 'Reset staff password' : 'Edit staff account';

  useEffect(() => {
    const dialog = dialogRef.current;
    const overflow = document.body.style.overflow;
    dialog?.showModal(); document.body.style.overflow = 'hidden';
    return () => { dialog?.close(); document.body.style.overflow = overflow; };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function close() {
    if (saving || (dirty && !window.confirm('Discard the changes to this staff account?'))) return;
    setPassword(''); onClose();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const path = editor.mode === 'create' ? '/api/admin/staff' : `/api/admin/staff/${encodeURIComponent(editor.member!.id)}${editor.mode === 'password' ? '/password' : ''}`;
      const payload = editor.mode === 'create' ? { name, email, password } : editor.mode === 'password' ? { password } : { name, email, active };
      const response = await fetch(path, { method: editor.mode === 'edit' ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (response.status === 401) { router.replace('/admin/login'); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save this staff account.');
      setPassword(''); await onSaved();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to save this staff account.'); }
    finally { setSaving(false); }
  }

  return <dialog ref={dialogRef} onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => { if (event.target === event.currentTarget) close(); }} aria-labelledby="staff-editor-title" className="fixed inset-0 m-auto max-h-[94dvh] w-[calc(100%-1.5rem)] max-w-lg overflow-y-auto rounded-2xl border border-orange-200 bg-white p-0 text-black shadow-[0_24px_100px_rgba(255,102,0,0.2)] backdrop:bg-white/85 backdrop:backdrop-blur-sm"><div className="flex items-start justify-between gap-3 border-b border-orange-100 p-5 sm:px-7"><div className="min-w-0"><h2 id="staff-editor-title" className="text-xl font-bold">{title}</h2><p className="mt-2 text-xs leading-6 break-all text-black/60">{editor.mode === 'create' ? 'Staff changes require admin approval before they are applied.' : editor.member?.email}</p></div><button type="button" onClick={close} disabled={saving} aria-label="Close staff account editor" className={`${secondaryButton} shrink-0 !px-2.5`}><X aria-hidden="true" className="h-4 w-4" /></button></div><form data-staff-form={editor.mode} onSubmit={save} className="p-5 sm:p-7"><fieldset disabled={saving} className="min-w-0 space-y-5"><legend className="sr-only">{title}</legend>{editor.mode !== 'password' ? <><label className="block text-xs font-bold">Name<input name="name" autoComplete="off" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className={`${inputClass} mt-2`} /></label><label className="block text-xs font-bold">Email<input name="email" type="email" autoComplete="off" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className={`${inputClass} mt-2`} /></label></> : null}{passwordMode ? <label className="block text-xs font-bold">{editor.mode === 'password' ? 'New password' : 'Temporary password'}<input name="password" type="password" autoComplete="new-password" required minLength={16} maxLength={1024} value={password} onChange={(event) => setPassword(event.target.value)} aria-describedby="staff-password-hint" className={`${inputClass} mt-2`} /><span id="staff-password-hint" className="mt-2 block text-[0.625rem] leading-5 font-normal text-black/60">Use at least 16 characters. Share it privately with this staff member.{editor.mode === 'password' ? ' Resetting their password signs out their existing sessions.' : ''}</span></label> : <label className="flex min-h-11 items-start gap-3 text-xs leading-6"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-orange-600" /><span><strong>Account active</strong><span className="block text-black/60">Disable access without removing their change history. Disabling signs them out immediately.</span></span></label>}</fieldset>{error ? <p role="alert" className="mt-4 text-xs leading-6 text-orange-800">{error}</p> : null}<div className="mt-6 flex flex-wrap justify-end gap-2"><button type="button" disabled={saving} onClick={close} className={secondaryButton}>Cancel</button><button type="submit" disabled={saving || !dirty} className={primaryButton}>{saving ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Check aria-hidden="true" className="h-4 w-4" />}{saving ? 'Saving…' : editor.mode === 'create' ? 'Create account' : editor.mode === 'password' ? 'Reset password' : 'Save account'}</button></div></form></dialog>;
}
