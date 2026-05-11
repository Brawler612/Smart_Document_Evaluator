import { useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import {
  FileText,
  CheckCircle,
  X,
  Star,
  ChevronDown,
  Calendar,
  Download,
  Printer,
  ClipboardList,
  Inbox,
  ArrowRight,
  Trash2,
  Undo2,
  Loader2,
  Sparkles,
  BookOpen,
  Wand2,
  Send,
  RotateCcw,
  Eye,
  GraduationCap,
  Info,
  type LucideIcon,
} from 'lucide-react';
import {
  fetchTeacherSubmissionRows,
  TEACHER_LOCAL_SUBMISSION_KEY,
  resolveSubmissionTableName,
  submissionQueueTitle,
  gradingDocTypeForAI,
  type LocalSubmissionRow,
  type TeacherSubmission,
} from '../../lib/teacherSubmissionLoad';
import {
  SubmissionOpenLink,
  parseDataUrl,
  submissionHasOpenableFileUrl,
} from '../../components/SubmissionOpenLink';
import { isPlausibleSubmissionId } from '../../lib/gradingRoutes';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { syncAllLocalSubmissionsToSupabase } from '../../lib/localSubmissionSync';
import { SubStatus } from '../../types';
import { formatStackedDateTime, rosterStatusChip, studentIdBadge } from '../../lib/submissionRosterPresentation';
import { DEFAULT_TEACHER_RESUBMIT_FEEDBACK, performTeacherResubmitRequest } from '../../lib/teacherResubmitRequest';
import { deleteTeacherSubmissionsByIds } from '../../lib/teacherDeleteSubmissions';
import {
  TeacherAmberCue,
  TeacherPageHeader,
  TeacherSearchSurface,
  TeacherWorkspaceShell,
  teacherMaroonTheadClasses,
  teacherRoundedTableShell,
} from '../../components/teacher/TeacherWorkspaceChrome';
import AIDocumentEvaluationReport from '../../components/AIDocumentEvaluationReport';
import { formatGeminiEvaluationError, runGeminiBackedEvaluation } from '../../lib/geminiDocumentEvaluation';

type Submission = TeacherSubmission;

interface AICriterion { name: string; score: number; max: number; comment: string; }
interface ReadinessResult { ready: boolean; missing: string[]; message: string; }

function scoreByKeywords(content: string, keywords: string[], max: number): number {
  if (!content.trim()) return 0;
  const lower = content.toLowerCase();
  const hit = keywords.reduce((acc, key) => (lower.includes(key) ? acc + 1 : acc), 0);
  const ratio = keywords.length > 0 ? hit / keywords.length : 0;
  const base = Math.round(max * 0.55);
  return Math.min(max, Math.max(0, base + Math.round((max - base) * ratio)));
}

/** Too short to treat as a real submission — AI publish is blocked until this passes. */
function isInsufficientSubmissionText(text: string): boolean {
  const t = text.trim();
  if (!t.length) return true;
  if (t.replace(/\s+/g, '').length < 15) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 8) return true;
  return false;
}

function countRepeatedWordPairs(text: string): number {
  const re = /\b(\w{4,})\s+\1\b/gi;
  let n = 0;
  for (;;) {
    if (!re.exec(text)) break;
    n++;
  }
  return n;
}

function grammarMechanicsCriterion(content: string, max: number): AICriterion {
  const t = content.trim();
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 8) {
    return {
      name: 'Grammar & mechanics',
      score: Math.round(max * 0.1),
      max,
      comment: 'Not enough wording to judge grammar — document may be empty or truncated.',
    };
  }

  let score = max;
  const flags: string[] = [];

  const badCapitals = [...t.matchAll(/\.\s+[a-z][a-z]+/g)].length;
  if (badCapitals >= 2) {
    flags.push(`${badCapitals} places may need a capital letter after end punctuation`);
    score -= Math.min(max * 0.35, badCapitals * (max / 14));
  }

  if (/\s{3,}/m.test(t) || /\n{4,}/.test(t)) {
    flags.push('irregular spacing or blank gaps');
    score -= Math.min(5, Math.round(max * 0.12));
  }

  const repeats = countRepeatedWordPairs(t);
  if (repeats > 0) {
    flags.push(`${repeats} repeated phrase(s)`);
    score -= Math.min(6, repeats * (max / 8));
  }

  const fragments = [...t.matchAll(/\b(and|but|because|although)\s+[a-z]+\s*\./gi)].length;
  if (fragments > 4) {
    flags.push('several unusually short clauses');
    score -= 4;
  }

  const sentences = t.split(/[.!?]+/).filter((s) => s.trim().length >= 6);
  const avgWords = sentences.length > 0 ? words.length / Math.max(sentences.length, 1) : words.length;
  if (avgWords > 45 && sentences.length > 1) {
    flags.push('very long sentences (possible run-ons)');
    score -= Math.min(7, Math.round((avgWords - 45) / 10));
  }
  if (avgWords > 4 && avgWords < 7 && sentences.length > 8) {
    flags.push('many short segments');
    score -= 4;
  }

  score = Math.max(0, Math.round(score));
  const comment =
    flags.length === 0
      ? 'No strong mechanical warning flags — still proofread for typos.'
      : `Flags: ${flags.join('; ')}. Correct grammar and readability before publishing.`;

  return { name: 'Grammar & mechanics', score, max, comment };
}

function lengthCompletenessCriterion(content: string, docType: string, max: number): AICriterion {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  const targets: Record<string, number> = { SRS: 200, SDD: 220, SPMP: 260, STD: 170, Other: 150 };
  const target = targets[docType] ?? targets.Other;
  const ratio = target > 0 ? words / target : 0;
  let score = ratio < 0.12 ? Math.round(max * 0.1) : Math.round(Math.min(max, max * Math.min(1.1, ratio * 1.15)));
  if (words < 35) score = Math.min(score, Math.round(max * 0.25));

  let comment =
    ratio < 0.3
      ? 'Likely incomplete or much shorter than usual for this document type.'
      : ratio < 0.55
        ? 'Thin in places — add explanations, headings, references, or detail.'
        : 'Length looks broadly sufficient for substantive review.';
  if (words < 20) comment = 'Document body is critically short versus expectations.';

  return {
    name: 'Length & structural completeness',
    score: Math.min(max, score),
    max,
    comment,
  };
}

function runAIFromText(docType: string, content: string): AICriterion[] {
  const keywordMap: Record<string, { name: string; max: number; keys: string[] }[]> = {
    SRS: [
      { name: 'Completeness', max: 20, keys: ['scope', 'functional', 'non-functional', 'constraints', 'assumptions'] },
      { name: 'Clarity', max: 20, keys: ['shall', 'must', 'define', 'description', 'objective'] },
      { name: 'Consistency', max: 20, keys: ['terminology', 'glossary', 'reference', 'section'] },
      { name: 'Feasibility', max: 20, keys: ['timeline', 'resource', 'cost', 'risk'] },
      { name: 'Verifiability', max: 20, keys: ['test', 'acceptance', 'criteria', 'validation'] },
    ],
    SDD: [
      { name: 'Architecture Design', max: 25, keys: ['architecture', 'component', 'layer', 'diagram'] },
      { name: 'Module Decomposition', max: 25, keys: ['module', 'responsibility', 'dependency'] },
      { name: 'Interface Definitions', max: 25, keys: ['api', 'endpoint', 'interface', 'contract'] },
      { name: 'Data Design', max: 25, keys: ['schema', 'table', 'entity', 'relationship', 'data flow'] },
    ],
    SPMP: [
      { name: 'Project Organization', max: 20, keys: ['team', 'role', 'organization', 'communication'] },
      { name: 'Schedule', max: 20, keys: ['milestone', 'timeline', 'deadline', 'gant'] },
      { name: 'Risk Management', max: 20, keys: ['risk', 'mitigation', 'impact', 'probability'] },
      { name: 'Resource Allocation', max: 20, keys: ['budget', 'resource', 'effort', 'cost'] },
      { name: 'Quality Assurance', max: 20, keys: ['quality', 'review', 'audit', 'test plan'] },
    ],
    STD: [
      { name: 'Content Quality', max: 25, keys: ['objective', 'scope', 'summary', 'analysis'] },
      { name: 'Organization', max: 25, keys: ['introduction', 'conclusion', 'section'] },
      { name: 'Technical Accuracy', max: 25, keys: ['requirement', 'design', 'implementation'] },
      { name: 'Completeness', max: 25, keys: ['details', 'reference', 'appendix'] },
    ],
    Other: [
      { name: 'Content Quality', max: 25, keys: ['objective', 'scope', 'summary', 'analysis'] },
      { name: 'Organization', max: 25, keys: ['introduction', 'conclusion', 'section'] },
      { name: 'Technical Accuracy', max: 25, keys: ['requirement', 'design', 'implementation'] },
      { name: 'Completeness', max: 25, keys: ['details', 'reference', 'appendix'] },
    ],
  };
  const criteria = keywordMap[docType] || keywordMap.Other;
  return criteria.map(c => {
    const score = scoreByKeywords(content, c.keys, c.max);
    const ratio = c.max > 0 ? score / c.max : 0;
    const comment =
      ratio >= 0.9 ? 'Strong coverage in this area.' :
      ratio >= 0.75 ? 'Acceptable coverage; refine specifics.' :
      'Insufficient evidence; add clearer details.';
    return { name: c.name, score, max: c.max, comment };
  });
}

function runFullAIDraft(docType: string, content: string): AICriterion[] {
  const base = runAIFromText(docType, content);
  return [
    ...base,
    grammarMechanicsCriterion(content, 22),
    lengthCompletenessCriterion(content, docType, 22),
  ];
}

