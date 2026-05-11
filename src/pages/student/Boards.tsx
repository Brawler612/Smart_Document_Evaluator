import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ClipboardList,
  Search,
  Inbox,
  Send,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Upload,
  FileText,
  Star,
} from 'lucide-react';
import {
  StudentPageHero,
  StudentWorkspaceShell,
} from '../../components/student/StudentWorkspaceChrome';
import {
  buildEffectiveSubmittedAssignmentIds,
  describeDueRelative,
  formatShortDate,
  useStudentWorkspace,
  type StudentAssignmentRow,
  type StudentSubmissionRow,
} from '../../lib/studentWorkspaceData';

type ColumnId = 'todo' | 'submitted' | 'review' | 'graded' | 'redo';

interface Card {
  id: string;
  title: string;
  documentType: string;
  /** UNIX ms used for sorting */
  sortAt: number;
  /** Subtitle (due-date hint or submitted hint) */
  meta: string;
  metaTone: 'overdue' | 'today' | 'soon' | 'future' | 'none' | 'sent';
  score: number | null;
  feedback: string | null;
  hasFile: boolean;
  /** Where the "Open" link points */
  openTo: string;
}

const COLUMNS: { id: ColumnId; title: string; description: string; icon: typeof Inbox; tint: string; chip: string }[] = [
  {
    id: 'todo',
    title: 'To submit',
    description: 'Open assignments awaiting upload',
    icon: Inbox,
    tint: 'border-t-[#84001B]',
    chip: 'bg-[#84001B] text-white',
  },
  {
    id: 'submitted',
    title: 'Submitted',
    description: 'Sent to grading queue',
    icon: Send,
    tint: 'border-t-blue-500',
    chip: 'bg-blue-500 text-white',
  },
  {
    id: 'review',
    title: 'Under review',
    description: 'Teacher is reviewing',
    icon: Eye,
    tint: 'border-t-amber-500',
    chip: 'bg-amber-500 text-white',
  },
  {
    id: 'graded',
    title: 'Graded',
    description: 'Score posted',
    icon: CheckCircle2,
    tint: 'border-t-emerald-500',
    chip: 'bg-emerald-500 text-white',
  },
  {
    id: 'redo',
    title: 'Redo',
    description: 'Resubmit requested',
    icon: AlertTriangle,
    tint: 'border-t-red-500',
    chip: 'bg-red-500 text-white',
  },
];

function assignmentToCard(a: StudentAssignmentRow): Card {
  const due = describeDueRelative(a.due_date);
  return {
    id: `asgn-${a.id}`,
    title: a.title,
    documentType: a.document_type,
    sortAt: a.due_date ? new Date(a.due_date).getTime() || 0 : Number.MAX_SAFE_INTEGER,
    meta: due.label,
    metaTone: due.tone,
    score: null,
    feedback: null,
    hasFile: false,
    openTo: '/assignments',
  };
}

function submissionToCard(s: StudentSubmissionRow): Card {
  return {
    id: `sub-${s.id}`,
    title: s.assignment_title || s.file_name,
    documentType: s.submission_doc_type || s.assignment_doc_type || 'Other',
    sortAt: new Date(s.submitted_at).getTime() || 0,
    meta: `Sent ${formatShortDate(s.submitted_at)}`,
    metaTone: 'sent',
    score: s.score ?? null,
    feedback: s.feedback,
    hasFile: !!s.file_url,
    openTo: '/my-submissions',
  };
}

const META_TONE_CLASSES: Record<Card['metaTone'], string> = {
  overdue: 'bg-red-50 text-red-700 border-red-200',
  today: 'bg-amber-50 text-amber-800 border-amber-200',
  soon: 'bg-[#ffd21a]/25 text-[#5c0014] border-[#ffd21a]/60',
  future: 'bg-slate-50 text-slate-600 border-slate-200',
  none: 'bg-slate-50 text-slate-500 border-slate-200',
  sent: 'bg-emerald-50 text-emerald-700 border-emerald-100',
};

