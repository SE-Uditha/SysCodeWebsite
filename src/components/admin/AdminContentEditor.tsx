'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronDown, CircleAlert, ExternalLink, FileQuestion, FolderKanban, LoaderCircle, Package, Plus, Save, Trash2, X } from 'lucide-react';
import type { AdminContent, ChangeRequest, ContentRevisions } from '@/lib/admin/types';
import type { Project, ProjectCategory } from '@/data/projects';
import { ProjectPreview } from '@/components/sections/ProjectPreview';
import { isSafeProjectMediaUrl } from '@/lib/project-media';

export type ContentSection = 'packages' | 'projects' | 'faqs';

const inputClass = 'min-h-11 w-full min-w-0 rounded-xl border border-orange-200 bg-white px-3.5 py-2.5 text-sm text-black outline-none transition focus:border-orange-600 focus:ring-2 focus:ring-orange-100';
const secondaryButton = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-orange-200 bg-white px-3 py-2 text-xs font-bold text-black transition hover:border-orange-400 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-40';
const sectionDetails = {
  packages: { title: 'Package details', singular: 'package', description: 'Keep your pricing, inclusions, and package descriptions up to date.', icon: Package, href: '/#pricing' },
  projects: { title: 'Project demos', singular: 'project', description: 'Show your work and give visitors a direct link to explore a demo.', icon: FolderKanban, href: '/#portfolio' },
  faqs: { title: 'Questions & answers', singular: 'question', description: 'Help visitors find clear answers before starting a conversation.', icon: FileQuestion, href: '/#faq' },
};
// crypto.randomUUID is unavailable on non-secure origins such as a LAN IP address.
function randomId(length = 8) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => (byte % 36).toString(36)).join('');
}
const categories: ProjectCategory[] = ['Business Websites', 'E-Commerce', 'Web Applications', 'POS Systems'];

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block min-w-0"><span className="mb-2 block text-xs font-bold">{label}</span>{children}{hint ? <span className="mt-1.5 block text-[0.625rem] leading-5 text-black/55">{hint}</span> : null}</label>;
}

function FeatureList({ features, suggestions, onChange }: { features: string[]; suggestions: string[]; onChange: (features: string[]) => void }) {
  const [text, setText] = useState('');
  const used = new Set(features.map((line) => line.trim().toLowerCase()));
  const available = suggestions.filter((line) => !used.has(line.toLowerCase()));
  const full = features.length >= 30;

  function add(value: string) {
    const line = value.trim();
    if (!line || full || used.has(line.toLowerCase())) return;
    onChange([...features.filter((item) => item.trim()), line]);
    setText('');
  }
  function move(index: number, direction: -1 | 1) {
    const next = [...features];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    onChange(next);
  }

  return <fieldset className="min-w-0">
    <legend className="mb-2 block text-xs font-bold">Included features <span className="font-normal text-black/55">({features.filter((item) => item.trim()).length}/30)</span></legend>
    {features.length ? <ul className="space-y-2">{features.map((feature, featureIndex) => <li key={featureIndex} className="flex min-w-0 items-center gap-1.5">
      <input aria-label={`Feature ${featureIndex + 1}`} maxLength={300} value={feature} onChange={(event) => onChange(features.map((item, itemIndex) => itemIndex === featureIndex ? event.target.value : item))} className={inputClass} />
      <button type="button" aria-label={`Move feature ${featureIndex + 1} up`} disabled={featureIndex === 0} onClick={() => move(featureIndex, -1)} className={`${secondaryButton} shrink-0 !px-2.5`}><ArrowUp aria-hidden="true" className="h-3.5 w-3.5" /></button>
      <button type="button" aria-label={`Move feature ${featureIndex + 1} down`} disabled={featureIndex === features.length - 1} onClick={() => move(featureIndex, 1)} className={`${secondaryButton} shrink-0 !px-2.5`}><ArrowDown aria-hidden="true" className="h-3.5 w-3.5" /></button>
      <button type="button" aria-label={`Remove feature ${featureIndex + 1}`} onClick={() => onChange(features.filter((_, itemIndex) => itemIndex !== featureIndex))} className={`${secondaryButton} shrink-0 !px-2.5 text-orange-800`}><Trash2 aria-hidden="true" className="h-3.5 w-3.5" /></button>
    </li>)}</ul> : <p className="rounded-xl border border-dashed border-orange-200 p-3 text-xs text-black/60">No features yet. Add one below.</p>}
    <div className="mt-3 flex gap-2">
      <input aria-label="New feature" maxLength={300} value={text} disabled={full} placeholder="Type a feature, for example Free domain for 1 year" onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(text); } }} className={inputClass} />
      <button type="button" onClick={() => add(text)} disabled={!text.trim() || full} className={`${secondaryButton} shrink-0`}><Plus aria-hidden="true" className="h-3.5 w-3.5" />Add</button>
    </div>
    {available.length ? <div className="mt-4"><p className="mb-2 text-[0.625rem] font-semibold text-black/60">Or choose from features used in your other packages</p><div className="flex flex-wrap gap-1.5">{available.map((line) => <button key={line} type="button" disabled={full} onClick={() => add(line)} className="inline-flex max-w-full items-center gap-1 rounded-full border border-orange-200 bg-white px-2.5 py-1.5 text-left text-[0.6875rem] leading-4 text-black transition hover:border-orange-400 hover:bg-orange-50 disabled:opacity-40"><Plus aria-hidden="true" className="h-3 w-3 shrink-0 text-orange-700" /><span className="min-w-0 break-words">{line}</span></button>)}</div></div> : null}
    <p className="mt-3 text-[0.625rem] leading-5 text-black/55">Features appear on the website in this order. Empty rows are ignored when you save.</p>
  </fieldset>;
}

