'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- Public links intentionally reload the document so saved admin content never uses a prefetched public page. */

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Check, ChevronRight, CircleAlert, ClipboardCheck, Clock3, FileQuestion, FolderKanban, Inbox, LayoutDashboard, LoaderCircle, LogOut, Mail, MessageSquareText, Package, Phone, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Sparkles, Trophy, Users, X } from 'lucide-react';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { AdminContentEditor, type ContentSection } from '@/components/admin/AdminContentEditor';
import { StaffManagement } from '@/components/admin/StaffManagement';
import { ChangeRequests } from '@/components/admin/ChangeRequests';
import type { AdminContent, AdminInquiry, ChangeRequest, ChangeRequestSummary, ContentRevisions, DashboardActor, InquiryStatus, StaffAccount } from '@/lib/admin/types';

const statusLabels: Record<InquiryStatus, string> = { new: 'New', in_progress: 'In progress', won: 'Won', archived: 'Archived' };
const statusStyles: Record<InquiryStatus, string> = {
  new: 'border-orange-200 bg-orange-50 text-orange-800',
  in_progress: 'border-orange-300 bg-white text-orange-800',
  won: 'border-orange-600 bg-orange-600 text-white',
  archived: 'border-orange-100 bg-white text-black/65',
};
const inputClass = 'min-h-11 w-full min-w-0 rounded-xl border border-orange-200 bg-white px-3.5 py-2.5 text-sm text-black outline-none transition focus:border-orange-600 focus:ring-2 focus:ring-orange-100';
const secondaryButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-orange-200 bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:border-orange-400 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50';
const primaryButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#ff6600] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50';
const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Colombo' });

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : dateFormatter.format(date);
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase();
}

