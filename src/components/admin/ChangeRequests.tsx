'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Check, CircleAlert, ClipboardCheck, Clock3, Eye, LoaderCircle, RefreshCw, X } from 'lucide-react';
import { ProjectPreview } from '@/components/sections/ProjectPreview';
import type { ChangeRequest, ChangeRequestSummary } from '@/lib/admin/types';
import type { Project } from '@/data/projects';

const secondaryButton = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-orange-200 bg-white px-3 py-2 text-xs font-bold transition hover:border-orange-400 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50';
const primaryButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#ff6600] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50';
const inputClass = 'min-h-11 w-full min-w-0 rounded-xl border border-orange-200 bg-white px-3.5 py-2.5 text-sm text-black outline-none focus:border-orange-600 focus:ring-2 focus:ring-orange-100';
const dateFormatter = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Colombo' });
const statusLabels = { pending: 'Awaiting approval', approved: 'Approved', rejected: 'Rejected' };
const labels: Record<string, string> = { name: 'Name', description: 'Description', startPrice: 'Starting price (LKR)', features: 'Included features', audience: 'Best suited for', cta: 'Button text', popular: 'Most popular badge', question: 'Question', answer: 'Answer', overview: 'Project description', category: 'Category', technologies: 'Technologies & features', demoUrl: 'Live demo URL', previewImageUrl: 'Preview screenshot URL', status: 'Status', notes: 'Private notes', accent: 'Accent', gradient: 'Background', id: 'ID' };
type Difference = { label: string; before: unknown; after: unknown };

function readable(value: unknown): string {
  if (value === undefined) return 'Not present';
  if (value === null || value === '') return 'Empty';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.map(readable).join('\n') : 'Empty list';
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${labels[key] ?? key}: ${readable(item)}`).join('\n');
  return String(value);
}

function differences(before: unknown, after: unknown, path = ''): Difference[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (Array.isArray(before) && Array.isArray(after)) {
    // Keep positions visible: moving an item is itself a meaningful change.
    return Array.from({ length: Math.max(before.length, after.length) }, (_, index) => {
      const item = after[index] ?? before[index];
      const name = item && typeof item === 'object' ? item.name ?? item.question : null;
      return differences(before[index], after[index], `${path ? `${path} / ` : ''}Item ${index + 1}${name ? `: ${String(name)}` : ''}`);
    }).flat();
  }
  if (before && after && typeof before === 'object' && typeof after === 'object' && !Array.isArray(before) && !Array.isArray(after)) {
    const previous = before as Record<string, unknown>;
    const next = after as Record<string, unknown>;
    return [...new Set([...Object.keys(previous), ...Object.keys(next)])].flatMap((key) => differences(previous[key], next[key], `${path ? `${path} / ` : ''}${labels[key] ?? key}`));
  }
  return [{ label: path || 'Content', before, after }];
}

function requestTitle(request: ChangeRequestSummary & { payload?: ChangeRequest['payload'] }) {
  if (request.kind === 'content') return ({ packages: 'Package details', projects: 'Project demos', faqs: 'Questions & answers' } as Record<string, string>)[request.target] ?? 'Website content';
  if (request.payload && 'before' in request.payload && !Array.isArray(request.payload.before) && 'fullName' in request.payload.before) return `Enquiry: ${request.payload.before.fullName}`;
  return 'Enquiry update';
}

function RequestBadge({ status }: { status: ChangeRequest['status'] }) {
  return <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.625rem] font-bold ${status === 'approved' ? 'border-orange-600 bg-orange-600 text-white' : status === 'pending' ? 'border-orange-300 bg-orange-50 text-orange-800' : 'border-orange-200 bg-white text-black/65'}`}>{status === 'pending' ? <Clock3 aria-hidden="true" className="h-3 w-3" /> : null}{statusLabels[status]}</span>;
}