function ProjectPreviewCheck({ project, isStaff }: { project: Project; isStaff: boolean }) {
  const [preview, setPreview] = useState<Project | null>(null);
  const hasValidSource = [project.demoUrl, project.previewImageUrl].some((value) => {
    const source = value?.trim();
    return Boolean(source && isSafeProjectMediaUrl(source));
  });
  return <div className="sm:col-span-2">
    <button type="button" className={secondaryButton} disabled={!hasValidSource} onClick={() => setPreview({ ...project })}>Check project preview</button>
    {preview ? <div className="mt-4 max-w-lg overflow-hidden rounded-xl border border-orange-200"><ProjectPreview project={preview} /></div> : null}
    <p className="mt-2 text-[0.625rem] leading-5 text-black/55">{isStaff ? 'This is a private draft preview. Submit changes for admin approval before they can appear on the website.' : 'Check your preview here, then save changes to publish it.'} If the website blocks embedded previews, add a screenshot URL above.</p>
  </div>;
}

export function AdminContentEditor({ section, initialContent, baseHash, isStaff, onSaved, onSubmitted, onDirtyChange }: { section: ContentSection; initialContent: AdminContent; baseHash: string; isStaff: boolean; onSaved: (content: AdminContent, revisions: ContentRevisions) => void; onSubmitted: (request: ChangeRequest) => void; onDirtyChange?: (dirty: boolean) => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [openItems, setOpenItems] = useState<number[]>([0]);
  const [submittedSnapshot, setSubmittedSnapshot] = useState<string | null>(null);
  const meta = sectionDetails[section];
  const Icon = meta.icon;
  const items = draft[section];
  const dirty = JSON.stringify(draft[section]) !== (submittedSnapshot ?? JSON.stringify(initialContent[section]));

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [dirty]);

  function updateItem(index: number, values: Record<string, unknown>) {
    setDraft((current) => ({ ...current, [section]: current[section].map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item) }));
    setFeedback(null);
  }

  function addItem() {
    const nextIndex = items.length;
    if (section === 'faqs') setDraft((current) => ({ ...current, faqs: [...current.faqs, { question: '', answer: '' }] }));
    if (section === 'projects') setDraft((current) => ({ ...current, projects: [...current.projects, { id: `project-${randomId(12)}`, name: '', category: 'Business Websites', overview: '', technologies: [], demoUrl: '', accent: 'from-orange-500 to-orange-200', gradient: 'bg-gradient-to-br from-orange-100 via-orange-50 to-white' }] }));
    if (section === 'packages') setDraft((current) => ({ ...current, packages: [...current.packages, { id: `package-${randomId()}`, name: '', startPrice: 0, currency: 'LKR', description: '', audience: '', features: [''], cta: 'Get a Quote', accent: 'default' }] }));
    setOpenItems((current) => [...current, nextIndex]);
    setFeedback(null);
    requestAnimationFrame(() => {
      const added = document.getElementById(`content-${section}-${nextIndex}`);
      added?.scrollIntoView({ block: 'center', behavior: 'instant' });
      added?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
    });
  }

  function removeItem(index: number) {
    setDraft((current) => ({ ...current, [section]: current[section].filter((_, itemIndex) => itemIndex !== index) }));
    setPendingDelete(null);
    setOpenItems((current) => current.filter((item) => item !== index).map((item) => item > index ? item - 1 : item));
    setFeedback(null);
  }

  function moveItem(index: number, direction: -1 | 1) {
    setDraft((current) => {
      const reordered = [...current[section]];
      [reordered[index], reordered[index + direction]] = [reordered[index + direction], reordered[index]];
      return { ...current, [section]: reordered };
    });
    setOpenItems([]);
    setPendingDelete(null);
    setFeedback(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const normalizedItems = section === 'packages'
        ? draft.packages.map((item) => ({ ...item, features: item.features.map((line) => line.trim()).filter(Boolean) }))
        : section === 'projects'
          ? draft.projects.map((item) => ({ ...item, technologies: item.technologies.map((line) => line.trim()).filter(Boolean) }))
          : draft.faqs;
      const response = await fetch('/api/admin/content', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section, items: normalizedItems, baseHash }) });
      if (response.status === 401) { router.replace('/admin/login'); return; }
      const data = await response.json();
      if (response.status === 409) throw new Error('This section has changed since you opened it. Your changes were not applied. Reload the workspace and reapply your edits to the latest saved version.');
      if (!response.ok) throw new Error(data.error || 'Unable to save changes. Please try again.');
      if (response.status === 202 || data.status === 'pending') {
        setDraft((current) => ({ ...current, [section]: normalizedItems }));
        setSubmittedSnapshot(JSON.stringify(normalizedItems));
        onSubmitted(data.request);
        setFeedback({ type: 'success', text: 'Submitted for admin approval. These changes are not live. Follow the decision in My submissions.' });
      } else {
        setSubmittedSnapshot(null);
        setDraft(data.content);
        onSaved(data.content, data.revisions);
        router.refresh();
        setFeedback({ type: 'success', text: 'Changes saved. Your website content is up to date.' });
      }
    } catch (error) {
      setFeedback({ type: 'error', text: error instanceof Error ? error.message : 'Unable to save changes. Please try again.' });
    } finally { setSaving(false); }
  }

  function discard() {
    setDraft(initialContent);
    setSubmittedSnapshot(null);
    setPendingDelete(null);
    setFeedback(null);
  }

  return <section className="mt-7 min-w-0" aria-labelledby="content-editor-heading">
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-orange-200/80 bg-white px-5 py-5 sm:px-6"><div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-orange-100 bg-orange-50"><Icon aria-hidden="true" className="h-5 w-5 text-orange-700" /></span><div className="min-w-0"><h2 id="content-editor-heading" className="text-lg font-bold tracking-tight">{meta.title}<span className="ml-2 rounded-md bg-orange-50 px-2 py-1 align-middle font-sans text-[0.625rem] text-orange-800">{items.length}</span></h2><p className="mt-1 text-xs leading-5 text-black/60">{meta.description}</p></div></div><div className="flex flex-wrap gap-2"><a href={meta.href} target="_blank" rel="noopener noreferrer" className={secondaryButton}>Preview website <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" /><span className="sr-only"> (opens in a new tab)</span></a><button type="button" onClick={addItem} disabled={saving || items.length >= (section === 'packages' ? 12 : 50)} className={secondaryButton}><Plus aria-hidden="true" className="h-3.5 w-3.5" />Add {meta.singular}</button></div></div>

    <form data-admin-editor={section} onSubmit={save} onInvalid={(event) => { const details = (event.target as HTMLElement).closest('details'); if (details) { const index = Number(details.dataset.itemIndex); setOpenItems((current) => current.includes(index) ? current : [...current, index]); details.open = true; } }} className="mt-5 min-w-0">
      <fieldset disabled={saving} className="min-w-0 space-y-3">
        <legend className="sr-only">Edit {meta.title.toLowerCase()}</legend>
        {!items.length ? <div className="flex min-h-60 flex-col items-center justify-center rounded-2xl border border-dashed border-orange-200 bg-white p-7 text-center"><Icon aria-hidden="true" className="h-7 w-7 text-orange-600" /><h3 className="mt-4 text-lg font-bold">{section === 'projects' ? 'Show what you can build.' : 'Make the answers easy to find.'}</h3><p className="mt-2 max-w-md text-xs leading-6 text-black/60">{section === 'projects' ? 'Add a project with a description, technologies, and an optional live demo link.' : 'Add a question and a helpful answer for visitors to your website.'}</p><button type="button" onClick={addItem} className={`${secondaryButton} mt-5`}><Plus aria-hidden="true" className="h-4 w-4" />Add {meta.singular}</button></div> : null}

        {items.map((item, index) => {
          const title = section === 'faqs' ? draft.faqs[index].question : section === 'packages' ? draft.packages[index].name : draft.projects[index].name;
          const subtitle = section === 'packages' ? `LKR ${draft.packages[index].startPrice.toLocaleString('en-GB')} · ${draft.packages[index].features.length} features` : section === 'projects' ? draft.projects[index].category : 'Question & answer';
          return <details key={section === 'faqs' ? index : 'id' in item ? item.id : index} id={`content-${section}-${index}`} data-item-index={index} open={openItems.includes(index)} onToggle={(event) => { const isOpen = event.currentTarget.open; setOpenItems((current) => isOpen ? current.includes(index) ? current : [...current, index] : current.filter((item) => item !== index)); }} className="group min-w-0 rounded-2xl border border-orange-200/80 bg-white">
            <summary className="flex min-h-20 cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-4 transition hover:bg-orange-50/40 [&::-webkit-details-marker]:hidden sm:px-6"><span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-orange-100 font-heading text-xs font-bold text-orange-800">{String(index + 1).padStart(2, '0')}</span><div className="min-w-0 flex-1"><h3 className="text-sm leading-6 font-bold break-words">{title || `New ${meta.singular}`}</h3><p className="mt-0.5 text-[0.625rem] leading-5 text-black/55">{subtitle}</p></div><ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-orange-700 transition group-open:rotate-180 motion-reduce:transition-none" /></summary>
            <div className="min-w-0 border-t border-orange-100 px-4 py-5 sm:px-6">
              {section === 'packages' ? <div className="grid min-w-0 gap-5 sm:grid-cols-2"><Field label="Package name"><input required maxLength={100} value={draft.packages[index].name} onChange={(event) => updateItem(index, { name: event.target.value })} className={inputClass} /></Field><Field label="Starting price (LKR)"><input required type="number" min={0} max={100000000} step={1} value={draft.packages[index].startPrice} onChange={(event) => updateItem(index, { startPrice: Number(event.target.value) })} className={inputClass} /></Field><div className="sm:col-span-2"><Field label="Description"><textarea required maxLength={1000} rows={3} value={draft.packages[index].description} onChange={(event) => updateItem(index, { description: event.target.value })} className={`${inputClass} resize-y`} /></Field></div><Field label="Best suited for"><input required maxLength={500} value={draft.packages[index].audience} onChange={(event) => updateItem(index, { audience: event.target.value })} className={inputClass} /></Field><Field label="Button text"><input required maxLength={80} value={draft.packages[index].cta} onChange={(event) => updateItem(index, { cta: event.target.value })} className={inputClass} /></Field><div className="sm:col-span-2"><FeatureList features={draft.packages[index].features} suggestions={[...new Map(draft.packages.flatMap((pkg) => pkg.features).map((line) => line.trim()).filter(Boolean).map((line) => [line.toLowerCase(), line])).values()]} onChange={(features) => updateItem(index, { features })} /></div><label className="flex min-h-11 cursor-pointer items-center gap-3 text-xs font-semibold sm:col-span-2"><input type="checkbox" checked={Boolean(draft.packages[index].popular)} onChange={(event) => updateItem(index, { popular: event.target.checked })} className="h-4 w-4 accent-orange-600" />Show “Most popular” badge</label></div> : null}

              {section === 'projects' ? <div className="grid min-w-0 gap-5 sm:grid-cols-2">
                <Field label="Project name"><input required maxLength={150} value={draft.projects[index].name} onChange={(event) => updateItem(index, { name: event.target.value })} className={inputClass} /></Field>
                <Field label="Category"><select value={draft.projects[index].category} onChange={(event) => updateItem(index, { category: event.target.value as ProjectCategory })} className={inputClass}>{categories.map((category) => <option key={category}>{category}</option>)}</select></Field>
                <div className="sm:col-span-2"><Field label="Project description"><textarea required rows={4} maxLength={3000} value={draft.projects[index].overview} onChange={(event) => updateItem(index, { overview: event.target.value })} className={`${inputClass} resize-y`} /></Field></div>
                <div className="sm:col-span-2"><Field label="Technologies & features" hint="One item per line, for example Next.js, Online payments, or Inventory."><textarea required rows={4} maxLength={3000} value={draft.projects[index].technologies.join('\n')} onChange={(event) => updateItem(index, { technologies: event.target.value.split('\n') })} className={`${inputClass} resize-y`} /></Field></div>
                <div className="sm:col-span-2"><Field label="Live demo URL (optional)" hint="Use the full https:// address. A website preview appears after the change is published."><input type="url" maxLength={2048} placeholder="https://" value={draft.projects[index].demoUrl ?? ''} onChange={(event) => updateItem(index, { demoUrl: event.target.value })} className={inputClass} /></Field></div>
                <div className="sm:col-span-2"><Field label="Preview screenshot URL (optional)" hint="A direct image URL or /images/ path. This image replaces the embedded website preview, including when a website blocks embedding."><input type="text" inputMode="url" maxLength={2048} placeholder="https://example.com/website-preview.webp" value={draft.projects[index].previewImageUrl ?? ''} onChange={(event) => updateItem(index, { previewImageUrl: event.target.value })} className={inputClass} /></Field></div>
                <ProjectPreviewCheck project={draft.projects[index]} isStaff={isStaff} />
              </div> : null}

              {section === 'faqs' ? <div className="space-y-5"><Field label="Question"><input required maxLength={300} value={draft.faqs[index].question} onChange={(event) => updateItem(index, { question: event.target.value })} className={inputClass} /></Field><Field label="Answer"><textarea required rows={5} maxLength={4000} value={draft.faqs[index].answer} onChange={(event) => updateItem(index, { answer: event.target.value })} className={`${inputClass} resize-y`} /></Field></div> : null}

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-orange-100 pt-4"><div className="flex gap-2"><button type="button" aria-label={`Move ${title || meta.singular} up`} onClick={() => moveItem(index, -1)} disabled={index === 0} className={secondaryButton}><ArrowUp aria-hidden="true" className="h-3.5 w-3.5" /><span className="hidden sm:inline">Move up</span></button><button type="button" aria-label={`Move ${title || meta.singular} down`} onClick={() => moveItem(index, 1)} disabled={index === items.length - 1} className={secondaryButton}><ArrowDown aria-hidden="true" className="h-3.5 w-3.5" /><span className="hidden sm:inline">Move down</span></button></div>{pendingDelete === index ? <div className="flex flex-wrap items-center gap-2 rounded-xl border border-orange-200 p-2"><span className="px-1 text-xs font-semibold">Remove this {meta.singular}?</span><button type="button" onClick={() => removeItem(index)} className="min-h-9 rounded-lg bg-orange-700 px-3 text-xs font-bold text-white">Remove</button><button type="button" onClick={() => setPendingDelete(null)} aria-label="Cancel removal" className="flex h-9 w-9 items-center justify-center rounded-lg border border-orange-200"><X aria-hidden="true" className="h-4 w-4" /></button></div> : <button type="button" onClick={() => setPendingDelete(index)} disabled={section === 'packages' && items.length <= 1} className={`${secondaryButton} text-orange-800`}><Trash2 aria-hidden="true" className="h-3.5 w-3.5" />Remove</button>}</div>
            </div>
          </details>;
        })}
      </fieldset>

      <div className="sticky bottom-0 z-20 mt-5 rounded-2xl border border-orange-200 bg-white p-4 shadow-[0_-8px_30px_-20px_rgba(255,102,0,0.25)] sm:px-6">
        {feedback ? <p role={feedback.type === 'error' ? 'alert' : 'status'} className="mb-3 flex items-start gap-2 text-xs leading-6 text-orange-800">{feedback.type === 'error' ? <CircleAlert aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" /> : <Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />}{feedback.text}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold">{dirty ? 'Ready when you are.' : submittedSnapshot ? 'Submitted for review.' : 'Everything is up to date.'}</p><p className="mt-1 text-[0.625rem] leading-5 text-black/55">{isStaff ? submittedSnapshot ? 'This draft is awaiting admin approval. The public website still shows the saved version.' : 'Submit your edits for admin approval. They will not appear publicly until approved.' : dirty ? 'Save to update the content on your public website.' : 'Your saved content is shown on the public website.'}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={discard} disabled={saving || !dirty} className={secondaryButton}>Discard changes</button><button type="submit" disabled={saving || !dirty} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#ff6600] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Save aria-hidden="true" className="h-4 w-4" />}{saving ? 'Saving…' : isStaff ? 'Submit for approval' : 'Save changes'}</button></div></div>
      </div>
    </form>
  </section>;
}