function StatusBadge({ status }: { status: InquiryStatus }) {
  return <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.6875rem] font-bold ${statusStyles[status]}`}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{statusLabels[status]}</span>;
}

function csvCell(value: unknown) {
  const text = String(value ?? '');
  // Prevent spreadsheet software interpreting submitted values as formulas.
  const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

type DashboardView = 'overview' | 'inquiries' | ContentSection | 'staff' | 'approvals';
const viewTitles: Record<DashboardView, string> = { overview: 'Overview', inquiries: 'Enquiries', packages: 'Packages', projects: 'Project demos', faqs: 'Questions', staff: 'Staff', approvals: 'Approvals' };
const viewHeadings: Record<DashboardView, string> = { overview: 'A clear view of what’s next.', inquiries: 'Every enquiry. One place.', packages: 'The right package. Clearly defined.', projects: 'Let your work do the talking.', faqs: 'Good questions. Clear answers.', staff: 'The right people. The right access.', approvals: 'Every change, reviewed.' };
const viewDescriptions: Record<DashboardView, string> = { overview: 'Manage your website content and turn new conversations into projects.', inquiries: 'Find a request, review the details, and keep the conversation moving.', packages: 'Manage the pricing and details visitors see when choosing a package.', projects: 'Keep your portfolio fresh with project details and live demo links.', faqs: 'Update the questions and answers that help visitors get started.', staff: 'Create and manage staff accounts. Staff cannot register themselves.', approvals: 'Review proposed edits and keep track of every decision.' };

export function AdminDashboard({ initialInquiries, initialContent, actor, initialContentRevisions, initialInquiryRevisions, initialApprovals, initialStaff, initialPendingCount }: { initialInquiries: AdminInquiry[]; initialContent: AdminContent; actor: DashboardActor; initialContentRevisions: ContentRevisions; initialInquiryRevisions: Record<string, string>; initialApprovals: ChangeRequestSummary[]; initialStaff: StaffAccount[]; initialPendingCount: number }) {
  const router = useRouter();
  const isAdmin = actor.role === 'admin';
  const [inquiries, setInquiries] = useState(initialInquiries);
  const [view, setView] = useState<DashboardView>('overview');
  const [content, setContent] = useState(initialContent);
  const [contentRevisions, setContentRevisions] = useState(initialContentRevisions);
  const [inquiryRevisions, setInquiryRevisions] = useState(initialInquiryRevisions);
  const [approvals, setApprovals] = useState(initialApprovals);
  const [staff, setStaff] = useState(initialStaff);
  const [pendingCount, setPendingCount] = useState(initialPendingCount);
  const [contentDirty, setContentDirty] = useState(false);
  const [contentEpoch, setContentEpoch] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | InquiryStatus>('all');
  const [selected, setSelected] = useState<AdminInquiry | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [notice, setNotice] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  function changeView(next: DashboardView) {
    if (next === view) return;
    if (contentDirty && !window.confirm('Discard your unsaved content changes and switch sections?')) return;
    setContentDirty(false);
    setView(next);
  }

  const counts = useMemo(() => inquiries.reduce((result, inquiry) => {
    result[inquiry.status] += 1;
    return result;
  }, { new: 0, in_progress: 0, won: 0, archived: 0 }), [inquiries]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return inquiries.filter((inquiry) => (status === 'all' || inquiry.status === status) && (!query || [inquiry.fullName, inquiry.email, inquiry.phoneNumber, inquiry.businessName, inquiry.serviceRequired, inquiry.preferredPackage].some((value) => value?.toLowerCase().includes(query)))).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [inquiries, search, status]);

  const serviceSummary = useMemo(() => {
    const services = new Map<string, number>();
    inquiries.forEach((inquiry) => services.set(inquiry.serviceRequired, (services.get(inquiry.serviceRequired) ?? 0) + 1));
    return [...services.entries()].sort((a, b) => b[1] - a[1]);
  }, [inquiries]);

  const visibleInquiries = view === 'overview' && !search && status === 'all' ? filtered.slice(0, 5) : filtered;

  function openInquiry(inquiry: AdminInquiry, trigger: HTMLElement) {
    triggerRef.current = trigger;
    setSelected(inquiry);
  }

  function closeInquiry() {
    setSelected(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function showAll() {
    setView('inquiries');
    setStatus('all');
    setSearch('');
  }

  function exportCsv() {
    const headers = ['Received', 'Name', 'Email', 'Phone', 'Business', 'Service', 'Package', 'Budget', 'Description', 'Status', 'Notes', 'Email delivery'];
    const rows = filtered.map((inquiry) => [inquiry.createdAt, inquiry.fullName, inquiry.email, inquiry.phoneNumber, inquiry.businessName, inquiry.serviceRequired, inquiry.preferredPackage, inquiry.estimatedBudget, inquiry.projectDescription, statusLabels[inquiry.status], inquiry.notes, inquiry.emailStatus]);
    const blob = new Blob(['\uFEFF', [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `syscode-enquiries-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice({ type: 'success', text: `Exported ${filtered.length} ${filtered.length === 1 ? 'enquiry' : 'enquiries'}.` });
  }

  async function refreshInquiries() {
    setRefreshing(true);
    setNotice(null);
    try {
      const response = await fetch('/api/admin/inquiries', { cache: 'no-store' });
      if (response.status === 401) { router.replace('/admin/login'); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to refresh enquiries. Please try again.');
      setInquiries(data.inquiries);
      setInquiryRevisions(data.revisions);
      setNotice({ type: 'success', text: 'Enquiries are up to date.' });
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Unable to refresh enquiries. Please try again.' });
    } finally { setRefreshing(false); }
  }

  async function refreshPublished() {
    const [contentResponse, inquiriesResponse] = await Promise.all([fetch('/api/admin/content', { cache: 'no-store' }), fetch('/api/admin/inquiries', { cache: 'no-store' })]);
    if (contentResponse.status === 401 || inquiriesResponse.status === 401) { router.replace('/admin/login'); return; }
    const [contentData, inquiriesData] = await Promise.all([contentResponse.json(), inquiriesResponse.json()]);
    if (!contentResponse.ok || !inquiriesResponse.ok) throw new Error('The review was saved, but the dashboard could not refresh. Refresh the workspace to see the latest data.');
    setContent(contentData.content); setContentRevisions(contentData.revisions); setContentEpoch((current) => current + 1);
    setInquiries(inquiriesData.inquiries); setInquiryRevisions(inquiriesData.revisions);
    router.refresh();
  }

  function addSubmission(request: ChangeRequest) {
    setApprovals((current) => [request, ...current.filter((item) => item.id !== request.id)]);
    setPendingCount((current) => current + 1);
  }

  async function logout() {
    if (contentDirty && !window.confirm('Discard your unsaved content changes and sign out?')) return;
    setLoggingOut(true);
    try {
      const response = await fetch('/api/admin/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Unable to sign out. Please try again.');
      router.replace('/admin/login');
      router.refresh();
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Unable to sign out. Please try again.' });
      setLoggingOut(false);
    }
  }

  const navigation = [
    { id: 'overview' as const, label: 'Overview', icon: LayoutDashboard },
    { id: 'inquiries' as const, label: 'Enquiries', icon: Inbox },
    { id: 'packages' as const, label: 'Packages', icon: Package },
    { id: 'projects' as const, label: 'Project demos', icon: FolderKanban },
    { id: 'faqs' as const, label: 'Questions', icon: FileQuestion },
    { id: 'approvals' as const, label: isAdmin ? 'Approvals' : 'My submissions', icon: ClipboardCheck },
    ...(isAdmin ? [{ id: 'staff' as const, label: 'Staff', icon: Users }] : []),
  ];

  return (
    <div className="min-h-dvh min-w-0 bg-white text-black lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]" data-admin-dashboard>
      <aside className="hidden min-w-0 bg-[#ff6600] text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:overflow-y-auto lg:px-5 lg:py-8">
        <a href="/" aria-label="SysCode public website" className="mx-2 block"><BrandLogo /></a>
        <p className="mx-2 mt-4 text-[0.625rem] font-bold tracking-[0.24em] text-white/90 uppercase">{isAdmin ? 'Admin workspace' : 'Staff workspace'}</p>
        <nav aria-label="Dashboard" className="mt-12 space-y-2">
          {navigation.map(({ id, label, icon: Icon }) => <button key={id} type="button" data-admin-view={id} aria-current={view === id ? 'page' : undefined} onClick={() => changeView(id)} className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-4 py-3 text-left font-heading text-sm font-bold transition ${view === id ? 'bg-white text-orange-700 shadow-sm' : 'text-white hover:bg-white/15'}`}><Icon aria-hidden="true" className="h-4.5 w-4.5" />{label}{id === 'approvals' && pendingCount > 0 ? <span className={`ml-auto min-w-6 rounded-md px-1.5 py-0.5 text-center text-[0.625rem] ${view === id ? 'bg-orange-50 text-orange-800' : 'bg-white/20 text-white'}`}>{pendingCount}</span> : null}{id === 'inquiries' && counts.new > 0 ? <span className={`ml-auto min-w-6 rounded-md px-1.5 py-0.5 text-center text-[0.625rem] ${view === id ? 'bg-orange-50 text-orange-800' : 'bg-white/20 text-white'}`}>{counts.new}</span> : null}</button>)}
        </nav>
        <div className="mt-auto pt-12">
          <div className="rounded-2xl border border-white/25 p-4"><ShieldCheck aria-hidden="true" className="h-5 w-5" /><p className="mt-3 font-heading text-sm font-bold">Your business, in view.</p><p className="mt-1 text-xs leading-6 text-white/90">Every conversation starts with an enquiry. Keep the next step clear.</p><a href="/" className="mt-4 inline-flex min-h-9 items-center gap-2 text-xs font-bold">View website <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /></a></div>
          <div className="mt-6 flex min-w-0 items-center gap-3 border-t border-white/25 pt-5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white font-heading text-sm font-bold text-orange-700">{initials(actor.name || actor.email)}</span><div className="min-w-0"><p className="text-xs font-bold">{isAdmin ? 'Administrator' : actor.name}</p><p className="mt-0.5 truncate text-[0.625rem] text-white/90" title={actor.email}>{actor.email}</p></div></div>
          <button type="button" onClick={logout} disabled={loggingOut} className="mt-4 flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-xs font-semibold text-white transition hover:bg-white/15 disabled:opacity-60">{loggingOut ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <LogOut aria-hidden="true" className="h-4 w-4" />}Sign out</button>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="border-b border-orange-100 bg-white">
          <div className="flex items-center justify-between gap-3 bg-[#ff6600] px-4 py-4 text-white sm:px-6 lg:hidden"><a href="/" aria-label="SysCode public website"><BrandLogo className="!w-32" /></a><button type="button" onClick={logout} disabled={loggingOut} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-white/40 px-3 text-xs font-bold text-white">{loggingOut ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <LogOut aria-hidden="true" className="h-4 w-4" />}Sign out</button></div>
          <div className="mx-auto flex max-w-[100rem] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-9"><p className="flex min-w-0 items-center gap-2 text-xs"><span className="hidden text-black/55 sm:inline">Workspace</span><ChevronRight aria-hidden="true" className="hidden h-3 w-3 text-orange-500 sm:block" /><span className="font-semibold">{view === 'approvals' && !isAdmin ? 'My submissions' : viewTitles[view]}</span></p><a href="/" className="inline-flex min-h-9 items-center gap-2 text-xs font-semibold text-orange-800">View website <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /></a></div>
          <nav aria-label="Dashboard" className="flex min-w-0 gap-1 overflow-x-auto px-4 sm:px-6 lg:hidden">{navigation.map(({ id, label, icon: Icon }) => <button type="button" key={id} data-admin-view={id} aria-current={view === id ? 'page' : undefined} onClick={() => changeView(id)} className={`inline-flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-xs font-bold ${view === id ? 'border-orange-500 text-orange-800' : 'border-transparent text-black/65'}`}><Icon aria-hidden="true" className="h-4 w-4" />{label}</button>)}</nav>
        </header>

        <main id="main-content" tabIndex={-1} className="mx-auto min-w-0 max-w-[100rem] px-4 py-7 outline-none sm:px-6 sm:py-9 lg:px-9">
          <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="flex items-center gap-2 text-[0.625rem] font-bold tracking-[0.18em] text-orange-800 uppercase"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-orange-500" />SysCode administration</p><h1 className="mt-2 text-3xl leading-tight font-bold tracking-[-0.045em] sm:text-4xl">{viewHeadings[view]}</h1><p className="mt-2 max-w-xl text-sm leading-6 text-black/65">{viewDescriptions[view]}</p></div>{view === 'overview' || view === 'inquiries' ? <div className="flex flex-wrap gap-2"><button type="button" onClick={refreshInquiries} disabled={refreshing} className={secondaryButton}><RefreshCw aria-hidden="true" className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Refresh</button><button type="button" onClick={exportCsv} disabled={!filtered.length} className={primaryButton}><ArrowDownToLine aria-hidden="true" className="h-4 w-4" />Export CSV</button></div> : null}</div>

          {notice ? <div role={notice.type === 'error' ? 'alert' : 'status'} className="mt-5 flex items-start gap-3 rounded-xl border border-orange-200 bg-white px-4 py-3 text-sm">{notice.type === 'error' ? <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-orange-800" /> : <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-orange-800" />}<p className="flex-1">{notice.text}</p><button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notification" className="-m-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-orange-50"><X aria-hidden="true" className="h-4 w-4" /></button></div> : null}

          {!isAdmin ? <p role="note" className="mt-5 flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50/50 p-4 text-xs leading-6"><ClipboardCheck aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-orange-700" />Staff access: all content edits, enquiry statuses, and private notes require admin approval before they are applied.</p> : null}

          {view === 'overview' || view === 'inquiries' ? <><section aria-label="Enquiry statistics" className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Total enquiries', count: inquiries.length, text: 'All requests received', icon: Inbox, filter: 'all' as const },
              { label: 'New enquiries', count: counts.new, text: 'Ready for your first reply', icon: Sparkles, filter: 'new' as const },
              { label: 'In progress', count: counts.in_progress, text: 'Conversations moving forward', icon: Clock3, filter: 'in_progress' as const },
              { label: 'Projects won', count: counts.won, text: 'Enquiries marked as won', icon: Trophy, filter: 'won' as const },
            ].map(({ label, count, text, icon: Icon, filter }) => <button key={label} type="button" onClick={() => { setStatus(filter); setSearch(''); setView('inquiries'); }} className="group min-w-0 rounded-2xl border border-orange-200/80 bg-white p-5 text-left shadow-[0_4px_20px_-12px_rgba(255,102,0,0.25)] transition hover:-translate-y-0.5 hover:border-orange-400 motion-reduce:transform-none"><span className="flex items-center justify-between gap-2 text-xs font-semibold text-black/65">{label}<Icon aria-hidden="true" className="h-4 w-4 text-orange-600" /></span><span className="mt-4 flex items-end justify-between gap-2"><span className="font-heading text-4xl leading-none font-bold tracking-[-0.05em]">{count.toLocaleString('en-GB')}</span><ArrowUpRight aria-hidden="true" className="h-4 w-4 text-orange-600 transition group-hover:translate-x-0.5 motion-reduce:transform-none" /></span><span className="mt-3 block text-[0.6875rem] leading-5 text-black/55">{text}</span></button>)}
          </section>

          <div className={`mt-7 grid min-w-0 gap-5 ${view === 'overview' ? '2xl:grid-cols-[minmax(0,2.2fr)_minmax(15rem,1fr)]' : ''}`}>
            <section className="min-w-0 overflow-hidden rounded-2xl border border-orange-200/80 bg-white" aria-labelledby="enquiry-heading">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-orange-100 px-4 py-5 sm:px-6"><div><h2 id="enquiry-heading" className="text-lg font-bold tracking-tight">{view === 'overview' ? 'Latest enquiries' : 'Enquiries'}<span className="ml-2 rounded-md bg-orange-50 px-2 py-1 align-middle font-sans text-[0.625rem] font-bold text-orange-800">{view === 'overview' ? inquiries.length : filtered.length}</span></h2><p className="mt-1 text-xs text-black/55">{view === 'overview' ? 'Your most recent project conversations.' : 'Select an enquiry to view and update its details.'}</p></div>{view === 'overview' ? <button type="button" onClick={showAll} className="inline-flex min-h-9 items-center gap-1 text-xs font-bold text-orange-800">View all <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /></button> : null}</div>
              <div className="grid min-w-0 gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_11rem] sm:px-6"><label className="relative block min-w-0"><span className="sr-only">Search enquiries</span><Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-orange-600" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email or service" className={`${inputClass} pl-10 placeholder:text-black/45!`} /></label><label className="relative block min-w-0"><span className="sr-only">Filter by status</span><SlidersHorizontal aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-orange-600" /><select value={status} onChange={(event) => setStatus(event.target.value as 'all' | InquiryStatus)} className={`${inputClass} pl-10`}><option value="all">All statuses</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>

              {!visibleInquiries.length ? <div className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-orange-100 bg-orange-50"><Inbox aria-hidden="true" className="h-6 w-6 text-orange-600" /></span><h3 className="mt-5 text-lg font-bold">{inquiries.length ? 'No matching enquiries' : 'Your next project starts here.'}</h3><p className="mt-2 max-w-sm text-xs leading-6 text-black/60">{inquiries.length ? 'Try a different search or status to find the request you’re looking for.' : 'Requests submitted through your website’s quotation form will appear here, ready for you to review.'}</p>{inquiries.length ? <button type="button" onClick={() => { setSearch(''); setStatus('all'); }} className={`${secondaryButton} mt-5`}>Clear filters</button> : <a href="/#contact" className="mt-5 inline-flex min-h-10 items-center gap-2 text-xs font-bold text-orange-800">View quotation form <ArrowUpRight aria-hidden="true" className="h-4 w-4" /></a>}</div> : <>
                <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[36rem] text-left text-xs"><caption className="sr-only">{view === 'overview' ? 'Latest' : 'Filtered'} quote enquiries</caption><thead className="border-y border-orange-100 bg-orange-50/50 text-[0.625rem] tracking-[0.08em] text-black/55 uppercase"><tr><th scope="col" className="px-6 py-3 font-semibold">Client</th><th scope="col" className="px-4 py-3 font-semibold">Service</th><th scope="col" className="px-4 py-3 font-semibold">Status</th><th scope="col" className="px-4 py-3 font-semibold">Received</th><th scope="col" className="py-3 pr-4"><span className="sr-only">Actions</span></th></tr></thead><tbody className="divide-y divide-orange-100">{visibleInquiries.map((inquiry) => <tr key={inquiry.id} className="group transition hover:bg-orange-50/40"><th scope="row" className="max-w-64 px-6 py-4 font-normal"><div className="flex min-w-0 items-center gap-3"><span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-orange-100 font-heading text-[0.625rem] font-bold text-orange-800">{initials(inquiry.fullName)}</span><div className="min-w-0"><button type="button" onClick={(event) => openInquiry(inquiry, event.currentTarget)} className="max-w-full text-left text-xs font-bold break-words hover:text-orange-800 hover:underline">{inquiry.fullName}</button><p className="mt-1 text-[0.625rem] break-all text-black/55">{inquiry.businessName || inquiry.email}</p></div></div></th><td className="max-w-48 px-4 py-4 text-black/75">{inquiry.serviceRequired}</td><td className="px-4 py-4"><StatusBadge status={inquiry.status} /></td><td className="whitespace-nowrap px-4 py-4 text-[0.625rem] text-black/60">{formatDate(inquiry.createdAt)}</td><td className="py-4 pr-4"><button type="button" aria-label={`View enquiry from ${inquiry.fullName}`} onClick={(event) => openInquiry(inquiry, event.currentTarget)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-orange-100 text-orange-700 transition hover:border-orange-300 hover:bg-white"><ArrowUpRight aria-hidden="true" className="h-4 w-4" /></button></td></tr>)}</tbody></table></div>
                <ul className="divide-y divide-orange-100 border-t border-orange-100 md:hidden">{visibleInquiries.map((inquiry) => <li key={inquiry.id}><button type="button" onClick={(event) => openInquiry(inquiry, event.currentTarget)} className="w-full px-4 py-5 text-left transition hover:bg-orange-50/40 sm:px-6"><span className="flex items-start justify-between gap-3"><span className="min-w-0"><span className="block text-sm font-bold break-words">{inquiry.fullName}</span><span className="mt-1 block text-xs break-all text-black/55">{inquiry.businessName || inquiry.email}</span></span><StatusBadge status={inquiry.status} /></span><span className="mt-4 flex items-end justify-between gap-3"><span className="min-w-0"><span className="block text-xs text-black/75">{inquiry.serviceRequired}</span><span className="mt-1 block text-[0.625rem] text-black/50">{formatDate(inquiry.createdAt)}</span></span><ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0 text-orange-600" /></span></button></li>)}</ul>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-orange-100 px-4 py-3 text-[0.625rem] text-black/55 sm:px-6"><p>Showing {visibleInquiries.length} of {filtered.length} {filtered.length === 1 ? 'enquiry' : 'enquiries'}</p><span>Newest first</span></div>
              </>}
            </section>

            {view === 'overview' ? <aside className="min-w-0 space-y-5"><section className="rounded-2xl border border-orange-200/80 bg-white p-5 sm:p-6" aria-labelledby="services-heading"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-700"><MessageSquareText aria-hidden="true" className="h-4 w-4" /></span><h2 id="services-heading" className="mt-4 text-lg font-bold tracking-tight">What clients need</h2><p className="mt-1 text-xs leading-5 text-black/55">Requests by service, from your actual enquiries.</p>{serviceSummary.length ? <ul className="mt-6 space-y-5">{serviceSummary.map(([service, count]) => <li key={service}><div className="flex items-start justify-between gap-3 text-xs"><span className="min-w-0 font-medium">{service}</span><span className="shrink-0 font-bold tabular-nums">{count}</span></div><div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-orange-50"><div className="h-full rounded-full bg-[#ff6600]" style={{ width: `${(count / inquiries.length) * 100}%` }} /></div></li>)}</ul> : <p className="mt-6 rounded-xl border border-dashed border-orange-200 px-4 py-5 text-xs leading-6 text-black/55">Your service summary will take shape as new requests arrive.</p>}</section><section className="rounded-2xl border border-orange-200/80 bg-gradient-to-br from-orange-50/80 via-white to-white p-5 sm:p-6"><p className="text-[0.625rem] font-bold tracking-[0.14em] text-orange-800 uppercase">Next step</p><h2 className="mt-3 text-xl leading-tight font-bold tracking-tight">{counts.new ? `${counts.new} ${counts.new === 1 ? 'conversation is' : 'conversations are'} waiting.` : 'Make room for the next idea.'}</h2><p className="mt-3 text-xs leading-6 text-black/60">{counts.new ? 'Review new requests, add your notes, and move the right projects forward.' : 'Keep every request organised with statuses and private notes.'}</p><button type="button" onClick={() => { setView('inquiries'); setStatus(counts.new ? 'new' : 'all'); setSearch(''); }} className="mt-5 inline-flex min-h-10 items-center gap-2 text-xs font-bold text-orange-800">{counts.new ? 'Review new enquiries' : 'Open enquiries'}<ArrowRight aria-hidden="true" className="h-4 w-4" /></button></section></aside> : null}
          </div>
          {view === 'overview' ? <section aria-label="Website content" className="mt-5 grid gap-3 sm:grid-cols-3">{[{ section: 'packages' as const, title: 'Packages', text: 'Pricing & inclusions', count: content.packages.length, icon: Package }, { section: 'projects' as const, title: 'Project demos', text: 'Your portfolio & demo links', count: content.projects.length, icon: FolderKanban }, { section: 'faqs' as const, title: 'Questions', text: 'Helpful answers for visitors', count: content.faqs.length, icon: FileQuestion }].map(({ section, title, text, count, icon: Icon }) => <button type="button" key={section} onClick={() => setView(section)} className="flex min-w-0 items-center gap-3 rounded-2xl border border-orange-200/80 bg-white p-5 text-left transition hover:border-orange-400"><Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-orange-600" /><span className="min-w-0 flex-1"><span className="block text-sm font-bold">{title}<span className="ml-2 text-xs text-orange-800">{count}</span></span><span className="mt-1 block text-[0.625rem] leading-5 text-black/55">{text}</span></span><ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0 text-orange-700" /></button>)}</section> : null}</> : view === 'staff' && isAdmin ? <StaffManagement initialStaff={staff} onStaffChanged={setStaff} /> : view === 'approvals' ? <ChangeRequests initialRequests={approvals} isAdmin={isAdmin} onApplied={refreshPublished} onRequestsChanged={setApprovals} pendingCount={pendingCount} onPendingCountChanged={setPendingCount} /> : view === 'packages' || view === 'projects' || view === 'faqs' ? <AdminContentEditor key={`${view}-${contentEpoch}`} section={view} initialContent={content} baseHash={contentRevisions[view]} isStaff={!isAdmin} onSubmitted={addSubmission} onSaved={(updated, revisions) => { setContent(updated); setContentRevisions(revisions); }} onDirtyChange={setContentDirty} /> : null}
          <p className="mt-8 flex flex-wrap items-center gap-2 text-[0.625rem] leading-5 text-black/45"><ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-orange-600" />Private workspace<span aria-hidden="true">·</span><span className="break-all">Signed in as {actor.email}</span></p>
        </main>
      </div>
      {selected ? <InquiryDetails key={selected.id} inquiry={selected} baseHash={inquiryRevisions[selected.id]} isStaff={!isAdmin} onSubmitted={addSubmission} onClose={closeInquiry} onSaved={(updated, revision) => { setInquiryRevisions((current) => ({ ...current, [updated.id]: revision })); setInquiries((current) => current.map((item) => item.id === updated.id ? updated : item)); setSelected(updated); setNotice({ type: 'success', text: `Updated ${updated.fullName}’s enquiry.` }); }} /> : null}
    </div>
  );
}

function InquiryDetails({ inquiry, baseHash, isStaff, onClose, onSaved, onSubmitted }: { inquiry: AdminInquiry; baseHash: string; isStaff: boolean; onClose: () => void; onSaved: (inquiry: AdminInquiry, revision: string) => void; onSubmitted: (request: ChangeRequest) => void }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState(inquiry.status);
  const [notes, setNotes] = useState(inquiry.notes);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [submitted, setSubmitted] = useState<{ status: InquiryStatus; notes: string } | null>(null);
  const dirty = status !== (submitted?.status ?? inquiry.status) || notes !== (submitted?.notes ?? inquiry.notes);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    return () => { dialog?.close(); document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/inquiries/${encodeURIComponent(inquiry.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, notes, baseHash }) });
      if (response.status === 401) { router.replace('/admin/login'); return; }
      const data = await response.json();
      if (response.status === 409) throw new Error('This enquiry has changed since you opened it. Close it, refresh enquiries, and reapply your changes to the latest version.');
      if (!response.ok) throw new Error(data.error || 'Unable to save changes. Please try again.');
      if (response.status === 202 || data.status === 'pending') {
        setSubmitted({ status, notes }); onSubmitted(data.request);
        setFeedback({ type: 'success', text: 'Submitted for admin approval. The saved status and notes have not changed.' });
      } else {
        setSubmitted(null); onSaved(data.inquiry, data.revision);
        setFeedback({ type: 'success', text: 'Changes saved.' });
      }
    } catch (error) {
      setFeedback({ type: 'error', text: error instanceof Error ? error.message : 'Unable to save changes. Please try again.' });
    } finally { setSaving(false); }
  }

  function requestClose() {
    if (!saving && (!dirty || window.confirm('Discard your unsaved enquiry changes?'))) onClose();
  }

  const emailDelivery = { sent: 'Notification email sent', failed: 'Notification email could not be sent. The enquiry is saved here.', not_configured: 'Email notifications are not configured. The enquiry is saved here.', pending: 'Email notification pending' }[inquiry.emailStatus];

  return <dialog ref={dialogRef} onCancel={(event) => { event.preventDefault(); requestClose(); }} onClick={(event) => { if (event.target === event.currentTarget) requestClose(); }} aria-labelledby="inquiry-dialog-title" className="fixed inset-0 m-auto max-h-[94dvh] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto rounded-2xl border border-orange-200 bg-white p-0 text-black shadow-[0_24px_100px_rgba(255,102,0,0.2)] backdrop:bg-white/85 backdrop:backdrop-blur-sm">
    <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-orange-100 bg-white px-5 py-5 sm:px-7"><div className="min-w-0"><p className="text-[0.625rem] font-bold tracking-[0.16em] text-orange-800 uppercase">Enquiry details</p><h2 id="inquiry-dialog-title" className="mt-1.5 text-2xl leading-tight font-bold tracking-tight break-words">{inquiry.fullName}</h2><p className="mt-1.5 text-xs text-black/55">Received {formatDate(inquiry.createdAt)}</p></div><button type="button" onClick={requestClose} disabled={saving} aria-label="Close enquiry" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-orange-200 bg-white text-black transition hover:bg-orange-50 disabled:opacity-50"><X aria-hidden="true" className="h-4 w-4" /></button></div>
    <div className="px-5 py-6 sm:px-7"><div className="flex flex-wrap items-center gap-2"><StatusBadge status={inquiry.status} />{inquiry.businessName ? <span className="text-xs break-words text-black/65">{inquiry.businessName}</span> : null}</div><div className="mt-5 grid gap-2 sm:grid-cols-2"><a href={`mailto:${inquiry.email}`} className="flex min-w-0 items-center gap-2 rounded-xl border border-orange-100 p-3 text-xs text-orange-800 hover:border-orange-400"><Mail aria-hidden="true" className="h-4 w-4 shrink-0" /><span className="break-all">{inquiry.email}</span></a><a href={`tel:${inquiry.phoneNumber.replace(/[^+\d]/g, '')}`} className="flex min-w-0 items-center gap-2 rounded-xl border border-orange-100 p-3 text-xs text-orange-800 hover:border-orange-400"><Phone aria-hidden="true" className="h-4 w-4 shrink-0" /><span className="break-all">{inquiry.phoneNumber}</span></a></div><dl className="mt-6 grid gap-5 border-y border-orange-100 py-5 sm:grid-cols-2">{[['Service', inquiry.serviceRequired], ['Preferred package', inquiry.preferredPackage], ['Estimated budget', inquiry.estimatedBudget], ['Last updated', formatDate(inquiry.updatedAt)]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-[0.625rem] font-semibold tracking-wide text-black/55 uppercase">{label}</dt><dd className="mt-1.5 text-xs leading-6 font-medium break-words">{value}</dd></div>)}</dl><h3 className="mt-6 text-sm font-bold">About the project</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-7 break-words text-black/75">{inquiry.projectDescription}</p><p className="mt-5 flex items-start gap-2 rounded-xl border border-orange-100 px-3 py-3 text-[0.625rem] leading-5 text-black/60"><Mail aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-700" />{emailDelivery}</p>
      <form data-inquiry-form onSubmit={save} className="mt-7 border-t border-orange-100 pt-6"><h3 className="text-base font-bold">Keep the next step clear.</h3><p className="mt-1 text-xs leading-6 text-black/55">{isStaff ? 'Status and notes are private. Every change you submit requires admin approval.' : 'Status and notes are private to your admin workspace.'}</p><label htmlFor="inquiry-status" className="mt-5 block text-xs font-bold">Enquiry status</label><select id="inquiry-status" value={status} disabled={saving} onChange={(event) => { setStatus(event.target.value as InquiryStatus); setFeedback(null); }} className={`${inputClass} mt-2`}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><label htmlFor="inquiry-notes" className="mt-5 block text-xs font-bold">Private notes</label><textarea id="inquiry-notes" value={notes} maxLength={10000} rows={5} disabled={saving} onChange={(event) => { setNotes(event.target.value); setFeedback(null); }} placeholder="Add the next action, a call summary, or project context…" className={`${inputClass} mt-2 resize-y placeholder:text-black/45!`} /><p className="mt-1 text-right text-[0.625rem] text-black/45">{notes.length.toLocaleString('en-GB')} / 10,000</p>{feedback ? <p role={feedback.type === 'error' ? 'alert' : 'status'} className="mt-4 flex items-center gap-2 text-xs text-orange-800">{feedback.type === 'error' ? <CircleAlert aria-hidden="true" className="h-4 w-4 shrink-0" /> : <Check aria-hidden="true" className="h-4 w-4 shrink-0" />}{feedback.text}</p> : null}<div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="text-[0.625rem] text-black/55">{dirty ? 'You have unsaved changes.' : submitted ? 'Submission awaiting admin approval.' : 'You are viewing the saved version.'}</p><button type="submit" disabled={saving || !dirty} className={primaryButton}>{saving ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Check aria-hidden="true" className="h-4 w-4" />}{saving ? 'Saving…' : isStaff ? 'Submit for approval' : 'Save changes'}</button></div></form></div>
  </dialog>;
}
