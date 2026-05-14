import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Calendar,
  ChevronRight,
  Download,
  ListChecks,
  NotebookPen,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { uploadAssignmentHandout } from '../../lib/submissionStorage';
import { describeDueRelative, formatShortDate } from '../../lib/studentWorkspaceData';

type AssignmentTable = 'assignments' | 'assignment';

const DOC_TYPES = ['SRS', 'SDD', 'SPMP', 'STD', 'Other'] as const;

type Row = {
  id: string;
  title: string;
  description: string | null;
  document_type: string;
  due_date: string | null;
  status: string;
  handout_url?: string | null;
  handout_file_name?: string | null;
  created_at?: string;
};

async function resolveAssignmentTable(): Promise<AssignmentTable | null> {
  const plural = await supabase.from('assignments').select('id').limit(1);
  if (!plural.error) return 'assignments';
  const singular = await supabase.from('assignment').select('id').limit(1);
  if (!singular.error) return 'assignment';
  return null;
}

export default function TeacherCourseAssignments() {
  const { user } = useAuth();
  const [table, setTable] = useState<AssignmentTable | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const submitLock = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dueTriggerRef = useRef<HTMLButtonElement>(null);
  const duePanelRef = useRef<HTMLDivElement>(null);
  const [duePickerOpen, setDuePickerOpen] = useState(false);
  const [dueDraftDate, setDueDraftDate] = useState('');
  const [dueDraftTime, setDueDraftTime] = useState('');
  const [form, setForm] = useState({
    title: '',
    description: '',
    document_type: 'SRS' as (typeof DOC_TYPES)[number],
    due_date: '',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const selectAllHeaderRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!user?.id) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const t = await resolveAssignmentTable();
      setTable(t);
      if (!t) {
        setRows([]);
        return;
      }
      const { data, error: qErr } = await supabase
        .from(t)
        .select('id, title, description, document_type, due_date, status, handout_url, handout_file_name, created_at')
        .eq('teacher_id', user.id)
        .order('created_at', { ascending: false });
      if (qErr) {
        if (/handout_url|column|does not exist|42703/i.test(qErr.message ?? '')) {
          const r2 = await supabase
            .from(t)
            .select('id, title, description, document_type, due_date, status, created_at')
            .eq('teacher_id', user.id)
            .order('created_at', { ascending: false });
          if (r2.error) throw new Error(r2.error.message);
          setRows((r2.data ?? []) as Row[]);
        } else throw new Error(qErr.message);
      } else {
        setRows((data ?? []) as Row[]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tasks');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!duePickerOpen) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (duePanelRef.current?.contains(t)) return;
      if (dueTriggerRef.current?.contains(t)) return;
      setDuePickerOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDuePickerOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [duePickerOpen]);

  const allRowsSelected = rows.length > 0 && selectedIds.length === rows.length;
  const someRowsSelected = selectedIds.length > 0 && !allRowsSelected;

  useEffect(() => {
    const el = selectAllHeaderRef.current;
    if (el) el.indeterminate = someRowsSelected;
  }, [someRowsSelected, rows.length, selectedIds.length]);

  function toggleRowSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function selectAllRows() {
    setSelectedIds(rows.map((r) => r.id));
  }

  function clearRowSelection() {
    setSelectedIds([]);
  }

  async function deleteRowsById(ids: string[]) {
    if (!table || ids.length === 0 || !user?.id) return;
    setDeleting(true);
    setError(null);
    try {
      const { error: e } = await supabase.from(table).delete().in('id', ids).eq('teacher_id', user.id);
      if (e) throw new Error(e.message);
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Delete failed';
      setError(msg);
      alert(msg);
    } finally {
      setDeleting(false);
    }
  }

  async function deleteOneRow(row: Row) {
    if (
      !window.confirm(
        `Delete "${row.title}"? Submissions may remain in the gradebook with no linked task. This cannot be undone.`
      )
    ) {
      return;
    }
    await deleteRowsById([row.id]);
  }

  async function deleteSelectedRows() {
    if (selectedIds.length === 0) return;
    const n = selectedIds.length;
    if (!window.confirm(`Delete ${n} selected task(s)? This cannot be undone.`)) return;
    await deleteRowsById([...selectedIds]);
  }

  function localYmdHm(d: Date): { ymd: string; hm: string } {
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return { ymd, hm };
  }

  function parseDueLocalDisplay(value: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value.trim());
    if (!m) return value.trim() || 'Pick date & time';
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  }

  function openDuePicker() {
    const v = form.due_date.trim();
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(v);
    if (m) {
      setDueDraftDate(m[1]);
      setDueDraftTime(m[2]);
    } else {
      const { ymd, hm } = localYmdHm(new Date());
      setDueDraftDate(ymd);
      setDueDraftTime(hm);
    }
    setDuePickerOpen(true);
  }

  function applyDuePicker() {
    if (!dueDraftDate.trim()) {
      setForm((f) => ({ ...f, due_date: '' }));
    } else {
      const hm = dueDraftTime.trim() || '23:59';
      setForm((f) => ({ ...f, due_date: `${dueDraftDate}T${hm}` }));
    }
    setDuePickerOpen(false);
  }

  function clearDuePickerDraft() {
    setDueDraftDate('');
    setDueDraftTime('');
  }

  function duePickerToday() {
    const { ymd, hm } = localYmdHm(new Date());
    setDueDraftDate(ymd);
    setDueDraftTime(hm);
  }

  function clearHandoutSelection() {
    setSelectedFile(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  function resetForm() {
    setForm({ title: '', description: '', document_type: 'SRS', due_date: '' });
    setSelectedFile(null);
    setDuePickerOpen(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  function closeModal() {
    setDuePickerOpen(false);
    setModalOpen(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (submitLock.current || saving) return;
    if (!user?.id || !table) return;
    const title = form.title.trim();
    if (!title) {
      alert('Please enter a task title.');
      return;
    }
    submitLock.current = true;
    setSaving(true);
    setError(null);
    try {
      const due =
        form.due_date.trim() !== ''
          ? new Date(form.due_date).toISOString()
          : null;
      const insertPayload: Record<string, unknown> = {
        title,
        description: form.description.trim() || '',
        document_type: form.document_type,
        teacher_id: user.id,
        due_date: due,
        max_score: 100,
        status: 'active',
      };
      const { data: created, error: insErr } = await supabase.from(table).insert(insertPayload).select('id').maybeSingle();
      if (insErr) throw new Error(insErr.message);
      const id = created?.id as string | undefined;
      if (!id) throw new Error('Insert did not return an id');

      if (selectedFile) {
        const { publicUrl, storedName } = await uploadAssignmentHandout(selectedFile, user.id);
        const { error: upErr } = await supabase
          .from(table)
          .update({ handout_url: publicUrl, handout_file_name: storedName })
          .eq('id', id);
        if (upErr && /handout_url|column|does not exist/i.test(upErr.message ?? '')) {
          alert(
            'Task was created but the handout could not be saved: add columns with docs/supabase-assignments-handout.sql, then edit the task to re-upload.'
          );
        } else if (upErr) throw new Error(upErr.message);
      }

      setModalOpen(false);
      resetForm();
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not create task');
    } finally {
      submitLock.current = false;
      setSaving(false);
    }
  }

  async function setStatus(row: Row, status: 'active' | 'closed') {
    if (!table) return;
    const { error: e } = await supabase.from(table).update({ status }).eq('id', row.id);
    if (e) {
      alert(e.message);
      return;
    }
    await load();
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <p className="text-xs font-semibold tracking-wide uppercase text-[#84001B]">Teaching</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-1 flex items-center gap-2">
            <NotebookPen className="w-7 h-7 text-[#84001B]" aria-hidden />
            Course Tasks
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-xl leading-relaxed">
            Publish assignments with optional handout files. Students see each active task on{' '}
            <span className="font-semibold text-slate-700">Tasks</span> and can open{' '}
            <span className="font-semibold text-slate-700">Submit Work</span> pre-filled from their task list.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetForm();
            setModalOpen(true);
          }}
          disabled={!table}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#84001B] px-4 py-2.5 text-sm font-bold text-[#ffd21a] shadow-md shadow-[#84001B]/25 hover:bg-[#6b0016] disabled:opacity-45 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" aria-hidden />
          New task
        </button>
      </div>

      {!table && !loading && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 flex gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden />
          <p>No assignments table found. Run Supabase setup SQL from the repo docs first.</p>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900">{error}</div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-8 py-14 text-center">
          <ListChecks className="w-10 h-10 text-slate-300 mx-auto mb-2" aria-hidden />
          <p className="font-semibold text-slate-700">No course tasks yet</p>
          <p className="text-sm text-slate-500 mt-1">Create one so it appears on every student&apos;s Tasks page.</p>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800">
              <input
                ref={selectAllHeaderRef}
                type="checkbox"
                checked={allRowsSelected}
                onChange={() => (allRowsSelected ? clearRowSelection() : selectAllRows())}
                disabled={deleting}
                className="h-4 w-4 rounded border-slate-300 text-[#84001B] focus:ring-[#84001B]/30"
                aria-label="Select all tasks"
              />
              Select all
            </label>
            <span className="text-xs text-slate-500">
              {selectedIds.length} selected
            </span>
            <button
              type="button"
              disabled={selectedIds.length === 0 || deleting}
              onClick={() => void deleteSelectedRows()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-900 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Delete selected
            </button>
          </div>
        <ul className="space-y-3">
          {rows.map((r) => {
            const due = r.due_date ? describeDueRelative(r.due_date) : null;
            const rowSelected = selectedIds.includes(r.id);
            return (
              <li
                key={r.id}
                className={`rounded-2xl border bg-white p-4 sm:p-5 shadow-sm flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${
                  rowSelected ? 'border-[#84001B]/40 ring-1 ring-[#84001B]/15' : 'border-slate-200'
                }`}
              >
                <div className="flex gap-3 min-w-0 flex-1">
                  <input
                    type="checkbox"
                    checked={rowSelected}
                    onChange={() => toggleRowSelected(r.id)}
                    disabled={deleting}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-[#84001B] focus:ring-[#84001B]/30"
                    aria-label={`Select ${r.title}`}
                  />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-bold text-slate-900 truncate">{r.title}</h2>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-rose-100 text-[#84001B]">
                      {r.document_type}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        r.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>
                  {r.description ? (
                    <p className="text-sm text-slate-600 mt-1 line-clamp-2">{r.description}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {r.due_date && due ? (
                      <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium text-slate-700">
                        <Calendar className="w-3.5 h-3.5" aria-hidden />
                        {due.label} · {formatShortDate(r.due_date)}
                      </span>
                    ) : (
                      <span>No due date</span>
                    )}
                    <Link
                      to={`/tasks`}
                      className="inline-flex items-center gap-0.5 font-semibold text-[#84001B] hover:underline"
                    >
                      Student Tasks view
                      <ChevronRight className="w-3.5 h-3.5" aria-hidden />
                    </Link>
                  </div>
                  {r.handout_url ? (
                    <a
                      href={r.handout_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={r.handout_file_name ?? true}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-[#84001B] hover:underline"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden />
                      Handout: {r.handout_file_name || 'Download'}
                    </a>
                  ) : null}
                </div>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0 sm:flex-col sm:items-end">
                  {r.status === 'active' ? (
                    <button
                      type="button"
                      onClick={() => void setStatus(r, 'closed')}
                      disabled={deleting}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-45"
                    >
                      Close task
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void setStatus(r, 'active')}
                      disabled={deleting}
                      className="px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-45"
                    >
                      Re-open
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void deleteOneRow(r)}
                    disabled={deleting}
                    className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg border border-rose-200 bg-white text-xs font-bold text-rose-800 hover:bg-rose-50 disabled:opacity-45"
                  >
                    <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        </>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-task-title"
            className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 max-h-[min(90vh,800px)] overflow-y-auto overflow-x-visible"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/80">
              <h2 id="new-task-title" className="font-bold text-slate-900">
                New course task
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-white hover:text-slate-700"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">
                  Title <span className="text-[#84001B]">*</span>
                </label>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]"
                  placeholder="e.g. Sprint 3 — SDD revision"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">
                  Instructions
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B] resize-y"
                  placeholder="What students should deliver, links, page limits…"
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">
                    Document type
                  </label>
                  <select
                    value={form.document_type}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, document_type: e.target.value as (typeof DOC_TYPES)[number] }))
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold"
                  >
                    {DOC_TYPES.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="relative">
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">
                    Due date
                  </label>
                  <button
                    ref={dueTriggerRef}
                    type="button"
                    onClick={() => (duePickerOpen ? setDuePickerOpen(false) : openDuePicker())}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-left font-medium text-slate-800 bg-white hover:bg-slate-50 flex items-center justify-between gap-2"
                  >
                    <span className={form.due_date.trim() ? 'text-slate-900' : 'text-slate-400'}>
                      {form.due_date.trim() ? parseDueLocalDisplay(form.due_date) : 'mm/dd/yyyy —:-- —'}
                    </span>
                    <Calendar className="w-4 h-4 text-slate-400 shrink-0" aria-hidden />
                  </button>
                  {duePickerOpen && (
                    <div
                      ref={duePanelRef}
                      className="absolute left-0 right-0 top-full z-[60] mt-1 rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
                      role="dialog"
                      aria-label="Choose due date and time"
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                            Date
                          </label>
                          <input
                            type="date"
                            value={dueDraftDate}
                            onChange={(e) => setDueDraftDate(e.target.value)}
                            className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                            Time
                          </label>
                          <input
                            type="time"
                            value={dueDraftTime}
                            onChange={(e) => setDueDraftTime(e.target.value)}
                            className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm"
                          />
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={clearDuePickerDraft}
                            className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline"
                          >
                            Clear
                          </button>
                          <button
                            type="button"
                            onClick={duePickerToday}
                            className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline"
                          >
                            Today
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={applyDuePicker}
                          className="rounded-lg bg-[#84001B] px-4 py-2 text-xs font-bold text-white hover:bg-[#6b0016]"
                        >
                          OK
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">
                  Handout file <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  ref={fileRef}
                  id="course-task-handout"
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                  className="sr-only"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <label
                    htmlFor="course-task-handout"
                    className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-[#84001B] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#6b0016] shrink-0"
                  >
                    Choose file
                  </label>
                  {selectedFile ? (
                    <>
                      <span className="text-sm text-slate-700 truncate min-w-0 flex-1 max-w-[200px] sm:max-w-none">
                        {selectedFile.name}
                      </span>
                      <button
                        type="button"
                        onClick={clearHandoutSelection}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200"
                        aria-label="Remove selected file"
                      >
                        <X className="w-4 h-4" aria-hidden />
                      </button>
                    </>
                  ) : (
                    <span className="text-sm text-slate-400">No file chosen</span>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Handouts require Supabase Storage (same bucket as submissions). Run{' '}
                <code className="text-[10px] bg-slate-100 px-1 rounded">docs/supabase-assignments-handout.sql</code>{' '}
                if uploads fail after create.
              </p>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-[#84001B] text-white text-sm font-bold hover:bg-[#6b0016] disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4" aria-hidden />
                  {saving ? 'Publishing…' : 'Publish to students'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