export function ChangeRequests({ initialRequests, isAdmin, onApplied, onRequestsChanged, pendingCount, onPendingCountChanged }: { initialRequests: ChangeRequestSummary[]; isAdmin: boolean; onApplied: () => Promise<void>; onRequestsChanged: (requests: ChangeRequestSummary[]) => void; pendingCount: number; onPendingCountChanged: (count: number) => void }) {
  const router = useRouter();
  const [requests, setRequests] = useState(initialRequests);
  const [filter, setFilter] = useState<'all' | ChangeRequest['status']>(isAdmin ? 'pending' : 'all');
  const [selected, setSelected] = useState<ChangeRequestSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const triggerRef = useRef<HTMLElement | null>(null);
  const visible = requests.filter((request) => filter === 'all' || request.status === filter).sort((a, b) => b.createdAt - a.createdAt);

  async function refresh() {
    setRefreshing(true); setError('');
    try {
      const response = await fetch('/api/admin/approvals', { cache: 'no-store' });
      if (response.status === 401) { router.replace('/admin/login'); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load submissions.');
      setRequests(data.requests);
      onRequestsChanged(data.requests); onPendingCountChanged(data.pendingCount);
      await onApplied();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to load submissions.'); }
    finally { setRefreshing(false); }
  }

  function close() { setSelected(null); requestAnimationFrame(() => triggerRef.current?.isConnected && triggerRef.current.focus()); }

  return <section className="mt-7 min-w-0" aria-labelledby="requests-heading" data-change-requests>
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-orange-200 p-5 sm:p-6"><div className="min-w-0"><h2 id="requests-heading" className="text-lg font-bold">{isAdmin ? 'Review before anything changes.' : 'Follow your submitted changes.'}</h2><p className="mt-1 max-w-2xl text-xs leading-6 text-black/60">{isAdmin ? 'Compare the saved version with the staff proposal. Approval applies the change; rejection keeps the saved version.' : 'Website content, enquiry statuses, and private notes only change after an administrator approves your submission.'}</p></div><button type="button" disabled={refreshing} onClick={refresh} className={secondaryButton}><RefreshCw aria-hidden="true" className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Refresh</button></div>
    <label className="mt-5 block max-w-xs text-xs font-bold">Submission status<select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className={`${inputClass} mt-2`}><option value="all">All submissions</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {pendingCount > requests.filter((request) => request.status === 'pending').length ? <p className="mt-3 text-xs leading-6 text-black/60">Showing the latest 100 submissions, with pending changes first. Review these and refresh to load more changes waiting for approval.</p> : null}
    {error ? <p role="alert" className="mt-4 rounded-xl border border-orange-200 p-4 text-xs leading-6 text-orange-800">{error}</p> : null}
    <ul className="mt-5 grid min-w-0 gap-3">{visible.map((request) => <li key={request.id} data-request-id={request.id}><button type="button" onClick={(event) => { triggerRef.current = event.currentTarget; setSelected(request); }} className="flex w-full min-w-0 flex-wrap items-center justify-between gap-4 rounded-2xl border border-orange-200 bg-white p-5 text-left transition hover:border-orange-400 sm:p-6"><span className="min-w-0 flex-1 basis-48"><span className="block text-sm font-bold break-words">{requestTitle(request)}</span><span className="mt-1 block text-xs leading-6 break-words text-black/60">{request.actorName} · {dateFormatter.format(new Date(request.createdAt))}</span><span className="mt-1 block text-[0.625rem] break-all text-black/50">{request.actorEmail}</span></span><span className="flex flex-wrap items-center gap-3"><RequestBadge status={request.status} /><span className="inline-flex items-center gap-1 text-xs font-bold text-orange-800">View changes <Eye aria-hidden="true" className="h-4 w-4" /></span></span></button></li>)}</ul>
    {!visible.length ? <div className="mt-5 rounded-2xl border border-dashed border-orange-200 p-8 text-center"><ClipboardCheck aria-hidden="true" className="mx-auto h-8 w-8 text-orange-600" /><h3 className="mt-4 text-lg font-bold">{filter === 'pending' ? 'No changes waiting for approval.' : 'No submissions here yet.'}</h3><p className="mt-2 text-sm leading-6 text-black/60">{isAdmin ? 'Staff proposals will appear here for review.' : 'Edit content or an enquiry, then submit your changes for approval.'}</p></div> : null}
    {selected ? <RequestDetails key={selected.id} initialRequest={selected} isAdmin={isAdmin} onClose={close} onReviewed={async (request) => { const next = requests.map((item) => item.id === request.id ? request : item); setRequests(next); onRequestsChanged(next); onPendingCountChanged(Math.max(0, pendingCount - (selected.status === 'pending' ? 1 : 0))); setSelected(request); if (request.status === 'approved') await onApplied(); }} /> : null}
  </section>;
}

function RequestDetails({ initialRequest, isAdmin, onClose, onReviewed }: { initialRequest: ChangeRequestSummary; isAdmin: boolean; onClose: () => void; onReviewed: (request: ChangeRequest) => Promise<void> }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [request, setRequest] = useState<ChangeRequestSummary & { payload?: ChangeRequest['payload'] }>(initialRequest);
  const [reason, setReason] = useState('');
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState(false);
  const diff = useMemo(() => request.payload ? differences(request.payload.before, request.payload.after) : [], [request]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const overflow = document.body.style.overflow;
    dialog?.showModal(); document.body.style.overflow = 'hidden';
    return () => { dialog?.close(); document.body.style.overflow = overflow; };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/admin/approvals/${encodeURIComponent(initialRequest.id)}`, { cache: 'no-store', signal: controller.signal });
        if (response.status === 401) { router.replace('/admin/login'); return; }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load this submission.');
        setRequest(data.request);
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Unable to load this submission.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [initialRequest.id, router]);

  function close() {
    if (saving || (reason.trim() && request.status === 'pending' && !window.confirm('Discard your review note and close this submission?'))) return;
    onClose();
  }

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/admin/approvals/${encodeURIComponent(request.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, reason: reason.trim() }) });
      if (response.status === 401) { router.replace('/admin/login'); return; }
      const data = await response.json();
      if (response.status === 409) throw new Error(`${data.error || 'This proposal conflicts with a newer change.'} It was not applied. Close this review and refresh the list; reject a stale proposal and ask the staff member to resubmit from the latest saved version.`);
      if (!response.ok) throw new Error(data.error || 'Unable to review this submission.');
      setRequest(data.request); setReason('');
      setNotice(decision === 'approve' ? 'Approved. The changes are now applied.' : 'Rejected. The saved version is unchanged.');
      await onReviewed(data.request);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to review this submission.'); }
    finally { setSaving(false); }
  }

  const projects = isAdmin && request.payload && request.kind === 'content' && 'section' in request.payload && request.payload.section === 'projects' ? request.payload.after as Project[] : [];

  return <dialog data-review-dialog ref={dialogRef} onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => { if (event.target === event.currentTarget) close(); }} aria-labelledby="request-details-title" className="fixed inset-0 m-auto max-h-[94dvh] w-[calc(100%-1.5rem)] max-w-5xl overflow-y-auto rounded-2xl border border-orange-200 bg-white p-0 text-black shadow-[0_24px_100px_rgba(255,102,0,0.2)] backdrop:bg-white/85 backdrop:backdrop-blur-sm"><header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-orange-100 bg-white p-5 sm:px-7"><div className="min-w-0"><p className="text-[0.625rem] font-bold tracking-[0.14em] text-orange-800 uppercase">Staff submission</p><h2 id="request-details-title" className="mt-2 text-xl font-bold break-words">{requestTitle(request)}</h2><p className="mt-2 text-xs leading-6 break-words text-black/60">{request.actorName} · {dateFormatter.format(new Date(request.createdAt))}</p><div className="mt-2"><RequestBadge status={request.status} /></div></div><button type="button" onClick={close} disabled={saving} aria-label="Close submission" className={`${secondaryButton} shrink-0 !px-2.5`}><X aria-hidden="true" className="h-4 w-4" /></button></header><div className="min-w-0 p-5 sm:p-7">{loading ? <p role="status" className="mb-4 flex items-center gap-2 text-xs text-orange-800"><LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />Checking the latest submission status…</p> : null}<p className="mb-5 rounded-xl border border-orange-100 p-4 text-xs leading-6 text-black/65">The saved version below is the version this staff member started from. Approval checks it against the latest saved data to prevent overwriting another change.</p><div className="space-y-4" aria-label="Proposed changes">{diff.map((item, index) => <section key={`${item.label}-${index}`} className="min-w-0 overflow-hidden rounded-xl border border-orange-200"><h3 className="border-b border-orange-100 px-4 py-3 text-xs leading-6 font-bold break-words">{item.label}</h3><div className="grid min-w-0 md:grid-cols-2"><div className="min-w-0 p-4"><p className="text-[0.625rem] font-bold tracking-wide text-black/55 uppercase">Before</p><p className="mt-2 whitespace-pre-wrap text-xs leading-6 break-words [overflow-wrap:anywhere]">{readable(item.before)}</p></div><div className="min-w-0 border-t border-orange-100 bg-orange-50/50 p-4 md:border-t-0 md:border-l"><p className="text-[0.625rem] font-bold tracking-wide text-orange-800 uppercase">Proposed</p><p className="mt-2 whitespace-pre-wrap text-xs leading-6 break-words [overflow-wrap:anywhere]">{readable(item.after)}</p></div></div></section>)}</div>{!diff.length ? <p className="text-sm text-black/60">There are no changed fields in this submission.</p> : null}{projects.length ? <div className="mt-5"><button type="button" onClick={() => setPreview((current) => !current)} className={secondaryButton}><Eye aria-hidden="true" className="h-4 w-4" />{preview ? 'Hide proposed project previews' : 'Preview proposed project cards'}</button>{preview ? <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">{projects.map((project) => <article key={project.id} className="min-w-0 overflow-hidden rounded-xl border border-orange-200"><ProjectPreview project={project} /><h3 className="p-4 text-sm font-bold break-words">{project.name}</h3></article>)}</div> : null}<p className="mt-2 text-[0.625rem] leading-5 text-black/55">These previews are private to this review. Pending content is not shown on the public website.</p></div> : null}{request.reviewedAt ? <div className="mt-6 rounded-xl border border-orange-200 p-4"><p className="text-xs font-bold">{statusLabels[request.status]} · {dateFormatter.format(new Date(request.reviewedAt))}</p>{request.reviewReason ? <p className="mt-2 whitespace-pre-wrap text-xs leading-6 break-words">{request.reviewReason}</p> : null}</div> : null}{notice ? <p role="status" className="mt-5 flex items-start gap-2 rounded-xl border border-orange-200 p-4 text-xs leading-6"><Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-orange-700" />{notice}</p> : null}{error ? <p role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-orange-300 p-4 text-xs leading-6 text-orange-800"><CircleAlert aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />{error}</p> : null}{isAdmin && request.status === 'pending' ? <form onSubmit={review} className="mt-7 border-t border-orange-100 pt-6"><h3 className="text-base font-bold">Your decision</h3><div className="mt-4 flex flex-wrap gap-3">{(['approve', 'reject'] as const).map((value) => <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-4 text-xs font-bold ${decision === value ? 'border-orange-500 bg-orange-50 text-orange-800' : 'border-orange-200'}`}><input type="radio" name="review-decision" value={value} checked={decision === value} disabled={saving || loading} onChange={() => setDecision(value)} className="accent-orange-600" />{value === 'approve' ? 'Approve and apply' : 'Reject proposal'}</label>)}</div><label className="mt-5 block text-xs font-bold">{decision === 'reject' ? 'Reason for rejection' : 'Review note (optional)'}<textarea required={decision === 'reject'} disabled={saving || loading} maxLength={2000} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} className={`${inputClass} mt-2 resize-y`} /></label><p className="mt-2 text-[0.625rem] leading-5 text-black/55">Your review note is visible to the staff member.</p><div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" disabled={saving} onClick={close} className={secondaryButton}>Close</button><button type="submit" disabled={saving || loading || !request.payload || (decision === 'approve' && !diff.length)} className={primaryButton}>{saving ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <ClipboardCheck aria-hidden="true" className="h-4 w-4" />}{saving ? 'Applying decision…' : decision === 'approve' ? 'Approve changes' : 'Reject changes'}</button></div></form> : null}</div></dialog>;
}