export default function StudentBoards() {
  const { loading, assignments, submissions } = useStudentWorkspace();
  const [search, setSearch] = useState('');

  /** Excludes resubmit rows so a redo-flagged assignment shows back in `todo` until the student uploads a new file. */
  const effectivelyDoneIds = useMemo(
    () => buildEffectiveSubmittedAssignmentIds(submissions),
    [submissions]
  );

  const columns: Record<ColumnId, Card[]> = useMemo(() => {
    const cols: Record<ColumnId, Card[]> = { todo: [], submitted: [], review: [], graded: [], redo: [] };

    assignments
      .filter((a) => a.status === 'active' && !effectivelyDoneIds.has(a.id))
      .forEach((a) => cols.todo.push(assignmentToCard(a)));

    submissions.forEach((s) => {
      const card = submissionToCard(s);
      if (s.status === 'submitted') cols.submitted.push(card);
      else if (s.status === 'under_review') cols.review.push(card);
      else if (s.status === 'reviewed') cols.graded.push(card);
      else if (s.status === 'resubmit') cols.redo.push(card);
    });

    (Object.keys(cols) as ColumnId[]).forEach((k) => {
      cols[k].sort((a, b) =>
        k === 'todo' ? a.sortAt - b.sortAt : b.sortAt - a.sortAt
      );
    });
    return cols;
  }, [assignments, submissions, effectivelyDoneIds]);

  const filteredColumns: Record<ColumnId, Card[]> = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return columns;
    const out: Record<ColumnId, Card[]> = { todo: [], submitted: [], review: [], graded: [], redo: [] };
    (Object.keys(columns) as ColumnId[]).forEach((k) => {
      out[k] = columns[k].filter((c) =>
        `${c.title} ${c.documentType} ${c.meta}`.toLowerCase().includes(q)
      );
    });
    return out;
  }, [columns, search]);

  const totalCards =
    columns.todo.length + columns.submitted.length + columns.review.length + columns.graded.length + columns.redo.length;

  return (
    <StudentWorkspaceShell>
      <StudentPageHero
        eyebrow="Workspace · Boards"
        title="Boards"
        icon={ClipboardList}
        description="A Kanban view of your work. To-do on the left, graded on the right — drag isn’t needed: cards move automatically as your status changes."
        kpis={[
          { label: 'To do', value: loading ? '—' : columns.todo.length },
          { label: 'In flight', value: loading ? '—' : columns.submitted.length + columns.review.length, accent: 'yellow' },
          { label: 'Graded', value: loading ? '—' : columns.graded.length },
        ]}
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:min-w-[300px] flex-1 sm:flex-none">
          <Search
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
            aria-hidden
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search across all columns…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]/40 bg-white shadow-sm"
          />
        </div>
        <div className="text-xs text-slate-500">
          {loading ? 'Loading…' : `${totalCards} card${totalCards !== 1 ? 's' : ''} across the board`}
        </div>
      </div>

      <div className="-mx-4 md:mx-0 overflow-x-auto pb-2">
        <div className="px-4 md:px-0 min-w-[1080px] grid grid-cols-5 gap-3">
          {COLUMNS.map((col) => {
            const cards = filteredColumns[col.id];
            const Icon = col.icon;
            return (
              <section
                key={col.id}
                className={`rounded-2xl border border-slate-200 bg-slate-50/70 shadow-sm border-t-4 ${col.tint} flex flex-col min-h-[280px]`}
              >
                <header className="px-3.5 pt-3 pb-2.5 border-b border-slate-200/80">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${col.chip}`}
                      >
                        <Icon className="w-3.5 h-3.5" aria-hidden />
                      </span>
                      <span className="text-[12px] font-bold text-slate-900 uppercase tracking-wide">
                        {col.title}
                      </span>
                    </div>
                    <span className="text-[11px] font-bold tabular-nums text-slate-500 bg-white border border-slate-200 rounded-md px-1.5">
                      {cards.length}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">{col.description}</p>
                </header>
                <div className="flex-1 p-2.5 space-y-2">
                  {loading ? (
                    [...Array(2)].map((_, i) => (
                      <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
                    ))
                  ) : cards.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic px-2 py-4 text-center">
                      Nothing here yet.
                    </p>
                  ) : (
                    cards.map((c) => (
                      <Link
                        key={c.id}
                        to={c.openTo}
                        className="group block rounded-xl border border-slate-200 bg-white p-3 shadow-sm hover:shadow-md hover:border-[#84001B]/25 transition-all"
                      >
                        <div className="flex items-start gap-2">
                          <div className="w-7 h-7 rounded-lg bg-[#84001B]/10 text-[#84001B] flex items-center justify-center shrink-0">
                            <FileText className="w-3.5 h-3.5" aria-hidden />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold text-slate-900 line-clamp-2 leading-snug">
                              {c.title}
                            </p>
                            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wide bg-rose-100 text-[#84001B]">
                                {c.documentType}
                              </span>
                              {c.score != null && (
                                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md font-bold bg-amber-50 text-amber-700">
                                  <Star className="w-2.5 h-2.5" aria-hidden /> {c.score}%
                                </span>
                              )}
                            </div>
                            <span
                              className={`mt-1.5 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                                META_TONE_CLASSES[c.metaTone]
                              }`}
                            >
                              {c.meta}
                            </span>
                          </div>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
                {col.id === 'todo' && (
                  <div className="px-3 pb-3">
                    <Link
                      to="/assignments"
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#84001B] px-3 py-2 text-xs font-bold text-[#ffd21a] shadow-md shadow-[#84001B]/15 hover:bg-[#6b0016] transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5" aria-hidden /> Submit work
                    </Link>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </StudentWorkspaceShell>
  );
}