function buildAIFeedback(criteria: AICriterion[]): string {
  if (criteria.length === 0) return '';
  const strengths = criteria
    .filter(c => c.max > 0 && c.score / c.max >= 0.85)
    .map(c => c.name)
    .slice(0, 2);
  const improvements = criteria
    .filter(c => c.max > 0 && c.score / c.max < 0.75)
    .map(c => c.name)
    .slice(0, 2);

  const parts = [
    strengths.length ? `Strengths: ${strengths.join(', ')}.` : '',
    improvements.length ? `Needs improvement: ${improvements.join(', ')}.` : '',
    'Please review comments per criterion and update before final publishing.',
  ].filter(Boolean);
  return parts.join(' ');
}

/** Snapshot persisted for students as “AI preliminary” versus teacher-adjusted `score` / `feedback`. */
function criteriaToDraftSnapshot(
  criteria: AICriterion[],
  executiveSummary?: string | null
): { score: number | null; summary: string } {
  const total = criteria.reduce((s, c) => s + c.score, 0);
  const maxTotal = criteria.reduce((s, c) => s + c.max, 0);
  const scorePct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : null;
  const exec = executiveSummary?.trim() ?? '';
  const rubricLine = buildAIFeedback(criteria);
  const summary = exec ? (rubricLine ? `${exec}\n\n${rubricLine}` : exec) : rubricLine;
  return { score: scorePct, summary };
}

/** Parses the manual teacher grade input. Returns null when blank or out of range. */
function parseTeacherScoreInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 100) return null;
  return Math.round(n);
}

function getReadiness(criteria: AICriterion[], bodyText: string): ReadinessResult {
  if (isInsufficientSubmissionText(bodyText)) {
    return {
      ready: false,
      missing: ['Document body'],
      message:
        'Cannot accept an empty or nearly empty submission. Paste extracted text above (try Open file) or choose Needs resubmission.',
    };
  }
  if (criteria.length === 0) {
    return {
      ready: false,
      missing: ['No AI criteria found'],
      message: 'Run AI inspection first before accepting this submission.',
    };
  }
  const missingNames = criteria
    .filter((c) => {
      if (c.max <= 0) return false;
      const ratio = c.score / c.max;
      const strictGrammar =
        c.name === 'Grammar & mechanics' || c.name === 'Length & structural completeness';
      return strictGrammar ? ratio < 0.55 : ratio < 0.6;
    })
    .map((c) => c.name);
  const uniqueMissing = [...new Set(missingNames)];
  if (uniqueMissing.length > 0) {
    return {
      ready: false,
      missing: uniqueMissing,
      message: `Cannot publish yet — adjust content or scores: ${uniqueMissing.slice(0, 6).join(', ')}${uniqueMissing.length > 6 ? '…' : '.'}`,
    };
  }
  return { ready: true, missing: [], message: 'Submission is ready for teacher approval.' };
}

function base64ToUtf8(b64: string): string {
  const clean = b64.replace(/\s/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function looksLikeTextualHttpUrl(u: string): boolean {
  return /\.(txt|md|csv|json|xml|html?)(\?|$)/i.test(u);
}

function looksLikeBinaryHttpUrl(u: string): boolean {
  return /\.(pdf|png|jpe?g|gif|webp|jfif|doc|docx|ppt|pptx|xls|xlsx|zip)(\?|$)/i.test(u);
}

/** Keeps TAB/LF/CR; rejects other C0 controls (same intent as legacy /[\\x00-\\x08...]/ guard). */
function sampleHasSuspiciousBinaryControls(sample: string): boolean {
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13) continue;
    if (c < 32) return true;
  }
  return false;
}

/** Load text for AI inspection; offer a safe link for PDFs/images/binary without dumping base64 into the textarea. */
async function loadSubmissionInspectionPayload(sub: Submission): Promise<{
  text: string;
  hint: string | null;
  openHref: string | null;
}> {
  const href = sub.file_url?.trim() || null;
  if (!href) return { text: '', hint: null, openHref: null };
  /** For `fetch()` only — protocol-relative URLs need a scheme. */
  const httpFetchUrl = href.startsWith('//') ? `https:${href}` : href;

  if (href.startsWith('blob:')) {
    return {
      text: '',
      hint: 'This submission uses a temporary browser link. Open the file below to preview.',
      openHref: href,
    };
  }

  if (href.startsWith('data:')) {
    const parsed = parseDataUrl(href);
    if (!parsed) {
      return {
        text: '',
        hint: 'Could not parse this data URL for AI text — Open file still previews the attachment.',
        openHref: href,
      };
    }
    const { mime, isBase64, data } = parsed;
    const lower = mime.toLowerCase();
    if (lower.includes('pdf') || lower.startsWith('image/')) {
      return {
        text: '',
        hint: 'This submission is a PDF or image. Open the file below to preview; add a short text summary here if you want keyword-based AI scoring.',
        openHref: href,
      };
    }
    try {
      const raw = isBase64 ? base64ToUtf8(data) : decodeURIComponent(data.replace(/\+/g, '%20'));
      const capped = raw.length > 500_000 ? `${raw.slice(0, 500_000)}\n\n…(truncated)` : raw;
      // Always expose the data URL so "Open file" works for .txt and other text types too.
      return { text: capped, hint: null, openHref: href };
    } catch {
      return { text: '', hint: 'Could not decode file text. Try Open file.', openHref: href };
    }
  }

  if (/^https?:\/\//i.test(httpFetchUrl)) {
    const fetchHref = httpFetchUrl;
    if (looksLikeBinaryHttpUrl(fetchHref)) {
      return {
        text: '',
        hint: 'Binary or rich document — open in a new tab. Paste an excerpt below for AI if needed.',
        openHref: href,
      };
    }
    if (looksLikeTextualHttpUrl(fetchHref)) {
      try {
        const res = await fetch(fetchHref);
        if (!res.ok) throw new Error(String(res.status));
        const t = await res.text();
        const capped = t.length > 500_000 ? `${t.slice(0, 500_000)}\n\n…(truncated)` : t;
        return { text: capped, hint: null, openHref: href };
      } catch {
        return {
          text: '',
          hint: 'Could not fetch file (network, CORS, or expired link). Use Open file.',
          openHref: href,
        };
      }
    }
    try {
      const res = await fetch(fetchHref);
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('pdf') || ct.startsWith('image/')) {
        return { text: '', hint: 'Binary content — use Open file.', openHref: href };
      }
      if (res.ok) {
        const t = await res.text();
        const sample = t.slice(0, 4000);
        if (t.length < 2_000_000 && !sampleHasSuspiciousBinaryControls(sample)) {
          const capped = t.length > 500_000 ? `${t.slice(0, 500_000)}\n\n…(truncated)` : t;
          return { text: capped, hint: null, openHref: href };
        }
      }
    } catch {
      /* fall through */
    }
    return { text: '', hint: 'Use Open file to view this submission.', openHref: href };
  }

  return {
    text: '',
    hint: 'Use Open file to preview the attachment.',
    openHref: href,
  };
}

export default function ReviewQueue() {
  const { user: authUser } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<SubStatus | 'all'>('all');
  const [selected, setSelected] = useState<Submission | null>(null);
  /** Restricts the grading modal to the chosen flow ('ai' or 'teacher'). Set by which row button was pressed. */
  const [gradeMode, setGradeMode] = useState<'ai' | 'teacher' | null>(null);
  const [aiCriteria, setAiCriteria] = useState<AICriterion[]>([]);
  /** Manual per-criterion rubric the teacher scores in Grade-as-teacher mode. Same shape as AI rubric. */
  const [teacherCriteria, setTeacherCriteria] = useState<AICriterion[]>([]);
  const [aiExecutiveSummary, setAiExecutiveSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [inspectionNotice, setInspectionNotice] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const [inspectionText, setInspectionText] = useState('');
  /** Immutable snapshot when the grading modal loads (student text before teacher edits). */
  const [feedback, setFeedback] = useState('');
  /** Working value in the teacher-grade input (string while editing). */
  const [teacherScoreInput, setTeacherScoreInput] = useState('');
  /** Confirmed teacher grade applied via the "Grade as teacher" button. Null = no manual grade. */
  const [appliedTeacherScore, setAppliedTeacherScore] = useState<number | null>(null);
  /** Inline message under the teacher-grade button (validation / confirmation). */
  const [teacherGradeNotice, setTeacherGradeNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const [resubmitSavingId, setResubmitSavingId] = useState<string | null>(null);
  const [fileOpenHref, setFileOpenHref] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const submissionDeepLinkConsumed = useRef<string | null>(null);
  const headerSelectAllRef = useRef<HTMLInputElement>(null);
  /** Latest automated AI run (“before” teacher tweaks criterion sliders). Persisted as `ai_draft_*` when saving. */
  const aiDraftSnapshotRef = useRef<{ score: number | null; summary: string } | null>(null);
  /** Which grade flow the teacher wanted when opening the modal ('ai' | 'teacher'). Drives auto-scroll + auto-run. */
  const pendingGradeIntentRef = useRef<'ai' | 'teacher' | null>(null);
  /** Focus target for the teacher-grade input when the "Grade (Teacher)" row button is pressed. */
  const teacherScoreInputRef = useRef<HTMLInputElement>(null);

  const selectedQueueIds = useMemo(
    () => [...selectedRowIds].filter((id) => submissions.some((s) => s.id === id)),
    [selectedRowIds, submissions]
  );

  function closeGradingModal() {
    setSelected(null);
    setGradeMode(null);
    setFileOpenHref(null);
    setAiExecutiveSummary('');
    setInspectionNotice(null);
    setTeacherScoreInput('');
    setAppliedTeacherScore(null);
    setTeacherGradeNotice(null);
    setTeacherCriteria([]);
  }

  /** Updates one criterion's score (clamped to [0, max]) and syncs the teacher-grade input to the new total. */
  function updateTeacherCriterionScore(idx: number, rawValue: string) {
    setTeacherCriteria((rows) => {
      const next = rows.map((c, i) => {
        if (i !== idx) return c;
        const parsed = Number.parseInt(rawValue, 10);
        const clamped = Number.isFinite(parsed) ? Math.max(0, Math.min(c.max, parsed)) : 0;
        return { ...c, score: clamped };
      });
      /** Rubric is normalised to 100 points, so the raw sum is already the publishable grade. */
      const rubricTotal = next.reduce((s, c) => s + c.score, 0);
      setTeacherScoreInput(String(rubricTotal));
      if (teacherGradeNotice) setTeacherGradeNotice(null);
      /** Live rubric edits invalidate any previously-applied flat grade so the new total wins. */
      if (appliedTeacherScore != null && appliedTeacherScore !== rubricTotal) {
        setAppliedTeacherScore(null);
      }
      return next;
    });
  }

  function updateTeacherCriterionComment(idx: number, comment: string) {
    setTeacherCriteria((rows) => rows.map((c, i) => (i === idx ? { ...c, comment } : c)));
  }

  function resetTeacherRubric() {
    setTeacherCriteria((rows) => rows.map((c) => ({ ...c, score: 0, comment: '' })));
    setTeacherScoreInput('');
    setAppliedTeacherScore(null);
    setTeacherGradeNotice(null);
  }

  /** Validates the manual grade input and "applies" it as the published teacher score. */
  function applyTeacherGrade() {
    const parsed = parseTeacherScoreInput(teacherScoreInput);
    if (teacherScoreInput.trim() === '') {
      setTeacherGradeNotice({
        kind: 'err',
        text: 'Type a grade (0–100) before pressing Grade as teacher.',
      });
      return;
    }
    if (parsed == null) {
      setTeacherGradeNotice({
        kind: 'err',
        text: 'Teacher grade must be a whole number between 0 and 100.',
      });
      return;
    }
    setAppliedTeacherScore(parsed);
    setTeacherScoreInput(String(parsed));
    setTeacherGradeNotice({
      kind: 'ok',
      text: `Teacher grade ${parsed}% saved. Publish to make it visible to the student.`,
    });
  }

  function clearTeacherGrade() {
    setTeacherScoreInput('');
    setAppliedTeacherScore(null);
    setTeacherGradeNotice(null);
  }

  function toggleRowSelected(id: string) {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function deleteByIds(ids: string[]) {
    if (ids.length === 0) return;
    const msg =
      ids.length === 1
        ? 'Delete this submission permanently?'
        : `Delete ${ids.length} submissions permanently?`;
    if (!window.confirm(msg)) return;

    setDeleting(true);
    try {
      const hintRows = submissions.filter((sub) => ids.includes(sub.id));
      const purgeLocalDuplicatesOf = hintRows.map((sub) => ({
        student_id: sub.student_id,
        file_name: sub.file_name,
        file_url: sub.file_url,
      }));
      const result = await deleteTeacherSubmissionsByIds(ids, { purgeLocalDuplicatesOf });
      if (!result.ok) {
        alert(
          `Could not delete from database: ${result.message}\n\nIf permission was denied, add a teacher DELETE policy (see docs/supabase-rls-submissions-teacher-delete.sql).\n\nLocal-only rows are still removed in this browser.`
        );
      }
      if (selected && ids.includes(selected.id)) closeGradingModal();
      setSelectedRowIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      await load();
    } finally {
      setDeleting(false);
    }
  }

  async function load() {
    setLoading(true);
    try {
      await syncAllLocalSubmissionsToSupabase();
      setSubmissions(await fetchTeacherSubmissionRows());
    } catch (e) {
      console.error('[grading] Failed to load queue:', e);
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(() => {
    const all = submissions;
    return {
      total: all.length,
      submitted: all.filter((s) => s.status === 'submitted').length,
      under_review: all.filter((s) => s.status === 'under_review').length,
      reviewed: all.filter((s) => s.status === 'reviewed').length,
      resubmit: all.filter((s) => s.status === 'resubmit').length,
    };
  }, [submissions]);

  useEffect(() => {
    void load();
  }, []);

  /**
   * Build the teacher-scorable rubric from the AI rubric template, rescaling each criterion's
   * `max` proportionally so the total adds up to exactly 100 points. The last row absorbs any
   * rounding error so the rubric is guaranteed to total 100, never 99 or 101.
   */
  function buildTeacherRubricOutOfHundred(template: AICriterion[]): AICriterion[] {
    if (template.length === 0) return [];
    const TARGET = 100;
    const totalMax = template.reduce((s, c) => s + c.max, 0);
    if (totalMax <= 0) {
      const even = Math.floor(TARGET / template.length);
      const remainder = TARGET - even * template.length;
      return template.map((c, i) => ({
        name: c.name,
        max: i === template.length - 1 ? even + remainder : even,
        score: 0,
        comment: '',
      }));
    }
    const scaled = template.map((c) => Math.max(1, Math.round((c.max / totalMax) * TARGET)));
    const drift = TARGET - scaled.reduce((s, n) => s + n, 0);
    scaled[scaled.length - 1] = Math.max(1, scaled[scaled.length - 1] + drift);
    return template.map((c, i) => ({
      name: c.name,
      max: scaled[i],
      score: 0,
      comment: '',
    }));
  }

  async function openReview(sub: Submission, intent: 'ai' | 'teacher' | null = null) {
    pendingGradeIntentRef.current = intent;
    setGradeMode(intent);
    setSelected(sub);
    setFeedback(sub.feedback || '');
    setAiCriteria([]);
    setAiExecutiveSummary('');
    setInspectionNotice(null);
    setInspectionText('');
    setFileOpenHref(null);
    /** Restore the teacher's previously-published manual grade so a re-grade starts where they left off. */
    const priorScore = sub.status === 'reviewed' && sub.score != null ? sub.score : null;
    setTeacherScoreInput(priorScore != null ? String(priorScore) : '');
    setAppliedTeacherScore(priorScore);
    setTeacherGradeNotice(null);
    setAiLoading(true);
    const table = await resolveSubmissionTableName();
    if (table) {
      await supabase.from(table).update({ status: 'under_review' }).eq('id', sub.id);
    } else if (sub.id.startsWith('local_')) {
      const localRaw = localStorage.getItem(TEACHER_LOCAL_SUBMISSION_KEY);
      const localRows = localRaw ? (JSON.parse(localRaw) as LocalSubmissionRow[]) : [];
      const updated = localRows.map((row) => (row.id === sub.id ? { ...row, status: 'under_review' as SubStatus } : row));
      localStorage.setItem(TEACHER_LOCAL_SUBMISSION_KEY, JSON.stringify(updated));
    }
    const payload = await loadSubmissionInspectionPayload(sub);
    setInspectionText(payload.text);
    setFileOpenHref(payload.openHref);
    const criteria = runFullAIDraft(gradingDocTypeForAI(sub), payload.text);
    aiDraftSnapshotRef.current = criteriaToDraftSnapshot(criteria, null);
    setAiCriteria(criteria);
    if (!sub.feedback) setFeedback(buildAIFeedback(criteria));
    /** Seed the teacher's rubric with the same criterion names but normalize maxes to sum to 100 points. */
    setTeacherCriteria(buildTeacherRubricOutOfHundred(criteria));
    setAiLoading(false);
  }

  /**
   * After the modal opens AND the initial AI draft finishes, jump the teacher to the section that
   * matches the row button they pressed: AI section (and auto-trigger Gemini) for "Grade AI",
   * Teacher section (and focus the score input) for "Grade Teacher".
   */
  useEffect(() => {
    if (!selected || aiLoading) return;
    const intent = pendingGradeIntentRef.current;
    if (!intent) return;
    pendingGradeIntentRef.current = null;
    if (intent === 'ai') {
      void runInspectionNow();
      const el = document.getElementById('grading-ai-section');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (intent === 'teacher') {
      const el = document.getElementById('grading-teacher-section');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(() => {
        teacherScoreInputRef.current?.focus();
        teacherScoreInputRef.current?.select();
      }, 350);
    }
    /** Intentional: react only to modal-open + aiLoading transitions for this submission. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, aiLoading]);

  useEffect(() => {
    const raw = searchParams.get('submission');
    if (!raw || !isPlausibleSubmissionId(raw)) {
      submissionDeepLinkConsumed.current = null;
      if (searchParams.has('submission')) {
        const next = new URLSearchParams(searchParams);
        next.delete('submission');
        setSearchParams(next, { replace: true });
      }
      return;
    }
    const id = decodeURIComponent(raw);
    if (!isPlausibleSubmissionId(id)) {
      submissionDeepLinkConsumed.current = null;
      const next = new URLSearchParams(searchParams);
      next.delete('submission');
      setSearchParams(next, { replace: true });
      return;
    }
    if (loading || submissions.length === 0) return;
    if (submissionDeepLinkConsumed.current === id) return;
    const match = submissions.find((s) => s.id === id);
    if (!match) return;
    submissionDeepLinkConsumed.current = id;
    const next = new URLSearchParams(searchParams);
    next.delete('submission');
    setSearchParams(next, { replace: true });
    void openReview(match);
  }, [loading, submissions, searchParams, setSearchParams]);

  async function runInspectionNow() {
    if (!selected) return;
    const docType = gradingDocTypeForAI(selected);
    const template = runFullAIDraft(docType, inspectionText);
    const evalUrl = (import.meta.env.VITE_GEMINI_EVAL_URL as string | undefined)?.trim();
    const apiKey = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim();
    const model = (import.meta.env.VITE_GEMINI_MODEL as string | undefined)?.trim();

    if (!evalUrl && !apiKey) {
      aiDraftSnapshotRef.current = criteriaToDraftSnapshot(template, null);
      setAiCriteria(template);
      setAiExecutiveSummary('');
      if (!feedback.trim()) setFeedback(buildAIFeedback(template));
      return;
    }

    setInspectionNotice(null);
    setAiLoading(true);
    try {
      const result = await runGeminiBackedEvaluation({
        docType,
        content: inspectionText,
        template,
        evalUrl: evalUrl || null,
        apiKey: apiKey || null,
        model: model || null,
      });
      if (result) {
        aiDraftSnapshotRef.current = criteriaToDraftSnapshot(result.criteria, result.executiveSummary);
        setAiCriteria(result.criteria);
        setAiExecutiveSummary(result.executiveSummary);
        if (!feedback.trim()) setFeedback(buildAIFeedback(result.criteria));
        setInspectionNotice({
          kind: 'ok',
          text: 'Gemini updated scores, comments, and the executive summary. Fine-tune below if needed, then save.',
        });
      } else {
        aiDraftSnapshotRef.current = criteriaToDraftSnapshot(template, null);
        setAiCriteria(template);
        setAiExecutiveSummary('');
        if (!feedback.trim()) setFeedback(buildAIFeedback(template));
        setInspectionNotice({
          kind: 'warn',
          text: 'Gemini did not return usable JSON. Using the built-in draft. Open DevTools → Console for details.',
        });
      }
    } catch (e) {
      console.error('[grading] Gemini / eval URL failed:', e);
      aiDraftSnapshotRef.current = criteriaToDraftSnapshot(template, null);
      setAiCriteria(template);
      setAiExecutiveSummary('');
      if (!feedback.trim()) setFeedback(buildAIFeedback(template));
      setInspectionNotice({ kind: 'err', text: formatGeminiEvaluationError(e) });
    } finally {
      setAiLoading(false);
    }
  }

  async function saveReview(status: SubStatus) {
    if (!selected) return;
    if (status === 'reviewed') {
      if (gradeMode === 'teacher') {
        if (appliedTeacherScore == null) {
          const pending = parseTeacherScoreInput(teacherScoreInput);
          alert(
            pending != null
              ? 'Press "Grade as teacher" first to apply the score you typed, then Publish.'
              : 'Type a teacher grade (0–100) and press "Grade as teacher" before publishing.'
          );
          return;
        }
      } else {
        /** AI mode (or legacy): need a usable AI grade. */
        const canPublish = getReadiness(aiCriteria, inspectionText);
        if (!canPublish.ready) {
          alert(canPublish.message);
          return;
        }
      }
    }
    setSaving(true);
    const total = aiCriteria.reduce((s, c) => s + c.score, 0);
    const maxTotal = aiCriteria.reduce((s, c) => s + c.max, 0);
    const aiAggregateScore = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : null;
    /** Mode picks the source: AI flow publishes the AI score, Teacher flow publishes the applied teacher score. */
    const score =
      gradeMode === 'teacher'
        ? appliedTeacherScore
        : gradeMode === 'ai'
          ? aiAggregateScore
          : appliedTeacherScore != null
            ? appliedTeacherScore
            : aiAggregateScore;
    const nextStatus = status === 'reviewed' ? 'reviewed' : status === 'resubmit' ? 'resubmit' : 'under_review';
    const draft = aiDraftSnapshotRef.current;
    const ai_draft_score = draft?.score ?? null;
    const ai_draft_summary = draft?.summary ?? null;
    const feedbackOut =
      nextStatus === 'resubmit' && !feedback.trim()
        ? DEFAULT_TEACHER_RESUBMIT_FEEDBACK
        : feedback;
    /** No published scores or AI drafts until a real graded publish — avoids confusing learners. */
    const basePayload =
      nextStatus === 'resubmit'
        ? {
            status: nextStatus as SubStatus,
            feedback: feedbackOut,
            score: null as number | null,
            ai_draft_score: null as number | null,
            ai_draft_summary: null as string | null,
          }
        : { status: nextStatus, feedback: feedbackOut, score };
    const fullPayload =
      nextStatus === 'resubmit'
        ? basePayload
        : {
            ...(basePayload as { status: SubStatus; feedback: string; score: number | null }),
            ai_draft_score,
            ai_draft_summary,
          };
    const table = await resolveSubmissionTableName();
    if (table) {
      const { error } = await supabase.from(table).update(fullPayload).eq('id', selected.id);
      const missingAiCols =
        error?.message &&
        /ai_draft|could not find|column|PGRST204|schema cache/i.test(error.message);
      if (error && missingAiCols) {
        const { error: e2 } = await supabase.from(table).update(basePayload).eq('id', selected.id);
        if (e2) {
          alert(e2.message);
          setSaving(false);
          return;
        }
      } else if (error) {
        alert(error.message);
        setSaving(false);
        return;
      }
    } else if (selected.id.startsWith('local_')) {
      const localRaw = localStorage.getItem(TEACHER_LOCAL_SUBMISSION_KEY);
      const localRows = localRaw ? (JSON.parse(localRaw) as LocalSubmissionRow[]) : [];
      const updated = localRows.map((row) => {
        if (row.id !== selected.id) return row;
        if (nextStatus === 'resubmit') {
          return {
            ...row,
            status: nextStatus,
            feedback: feedbackOut,
            score: null,
            ai_draft_score: null,
            ai_draft_summary: null,
          };
        }
        return { ...row, status: nextStatus, feedback: feedbackOut, score, ai_draft_score, ai_draft_summary };
      });
      localStorage.setItem(TEACHER_LOCAL_SUBMISSION_KEY, JSON.stringify(updated));
    }
    setSaving(false);
    closeGradingModal();
    load();
  }

  async function quickRequestResubmission(sub: Submission) {
    const msg = `Request resubmission for “${sub.file_name}”?\n\nThe student will see an alert on their dashboard and submissions list asking them to upload a revised file (e.g. empty or incomplete work). No grade will be shown until they submit again and staff publish a score.`;
    if (!window.confirm(msg)) return;

    setResubmitSavingId(sub.id);
    try {
      const result = await performTeacherResubmitRequest({ id: sub.id, feedback: sub.feedback });
      if (!result.ok) {
        alert(result.message);
        return;
      }
      if (selected?.id === sub.id) closeGradingModal();
      await load();
    } finally {
      setResubmitSavingId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return submissions.filter((s) => {
      if (!(filter === 'all' || s.status === filter)) return false;
      if (!q) return true;
      const hay = [
        s.file_name ?? '',
        s.users?.full_name ?? '',
        s.users?.email ?? '',
        s.users?.student_number ?? '',
        s.student_id ?? '',
        submissionQueueTitle(s),
        s.assignments?.title ?? '',
        s.team_code ?? '',
        s.school_year ?? '',
        s.semester ?? '',
        s.users?.course_year ?? '',
        s.submission_doc_type ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [submissions, filter, search]);

  function toggleSelectAllFiltered() {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      const allOn = filtered.length > 0 && filtered.every((s) => next.has(s.id));
      if (allOn) {
        for (const s of filtered) next.delete(s.id);
      } else {
        for (const s of filtered) next.add(s.id);
      }
      return next;
    });
  }

  useEffect(() => {
    const el = headerSelectAllRef.current;
    if (!el) return;
    const allOn = filtered.length > 0 && filtered.every((s) => selectedRowIds.has(s.id));
    const someOn = filtered.some((s) => selectedRowIds.has(s.id));
    el.checked = allOn;
    el.indeterminate = someOn && !allOn;
  }, [filtered, selectedRowIds]);

  function exportReviewedCsv() {
    const reviewed = submissions.filter(s => s.status === 'reviewed');
    if (reviewed.length === 0) return;
    const headers = ['Student Name', 'Student Email', 'Submission', 'File Name', 'Score', 'Status', 'Submitted At'];
    const rows = reviewed.map(s => [
      s.users?.full_name ?? '',
      s.users?.email ?? '',
      submissionQueueTitle(s),
      s.file_name,
      s.score?.toString() ?? '',
      s.status,
      new Date(s.submitted_at).toLocaleString(),
    ]);
    const csv = [headers, ...rows]
      .map(row => row.map(v => `"${(v || '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `reviewed-grades-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const totalScore = aiCriteria.reduce((s, c) => s + c.score, 0);
  const maxScore = aiCriteria.reduce((s, c) => s + c.max, 0);
  const readiness = useMemo(() => getReadiness(aiCriteria, inspectionText), [aiCriteria, inspectionText]);

  /** Fallback when `fileOpenHref` is not set yet; modal uses `SubmissionOpenLink`. */
  const submissionFileOpenUrl = selected?.file_url?.trim() || '';

  return (
    <TeacherWorkspaceShell>
      <TeacherPageHeader
        eyebrow="Grading system"
        title="Grading workspace"
        icon={ClipboardList}
        description={
          <>
            AI drafts scores and feedback; you review, adjust, then publish. Each row has two grade buttons —{' '}
            <span className="font-semibold text-emerald-800">Grade AI</span> auto-runs the rubric,{' '}
            <span className="font-semibold text-[#84001B]">Grade Teacher</span> jumps to the manual score — plus{' '}
            <span className="font-semibold text-slate-800">Redo · Delete</span>. Same tools as{' '}
            <Link className="font-semibold text-[#84001B] hover:underline" to="/class-list">
              Class list
            </Link>{' '}
            and{' '}
            <Link className="font-semibold text-[#84001B] hover:underline" to="/student-submissions">
              Submission roster
            </Link>
            .
          </>
        }
        actions={
          <>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Refresh queue
            </button>
            <button
              type="button"
              onClick={exportReviewedCsv}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Download className="w-3.5 h-3.5" aria-hidden />
              Export grades CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Printer className="w-3.5 h-3.5" aria-hidden />
              Print
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Total in queue', value: stats.total },
          { label: 'Needs grading', value: stats.submitted },
          { label: 'In progress', value: stats.under_review },
          { label: 'Published', value: stats.reviewed },
          { label: 'Resubmit', value: stats.resubmit },
        ].map((row) => (
          <div
            key={row.label}
            className="bg-white border border-slate-200/90 rounded-xl px-4 py-3 shadow-sm"
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{row.label}</p>
            <p className="text-xl font-bold text-slate-900 mt-0.5 tabular-nums">{loading ? '—' : row.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 grid md:grid-cols-4 gap-3">
        <div className="md:col-span-4 flex flex-wrap items-center gap-2 text-xs text-slate-600 bg-amber-50/60 border border-amber-100/90 rounded-xl px-4 py-3">
          <span className="font-semibold text-amber-950">Workflow</span>
          <span className="text-amber-800/80">—</span>
          <span className="px-2 py-0.5 rounded-md bg-white/90 border border-amber-100 text-amber-900">1. Open row</span>
          <ArrowRight className="w-3 h-3 text-amber-300 shrink-0" aria-hidden />
          <span className="px-2 py-0.5 rounded-md bg-white/90 border border-amber-100 text-amber-900">2. AI inspect</span>
          <ArrowRight className="w-3 h-3 text-amber-300 shrink-0" aria-hidden />
          <span className="px-2 py-0.5 rounded-md bg-white/90 border border-amber-100 text-amber-900">3. Teacher adjust</span>
          <ArrowRight className="w-3 h-3 text-amber-300 shrink-0" aria-hidden />
          <span className="px-2 py-0.5 rounded-md bg-[#84001B]/15 text-[#84001B] font-semibold border border-[#84001B]/20">
            4. Publish
          </span>
        </div>
      </div>

      <TeacherSearchSurface
        value={search}
        onChange={setSearch}
        placeholder="Search student name, email, file name, or title…"
        footer={
          <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex gap-2 flex-wrap">
              {(['all', 'submitted', 'under_review', 'reviewed', 'resubmit'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFilter(s)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors capitalize whitespace-nowrap ${
                    filter === s
                      ? 'bg-[#84001B] text-white shadow-sm'
                      : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">
              {loading ? (
                '…'
              ) : (
                <>
                  Showing <span className="font-semibold text-slate-700 tabular-nums">{filtered.length}</span> in this view
                </>
              )}
            </p>
          </div>
        }
      />

      {!loading && filtered.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button
            type="button"
            disabled={selectedQueueIds.length === 0 || deleting}
            onClick={() => void deleteByIds(selectedQueueIds)}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border border-red-200 bg-red-50 text-red-800 hover:bg-red-100 disabled:opacity-50 disabled:pointer-events-none"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete selected ({selectedQueueIds.length})
          </button>
          <span className="text-[11px] text-slate-500">
            Select rows for bulk delete, or use Grade AI / Grade Teacher / Redo / Delete per row — same submission actions as{' '}
            <Link to="/class-list" className="font-semibold text-[#84001B] hover:underline">
              Class list
            </Link>{' '}
            and Submission roster.
          </span>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center">
          <ClipboardList className="w-12 h-12 mx-auto mb-4 text-gray-200" />
          <p className="text-gray-800 font-semibold text-lg mb-1">Nothing in this view</p>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
            {submissions.length === 0
              ? 'When students submit files, they appear here. Submissions saved locally (offline fallback) are merged automatically.'
              : 'Try clearing filters — set status to All or widen your search.'}
          </p>
          {!loading &&
            submissions.length === 0 &&
            (authUser?.role === 'teacher' || authUser?.role === 'admin') && (
              <p className="text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 max-w-xl mx-auto mb-6 text-left leading-relaxed">
                If students already submitted work but this queue is still empty, your database profile may still be a student.
                Staff accounts need <span className="font-mono">public.users.role</span> set to teacher or admin so row-level
                security allows viewing everyone&apos;s submissions. Add your Google email to{' '}
                <span className="font-mono">VITE_TEACHER_EMAILS</span> in <span className="font-mono">.env</span>, restart the
                app, and sign in again, or run the one-time SQL in{' '}
                <span className="font-mono">docs/supabase-teacher-submissions-visibility.sql</span>.
              </p>
            )}
          <div className="flex flex-wrap gap-3 justify-center">
            <button
              type="button"
              onClick={() => {
                setFilter('all');
                setSearch('');
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-[#84001B] text-white hover:bg-[#6b0016]"
            >
              Show all statuses
            </button>
            <Link
              to="/inbox"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              <Inbox className="w-4 h-4" /> Open inbox
            </Link>
            <Link
              to="/student-submissions"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              Submission roster
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* spreadsheet-style desktop (roster columns) */}
          <div className={`hidden md:block ${teacherRoundedTableShell}`}>
            <TeacherAmberCue title="Submission queue">
              Maroon header matches Class list. Scroll sideways on small screens; checkboxes support bulk delete.
            </TeacherAmberCue>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px] text-sm border-collapse">
                <thead>
                  <tr className={teacherMaroonTheadClasses}>
                    <th className="w-10 px-2 py-3 text-center align-middle text-white/95">
                      <input
                        ref={headerSelectAllRef}
                        type="checkbox"
                        className="h-4 w-4 rounded border-white/40 bg-white/10 text-[#ffd21a] focus:ring-[#ffd21a]/40"
                        aria-label="Select all in view"
                        onChange={() => toggleSelectAllFiltered()}
                      />
                    </th>
                    <th className="px-3 py-3 text-left min-w-[96px] text-white">Title</th>
                    <th className="px-3 py-3 text-left min-w-[140px] text-white">File name</th>
                    <th className="px-3 py-3 text-left min-w-[120px] text-white">Student ID</th>
                    <th className="px-3 py-3 text-left min-w-[140px] text-white">Student name</th>
                    <th className="px-3 py-3 text-left min-w-[112px] text-white">Date submitted</th>
                    <th className="px-3 py-3 text-left min-w-[112px] text-white">Last modified</th>
                    <th className="px-3 py-3 text-left min-w-[100px] text-white">Course & year</th>
                    <th className="px-3 py-3 text-left min-w-[72px] text-white">Team code</th>
                    <th className="px-3 py-3 text-left min-w-[72px] text-white">SY</th>
                    <th className="px-3 py-3 text-left min-w-[72px] text-white">Semester</th>
                    <th className="px-3 py-3 text-left min-w-[100px] text-white">Status</th>
                    <th className="px-3 py-3 text-right min-w-[220px] text-white">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((s) => {
                    const subDm = formatStackedDateTime(s.submitted_at);
                    const modDm = formatStackedDateTime(s.updated_at ?? s.submitted_at);
                    const roster = rosterStatusChip(s);
                    return (
                      <tr key={s.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="px-2 py-3 align-middle text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 text-[#84001B] focus:ring-[#84001B]/30"
                            checked={selectedRowIds.has(s.id)}
                            aria-label={`Select ${s.file_name}`}
                            onChange={() => toggleRowSelected(s.id)}
                          />
                        </td>
                        <td className="px-3 py-3 align-middle text-gray-900 font-medium min-w-0">
                          <span className="truncate block max-w-[14rem]" title={submissionQueueTitle(s)}>
                            {submissionQueueTitle(s)}
                          </span>
                        </td>
                        <td className="px-3 py-3 align-middle min-w-0">
                          <span className="inline-flex items-center gap-2 min-w-0 max-w-[16rem]">
                            <FileText className="w-4 h-4 text-gray-400 shrink-0" aria-hidden />
                            {submissionHasOpenableFileUrl(s.file_url) ? (
                              <SubmissionOpenLink
                                raw={s.file_url!.trim()}
                                fileName={s.file_name}
                                className="font-medium text-[#84001B] hover:underline truncate"
                              >
                                {s.file_name}
                              </SubmissionOpenLink>
                            ) : (
                              <span className="font-medium text-gray-800 truncate">{s.file_name}</span>
                            )}
                          </span>
                          {s.score != null ? (
                            <span className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                              <Star className="w-3 h-3" />
                              {s.score}%
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 align-middle">
                          <span className="inline-block rounded-lg bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-1">
                            {studentIdBadge(s)}
                          </span>
                        </td>
                        <td
                          className="px-3 py-3 align-middle text-gray-900 font-medium truncate max-w-[12rem]"
                          title={s.users?.full_name}
                        >
                          {s.users?.full_name || '—'}
                        </td>
                        <td className="px-3 py-3 align-middle">
                          <div className="inline-flex gap-2 text-xs text-gray-600">
                            <Calendar className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" aria-hidden />
                            <div>
                              <div>{subDm.line1}</div>
                              {subDm.line2 ? <div className="text-gray-400">{subDm.line2}</div> : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 align-middle">
                          <div className="inline-flex gap-2 text-xs text-gray-600">
                            <Calendar className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" aria-hidden />
                            <div>
                              <div>{modDm.line1}</div>
                              {modDm.line2 ? <div className="text-gray-400">{modDm.line2}</div> : null}
                            </div>
                          </div>
                        </td>
                        <td
                          className="px-3 py-3 align-middle text-gray-800 truncate max-w-[7rem]"
                          title={s.users?.course_year ?? ''}
                        >
                          {s.users?.course_year ?? '—'}
                        </td>
                        <td className="px-3 py-3 align-middle text-gray-800">{s.team_code ?? '—'}</td>
                        <td className="px-3 py-3 align-middle text-gray-800">{s.school_year ?? '—'}</td>
                        <td className="px-3 py-3 align-middle text-gray-800 uppercase">{s.semester ?? '—'}</td>
                        <td className="px-3 py-3 align-middle">
                          <span
                            className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-semibold ${roster.className}`}
                          >
                            {roster.showCheck ? <CheckCircle className="w-3.5 h-3.5 shrink-0" aria-hidden /> : null}
                            {roster.label}
                          </span>
                        </td>
                        <td className="px-3 py-3 align-middle text-right">
                          <div className="inline-flex flex-wrap justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={deleting || resubmitSavingId === s.id}
                              onClick={() => void openReview(s, 'ai')}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-900 shadow-sm hover:bg-emerald-100 hover:border-emerald-400 transition-colors disabled:opacity-50"
                              title="Open grading and run the AI rubric automatically"
                            >
                              <Sparkles className="w-3.5 h-3.5 shrink-0" aria-hidden />
                              Grade AI
                            </button>
                            <button
                              type="button"
                              disabled={deleting || resubmitSavingId === s.id}
                              onClick={() => void openReview(s, 'teacher')}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#84001B]/30 bg-[#ffd21a]/15 px-2.5 py-1.5 text-[11px] font-semibold text-[#84001B] shadow-sm hover:bg-[#84001B] hover:text-white hover:border-[#84001B] transition-colors disabled:opacity-50"
                              title="Open grading and jump to the manual teacher grade input"
                            >
                              <GraduationCap className="w-3.5 h-3.5 shrink-0" aria-hidden />
                              Grade Teacher
                            </button>
                            <button
                              type="button"
                              disabled={deleting || resubmitSavingId === s.id}
                              onClick={() => void quickRequestResubmission(s)}
                              className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50 shadow-sm"
                              title="Request resubmission"
                            >
                              <Undo2 className="w-3.5 h-3.5 shrink-0" aria-hidden />
                              Redo
                            </button>
                            <button
                              type="button"
                              disabled={deleting || resubmitSavingId === s.id}
                              onClick={() => void deleteByIds([s.id])}
                              className="inline-flex items-center rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 shadow-sm"
                              title="Delete submission"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map(s => (
              <div key={s.id} className="bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-sm hover:border-gray-200 transition-all">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1.5 h-4 w-4 rounded border-gray-300 text-[#84001B] focus:ring-[#84001B]/30 shrink-0"
                    checked={selectedRowIds.has(s.id)}
                    aria-label={`Select ${s.file_name}`}
                    onChange={() => toggleRowSelected(s.id)}
                  />
                  <div className="w-10 h-10 bg-[#84001B]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-[#84001B]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {submissionHasOpenableFileUrl(s.file_url) ? (
                          <SubmissionOpenLink
                            raw={s.file_url!.trim()}
                            fileName={s.file_name}
                            className="font-semibold text-[#84001B] hover:underline truncate block"
                          >
                            {s.file_name}
                          </SubmissionOpenLink>
                        ) : (
                          <p className="font-semibold text-gray-900 truncate">{s.file_name}</p>
                        )}
                        <p className="text-sm text-gray-500 font-medium truncate">{submissionQueueTitle(s)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          <span className="mr-2 inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 font-medium text-gray-700">
                            {studentIdBadge(s)}
                          </span>
                          {s.users?.full_name || '—'}
                          {(s.users?.course_year || s.team_code || s.school_year || s.semester) && (
                            <span className="block mt-1 text-[11px] text-gray-400">
                              {[s.users?.course_year, s.team_code, s.school_year, s.semester]
                                .filter((x): x is string => Boolean(String(x ?? '').trim()))
                                .join(' · ')}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 flex-col">
                        {s.score != null && (
                          <span className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
                            <Star className="w-3 h-3" />{s.score}%
                          </span>
                        )}
                        {(() => {
                          const r = rosterStatusChip(s);
                          return (
                            <span
                              className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-semibold ${r.className}`}
                            >
                              {r.showCheck ? <CheckCircle className="w-3.5 h-3.5" aria-hidden /> : null}
                              {r.label}
                            </span>
                          );
                        })()}
                        <div className="flex flex-wrap gap-1.5 justify-end max-w-[14rem]">
                          <button
                            type="button"
                            disabled={deleting || resubmitSavingId === s.id}
                            onClick={() => void quickRequestResubmission(s)}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-[10px] font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
                            title="Redo"
                          >
                            <Undo2 className="w-3 h-3 shrink-0" aria-hidden />
                            Redo
                          </button>
                          <button
                            type="button"
                            disabled={deleting || resubmitSavingId === s.id}
                            onClick={() => void deleteByIds([s.id])}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2 py-1.5 text-[10px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3 shrink-0" aria-hidden />
                            Del
                          </button>
                          <button
                            type="button"
                            disabled={deleting || resubmitSavingId === s.id}
                            onClick={() => void openReview(s, 'ai')}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 text-white px-2 py-1.5 text-[10px] font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                            title="Grade with AI"
                          >
                            <Sparkles className="w-3 h-3 shrink-0" aria-hidden />
                            AI
                          </button>
                          <button
                            type="button"
                            disabled={deleting || resubmitSavingId === s.id}
                            onClick={() => void openReview(s, 'teacher')}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#84001B] text-white px-2 py-1.5 text-[10px] font-semibold hover:bg-[#6b0016] transition-colors disabled:opacity-50"
                            title="Grade as teacher"
                          >
                            <GraduationCap className="w-3 h-3 shrink-0" aria-hidden />
                            Teacher
                          </button>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-gray-300 mt-1">{new Date(s.submitted_at).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {selected &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-black/50 backdrop-blur-sm"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeGradingModal();
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="grading-modal-title"
              className="relative flex w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl my-auto max-h-[min(90vh,calc(100vh-2rem))]"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                aria-label="Close"
                onClick={() => closeGradingModal()}
                className="absolute right-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-800 shadow-sm hover:bg-gray-50 hover:text-[#84001B] focus:outline-none focus:ring-2 focus:ring-[#84001B]/35"
              >
                <X className="h-5 w-5" strokeWidth={2.25} />
              </button>
              <div className="shrink-0 border-b border-slate-100 bg-gradient-to-b from-white to-slate-50/40 px-6 pt-5 pr-14">
                <div className="flex items-start gap-3 pb-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                      gradeMode === 'ai'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-[#84001B] text-[#ffd21a]'
                    }`}
                  >
                    {gradeMode === 'ai' ? (
                      <Sparkles className="w-5 h-5" aria-hidden />
                    ) : (
                      <GraduationCap className="w-5 h-5" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 id="grading-modal-title" className="font-bold text-slate-900 text-lg leading-tight">
                      {gradeMode === 'ai'
                        ? 'Grade with AI'
                        : gradeMode === 'teacher'
                          ? 'Grade as teacher'
                          : 'Grade submission'}
                    </h2>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      <span className="font-semibold text-slate-700">
                        {selected.users?.full_name ?? 'Unknown student'}
                      </span>
                      <span className="text-slate-300 mx-1.5">·</span>
                      <span className="font-mono text-slate-600">{selected.file_name}</span>
                    </p>
                  </div>
                </div>
                <ol className="-mx-1 flex items-center gap-1 overflow-x-auto pb-3 text-[10px] font-bold uppercase tracking-wide">
                  {(gradeMode === 'ai'
                    ? [
                        { label: '1. File', Icon: BookOpen, accent: 'none' as const },
                        { label: '2. AI grade', Icon: Sparkles, accent: 'emerald' as const },
                        { label: '3. Publish', Icon: Send, accent: 'maroon' as const },
                      ]
                    : gradeMode === 'teacher'
                      ? [
                          { label: '1. File', Icon: BookOpen, accent: 'none' as const },
                          { label: '2. Teacher grade', Icon: GraduationCap, accent: 'maroon' as const },
                          { label: '3. Feedback', Icon: Send, accent: 'none' as const },
                          { label: '4. Publish', Icon: Send, accent: 'maroon' as const },
                        ]
                      : [
                          { label: '1. File', Icon: BookOpen, accent: 'none' as const },
                          { label: '2. AI grade', Icon: Sparkles, accent: 'none' as const },
                          { label: '3. Teacher grade', Icon: GraduationCap, accent: 'none' as const },
                          { label: '4. Publish', Icon: Send, accent: 'maroon' as const },
                        ]
                  ).map(({ label, Icon, accent }) => (
                    <li
                      key={label}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 whitespace-nowrap ${
                        accent === 'maroon'
                          ? 'border-[#84001B]/25 bg-[#84001B]/8 text-[#84001B]'
                          : accent === 'emerald'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      <Icon className="w-3 h-3" aria-hidden /> {label}
                    </li>
                  ))}
                </ol>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-5 bg-slate-50/30">
                {/* ─── Section 1: Open the file ─── */}
                <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3 mb-3">
                    <SectionBadge n={1} Icon={BookOpen} />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-slate-900">Open the student&apos;s file</h3>
                      <p className="text-[12px] text-slate-500 leading-relaxed">
                        View the attachment in a new tab so you can read it while grading.
                      </p>
                    </div>
                  </div>
                  {(() => {
                    const openRaw = (fileOpenHref || submissionFileOpenUrl || selected.file_url || '').trim();
                    const hasUrl = submissionHasOpenableFileUrl(openRaw);
                    if (!hasUrl) {
                      return (
                        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-900 leading-relaxed">
                          No file link is stored for this row. New uploads use bucket{' '}
                          <code className="rounded bg-white/80 px-1">student-submissions</code> by default. Run{' '}
                          <code className="rounded bg-white/80 px-1">docs/supabase-storage-student-submissions.sql</code> in
                          Supabase, redeploy with <code className="rounded bg-white/80 px-1">.env</code> from{' '}
                          <code className="rounded bg-white/80 px-1">.env.example</code>, then ask the student to submit again.
                        </p>
                      );
                    }
                    return (
                      <SubmissionOpenLink
                        raw={openRaw}
                        fileName={selected.file_name}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#84001B] bg-[#84001B] px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#6b0016] focus:outline-none focus:ring-2 focus:ring-[#84001B]/35"
                      >
                        <Eye className="w-3.5 h-3.5" aria-hidden />
                        Open file
                      </SubmissionOpenLink>
                    );
                  })()}
                </section>

                {/* ─── Section 2: AI grade — hidden in Teacher-only mode ─── */}
                {gradeMode !== 'teacher' && (
                <section
                  id="grading-ai-section"
                  className="rounded-2xl border-2 border-emerald-200/80 bg-white p-4 shadow-sm scroll-mt-4"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <SectionBadge n={2} Icon={Sparkles} accent="emerald" />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-emerald-600" aria-hidden />
                        Grade with AI
                      </h3>
                      <p className="text-[12px] text-slate-500 leading-relaxed">
                        Automated rubric for <span className="font-semibold text-slate-700">{gradingDocTypeForAI(selected)}</span>{' '}
                        plus grammar and length checks.{' '}
                        {import.meta.env.VITE_GEMINI_EVAL_URL || import.meta.env.VITE_GEMINI_API_KEY
                          ? 'Gemini refines scores and comments on each run.'
                          : 'Add VITE_GEMINI_EVAL_URL (recommended) or VITE_GEMINI_API_KEY in .env to use Gemini.'}
                        {gradeMode === 'ai'
                          ? ' This score will be published directly to the student.'
                          : ' Use this as a starting point — your manual grade in step 3 wins on publish.'}
                      </p>
                    </div>
                  </div>
                  <details className="mb-3 rounded-lg border border-slate-200 bg-slate-50/40 group">
                    <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-100/60 rounded-lg flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5">
                        <Wand2 className="w-3 h-3" aria-hidden />
                        Document text the AI will grade
                      </span>
                      <span className="text-[10px] font-medium text-slate-500 normal-case tracking-normal tabular-nums">
                        {inspectionText.trim().split(/\s+/).filter(Boolean).length.toLocaleString()} words
                        <ChevronDown className="w-3.5 h-3.5 inline ml-1 -mt-0.5 group-open:rotate-180 transition-transform" aria-hidden />
                      </span>
                    </summary>
                    <div className="border-t border-slate-200 px-3 py-2.5">
                      <textarea
                        value={inspectionText}
                        onChange={(e) => setInspectionText(e.target.value)}
                        rows={6}
                        placeholder="Paste or fix document text here if the extraction is empty or wrong…"
                        className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/25 focus:border-[#84001B] resize-y bg-white"
                      />
                    </div>
                  </details>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!aiLoading) void runInspectionNow();
                    }}
                    className="mb-3 rounded-xl border border-emerald-200/70 bg-emerald-50/40 p-3"
                    aria-label="AI grade form"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="submit"
                        disabled={aiLoading}
                        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold shadow-md focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60 ${
                          import.meta.env.VITE_GEMINI_EVAL_URL || import.meta.env.VITE_GEMINI_API_KEY
                            ? 'bg-emerald-700 text-white hover:bg-emerald-800 focus:ring-emerald-600/40 shadow-emerald-700/20'
                            : 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 focus:ring-slate-300'
                        }`}
                        title="Run the automated rubric. Result becomes a draft you can override in step 3."
                      >
                        {aiLoading ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                        ) : (
                          <Sparkles className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                        )}
                        {aiLoading ? 'Grading with AI…' : aiCriteria.length === 0 ? 'Grade with AI' : 'Re-grade with AI'}
                      </button>
                      {(import.meta.env.VITE_GEMINI_EVAL_URL || import.meta.env.VITE_GEMINI_API_KEY) && (
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                          Gemini connected
                        </span>
                      )}
                      {aiCriteria.length > 0 && !aiLoading && (
                        <span className="text-[11px] font-semibold text-slate-600 tabular-nums ml-auto">
                          Draft total: <span className="text-emerald-800 text-sm">{maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0}%</span>
                        </span>
                      )}
                    </div>

                    {aiCriteria.length > 0 && !aiLoading ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border-2 border-emerald-300/70 bg-white px-3 py-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-700 text-white px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                          <Sparkles className="w-3 h-3" aria-hidden />
                          AI graded
                        </span>
                        <span className="text-lg font-extrabold tabular-nums text-emerald-800">
                          {maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0}%
                        </span>
                        <span className="text-[11px] text-slate-600">
                          {gradeMode === 'ai'
                            ? 'this is the score that will be published.'
                            : 'draft score · used when no teacher grade is applied in step 3.'}
                        </span>
                      </div>
                    ) : (
                      <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
                        Not graded yet — press <span className="font-semibold">Grade with AI</span> to generate a draft rubric.
                      </p>
                    )}

                    {inspectionNotice && (
                      <div
                        className={`mt-2 flex gap-2 rounded-lg border px-3 py-2 text-xs leading-snug ${
                          inspectionNotice.kind === 'ok'
                            ? 'border-emerald-200 bg-white text-emerald-950'
                            : inspectionNotice.kind === 'warn'
                              ? 'border-amber-200 bg-amber-50 text-amber-950'
                              : 'border-red-200 bg-red-50 text-red-950'
                        }`}
                        role="status"
                      >
                        <span className="min-w-0 flex-1">{inspectionNotice.text}</span>
                        <button
                          type="button"
                          onClick={() => setInspectionNotice(null)}
                          className="shrink-0 rounded p-0.5 text-current opacity-70 hover:opacity-100"
                          aria-label="Dismiss notice"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </form>
                  {aiLoading && aiCriteria.length === 0 ? (
                    <div className="space-y-3">
                      {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-200/60" />
                      ))}
                    </div>
                  ) : aiCriteria.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
                      <Sparkles className="w-8 h-8 text-slate-300 mx-auto mb-2" aria-hidden />
                      <p className="text-sm font-semibold text-slate-700">No AI report yet</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Press <span className="font-semibold text-emerald-800">Grade with AI</span> above to generate a rubric.
                      </p>
                    </div>
                  ) : (
                    <div className={aiLoading ? 'relative' : undefined}>
                      {aiLoading && (
                        <div
                          className="pointer-events-none absolute inset-0 z-[1] rounded-xl bg-white/40 backdrop-blur-[1px]"
                          aria-hidden
                        />
                      )}
                      {aiLoading && (
                        <p className="absolute left-1/2 top-3 z-[2] -translate-x-1/2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-700 shadow-sm">
                          Updating with Gemini…
                        </p>
                      )}
                      <AIDocumentEvaluationReport
                        criteria={aiCriteria}
                        aiScorePercent={maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : null}
                        teacherScorePercent={
                          selected.status === 'reviewed' && selected.score != null ? selected.score : null
                        }
                        summaryText={aiExecutiveSummary.trim() ? aiExecutiveSummary : buildAIFeedback(aiCriteria)}
                        showTeacherGrade={gradeMode !== 'ai'}
                      />
                    </div>
                  )}
                </section>
                )}

                {/* ─── Section 3: Teacher grade — hidden in AI-only mode ─── */}
                {gradeMode !== 'ai' && (
                <section
                  id="grading-teacher-section"
                  className="rounded-2xl border-2 border-[#84001B]/30 bg-white p-4 shadow-sm scroll-mt-4"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <SectionBadge
                      n={gradeMode === 'teacher' ? 2 : 3}
                      Icon={GraduationCap}
                      accent="maroon"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
                        <GraduationCap className="w-4 h-4 text-[#84001B]" aria-hidden />
                        Grade as teacher
                      </h3>
                      <p className="text-[12px] text-slate-500 leading-relaxed">
                        Set your own grade out of 100. This is the <span className="font-semibold text-slate-700">official</span>{' '}
                        score the student sees after publish.
                        {gradeMode === 'teacher'
                          ? ' Apply the grade, write feedback, then publish.'
                          : ' Leave it blank to publish the AI score from step 2.'}
                      </p>
                    </div>
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      applyTeacherGrade();
                    }}
                    className="rounded-xl border border-[#84001B]/15 bg-[#ffd21a]/8 p-3"
                    aria-label="Teacher grade form"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="inline-flex items-stretch rounded-xl border-2 border-[#84001B]/25 bg-white overflow-hidden focus-within:border-[#84001B] focus-within:ring-2 focus-within:ring-[#84001B]/20">
                        <span className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-[#84001B] bg-[#ffd21a]/30 border-r border-[#84001B]/15 flex items-center">
                          Teacher
                        </span>
                        <input
                          ref={teacherScoreInputRef}
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          inputMode="numeric"
                          value={teacherScoreInput}
                          onChange={(e) => {
                            setTeacherScoreInput(e.target.value);
                            if (teacherGradeNotice) setTeacherGradeNotice(null);
                          }}
                          placeholder="—"
                          aria-label="Teacher grade out of 100"
                          className="w-24 px-3 py-2 text-xl font-extrabold tabular-nums text-[#84001B] bg-white focus:outline-none placeholder:text-slate-300"
                        />
                        <span className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 bg-slate-50 border-l border-slate-200 flex items-center">
                          / 100
                        </span>
                      </label>
                      <button
                        type="submit"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#84001B] text-white text-sm font-bold shadow-md shadow-[#84001B]/20 hover:bg-[#6b0016] disabled:opacity-60 disabled:cursor-not-allowed"
                        title="Save the teacher grade. Press Publish in the footer to send it to the student."
                      >
                        <GraduationCap className="w-4 h-4" aria-hidden />
                        Grade as teacher
                      </button>
                      {gradeMode !== 'teacher' && aiCriteria.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const aiTotal = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : null;
                            if (aiTotal != null) {
                              setTeacherScoreInput(String(aiTotal));
                              setTeacherGradeNotice(null);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-300 bg-white text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
                          title="Copy the AI rubric total into the teacher grade input."
                        >
                          <Sparkles className="w-3.5 h-3.5" aria-hidden />
                          Use AI score
                          <span className="text-emerald-900 font-bold tabular-nums ml-0.5">
                            ({maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0}%)
                          </span>
                        </button>
                      )}
                      {(teacherScoreInput.trim() !== '' || appliedTeacherScore != null) && (
                        <button
                          type="button"
                          onClick={() => clearTeacherGrade()}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          <X className="w-3.5 h-3.5" aria-hidden />
                          Clear
                        </button>
                      )}
                    </div>

                    {appliedTeacherScore != null ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border-2 border-[#84001B]/35 bg-white px-3 py-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#84001B] text-[#ffd21a] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                          <GraduationCap className="w-3 h-3" aria-hidden />
                          Teacher graded
                        </span>
                        <span className="text-lg font-extrabold tabular-nums text-[#84001B]">
                          {appliedTeacherScore}%
                        </span>
                        <span className="text-[11px] text-slate-600">
                          will be the published score · press <span className="font-semibold">Publish</span> in the footer.
                        </span>
                      </div>
                    ) : (
                      <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
                        {gradeMode === 'teacher'
                          ? 'Type a grade and press Grade as teacher to apply it.'
                          : 'Not graded yet — publish will use the AI score from step 2.'}
                      </p>
                    )}

                    {teacherGradeNotice && (
                      <p
                        className={`mt-2 text-[11px] font-medium rounded-lg border px-3 py-2 ${
                          teacherGradeNotice.kind === 'ok'
                            ? 'text-emerald-900 bg-emerald-50 border-emerald-200'
                            : 'text-red-800 bg-red-50 border-red-200'
                        }`}
                        role="status"
                      >
                        {teacherGradeNotice.text}
                      </p>
                    )}
                  </form>

                  {gradeMode === 'teacher' && teacherCriteria.length > 0 && (() => {
                    const rubricMax = teacherCriteria.reduce((s, c) => s + c.max, 0);
                    const rubricSum = teacherCriteria.reduce((s, c) => s + c.score, 0);
                    return (
                      <div className="mt-4 rounded-xl border-2 border-[#84001B]/15 bg-white p-3">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#84001B]">
                              <GraduationCap className="h-3.5 w-3.5" aria-hidden />
                              Teacher rubric
                            </p>
                            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                              Score each criterion below. The total auto-fills the teacher grade above.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => resetTeacherRubric()}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                            title="Clear every criterion score back to 0."
                          >
                            <X className="w-3 h-3" aria-hidden />
                            Reset rubric
                          </button>
                        </div>

                        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 overflow-hidden">
                          {teacherCriteria.map((c, idx) => (
                            <div key={`${c.name}-${idx}`} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[1fr_auto] sm:items-start bg-white">
                              <div className="min-w-0">
                                <p className="text-[13px] font-bold text-slate-800 truncate">
                                  <span className="text-slate-400 tabular-nums mr-1.5">{idx + 1}.</span>
                                  {c.name}
                                </p>
                                <textarea
                                  value={c.comment}
                                  onChange={(e) => updateTeacherCriterionComment(idx, e.target.value)}
                                  rows={1}
                                  placeholder="Optional note for this criterion (not shown to the student)."
                                  className="mt-1.5 w-full px-2 py-1 border border-slate-200 rounded text-[12px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#84001B]/30 focus:border-[#84001B]/50 resize-none bg-white"
                                />
                              </div>
                              <label className="inline-flex items-stretch rounded-lg border border-slate-300 bg-white overflow-hidden focus-within:border-[#84001B] focus-within:ring-1 focus-within:ring-[#84001B]/30 self-start">
                                <input
                                  type="number"
                                  min={0}
                                  max={c.max}
                                  step={1}
                                  inputMode="numeric"
                                  value={c.score}
                                  onChange={(e) => updateTeacherCriterionScore(idx, e.target.value)}
                                  aria-label={`Score for ${c.name}, out of ${c.max}`}
                                  className="w-14 px-2 py-1 text-sm font-bold tabular-nums text-[#84001B] bg-white focus:outline-none text-right"
                                />
                                <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 bg-slate-50 border-l border-slate-200 flex items-center">
                                  / {c.max}
                                </span>
                              </label>
                            </div>
                          ))}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-[#84001B]/20 bg-[#ffd21a]/8 px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Rubric total</p>
                            <p className="text-base font-extrabold tabular-nums text-[#84001B]">
                              {rubricSum}<span className="text-slate-400 font-bold"> / {rubricMax}</span>
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setTeacherScoreInput(String(rubricSum));
                              setAppliedTeacherScore(rubricSum);
                              setTeacherGradeNotice({
                                kind: 'ok',
                                text: `Teacher grade ${rubricSum}/${rubricMax} saved from rubric. Publish to make it visible to the student.`,
                              });
                            }}
                            disabled={rubricMax === 0}
                            className="inline-flex items-center gap-2 rounded-xl bg-[#84001B] text-white px-3 py-2 text-xs font-bold shadow-sm hover:bg-[#6b0016] disabled:opacity-60 disabled:cursor-not-allowed"
                            title="Apply the rubric total as the published teacher grade."
                          >
                            <GraduationCap className="w-3.5 h-3.5" aria-hidden />
                            Apply rubric total
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </section>
                )}

                {/* ─── Section 4: Feedback — hidden in AI-only mode ─── */}
                {gradeMode !== 'ai' && (
                <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3 mb-3">
                    <SectionBadge n={gradeMode === 'teacher' ? 3 : 4} Icon={Send} />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-slate-900">Write feedback for the student</h3>
                      <p className="text-[12px] text-slate-500 leading-relaxed">
                        Short note shown alongside the grade. Leave it blank to publish with just the AI report.
                      </p>
                    </div>
                  </div>
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    rows={4}
                    placeholder="e.g. Strong analysis, but tighten the conclusion. Watch tense agreement on page 3."
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B] resize-none bg-white"
                  />
                </section>
                )}
              </div>

              <footer className="shrink-0 border-t border-slate-200 bg-white px-6 py-3 space-y-2.5 rounded-b-2xl">
                {(() => {
                  const aiPct = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : null;
                  const aiReady = aiCriteria.length > 0 && readiness.ready && !isInsufficientSubmissionText(inspectionText);
                  const teacherReady = appliedTeacherScore != null;
                  const canPublish = gradeMode === 'ai' ? aiReady : gradeMode === 'teacher' ? teacherReady : aiReady || teacherReady;
                  const publishSource =
                    gradeMode === 'ai'
                      ? aiPct != null
                        ? 'ai'
                        : null
                      : gradeMode === 'teacher'
                        ? teacherReady
                          ? 'teacher'
                          : null
                        : teacherReady
                          ? 'teacher'
                          : aiPct != null
                            ? 'ai'
                            : null;
                  const publishValue =
                    publishSource === 'teacher' ? appliedTeacherScore : publishSource === 'ai' ? aiPct : null;
                  const pendingTeacherInput =
                    gradeMode !== 'ai' &&
                    appliedTeacherScore == null &&
                    parseTeacherScoreInput(teacherScoreInput) != null;
                  return (
                    <>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                        {gradeMode === 'ai' ? (
                          <>
                            <ReadinessPill ok={!isInsufficientSubmissionText(inspectionText)} label="Text" />
                            <ReadinessPill ok={aiCriteria.length > 0} label="AI grade" />
                          </>
                        ) : gradeMode === 'teacher' ? (
                          <ReadinessPill ok={teacherReady} label="Teacher grade" />
                        ) : (
                          <>
                            <ReadinessPill ok={!isInsufficientSubmissionText(inspectionText)} label="Text" />
                            <ReadinessPill ok={aiCriteria.length > 0} label="AI grade" />
                            <ReadinessPill ok={teacherReady} label="Teacher grade" />
                          </>
                        )}
                        {pendingTeacherInput && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 text-amber-900 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                            title='Press the "Grade as teacher" button to apply the number you typed.'
                          >
                            <Info className="w-3 h-3" aria-hidden />
                            Apply teacher grade
                          </span>
                        )}
                        {publishSource && publishValue != null && (
                          <span
                            className={`inline-flex items-center gap-1 ml-auto rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                              publishSource === 'teacher'
                                ? 'border-[#84001B]/30 bg-[#ffd21a]/15 text-[#5c0014]'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-900'
                            }`}
                            title={
                              publishSource === 'teacher'
                                ? 'Publishes the manual teacher grade.'
                                : 'Publishes the AI rubric score.'
                            }
                          >
                            {publishSource === 'teacher' ? (
                              <GraduationCap className="w-3 h-3" aria-hidden />
                            ) : (
                              <Sparkles className="w-3 h-3" aria-hidden />
                            )}
                            Publish: {publishValue}% ({publishSource === 'teacher' ? 'Teacher' : 'AI'})
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => closeGradingModal()}
                          className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => saveReview('resubmit')}
                          disabled={saving || aiLoading}
                          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-red-200 bg-white text-sm font-semibold text-red-700 hover:bg-red-50 hover:border-red-300 disabled:opacity-60"
                          title="Asks the student to upload a new file. Score is cleared."
                        >
                          <RotateCcw className="w-4 h-4" aria-hidden />
                          Request redo
                        </button>
                        <div className="grow" />
                        <button
                          type="button"
                          onClick={() => saveReview('reviewed')}
                          disabled={saving || aiLoading || !canPublish}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#84001B] text-white text-sm font-bold shadow-md shadow-[#84001B]/20 hover:bg-[#6b0016] disabled:opacity-60 disabled:cursor-not-allowed"
                          title={
                            canPublish
                              ? publishSource === 'teacher'
                                ? `Publishes the teacher grade (${publishValue}%) to the student.`
                                : `Publishes the AI grade (${publishValue}%) to the student.`
                              : gradeMode === 'ai'
                                ? 'Press "Grade with AI" to generate a score before publishing.'
                                : gradeMode === 'teacher'
                                  ? 'Type a teacher grade and press "Grade as teacher" before publishing.'
                                  : 'Run AI in step 2 or enter a teacher grade in step 3 to publish.'
                          }
                        >
                          {saving ? (
                            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                          ) : (
                            <Send className="w-4 h-4" aria-hidden />
                          )}
                          {saving ? 'Publishing…' : 'Publish to student'}
                        </button>
                      </div>
                    </>
                  );
                })()}
              </footer>
            </div>
          </div>,
          document.body
        )}
    </TeacherWorkspaceShell>
  );
}

/** Numbered step badge for the grading modal sections. */
function SectionBadge({
  Icon,
  accent = 'maroon',
}: {
  /** Kept for backwards-compat with existing call sites; no longer displayed. */
  n?: number;
  Icon: LucideIcon;
  accent?: 'maroon' | 'emerald';
}) {
  const tint =
    accent === 'emerald'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
      : 'bg-[#84001B]/8 border-[#84001B]/20 text-[#84001B]';
  return (
    <div className="shrink-0">
      <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${tint}`}>
        <Icon className="w-4 h-4" aria-hidden />
      </div>
    </div>
  );
}

/** Compact ✓/✗ pill used in the modal footer readiness strip. */
function ReadinessPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        ok
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-amber-200 bg-amber-50 text-amber-900'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-amber-500'}`}
        aria-hidden
      />
      {label}
    </span>
  );
}
