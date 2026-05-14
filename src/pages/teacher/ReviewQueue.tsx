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
  ClipboardList,
  Inbox,
  ArrowRight,
  Trash2,
  Trash,
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
import { formatStackedDateTime, rosterStatusChip, studentIdBadge, submissionHasViewableAiScore, submissionHasViewableTeacherScore } from '../../lib/submissionRosterPresentation';
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
import TeacherViewScoreModal from '../../components/teacher/TeacherViewScoreModal';
import AIDocumentEvaluationReport from '../../components/AIDocumentEvaluationReport';
import {
  appendPersistedAiEvalExtras,
  executiveSummaryHasUiTail,
  formatGeminiTeacherNotice,
  runGeminiBackedEvaluation,
  type CorrectHighlight,
  type DiagramEvaluation,
  type LanguageCorrection,
  type PageOverviewScore,
  type PageRewrite,
} from '../../../shared/geminiDocumentEvaluation';
import { resolveGeminiEvalRuntime } from '../../lib/geminiEvalClient';
import { extractTextFromDocxBuffer } from '../../lib/docxText';
import {
  loadSubmissionAttachmentsForGemini,
  summarizeAttachmentsForNotice,
  type GeminiInlineAttachment,
} from '../../../shared/geminiAttachments';

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

/** Session-only: first Run AI Evaluator in Grade AI mode freezes rubric + text for this submission until publish/resubmit. */
const AI_ONLY_EVAL_LOCK_STORAGE_KEY = 'sde_ai_only_eval_lock_v1';

type AiOnlyEvalLockV1 = {
  v: 1;
  criteria: AICriterion[];
  executiveSummary: string;
  languageCorrections: LanguageCorrection[];
  documentQualityNotes: string;
  correctHighlights: CorrectHighlight[];
  /** Per-page Before → After rewrites from the locked AI run (optional for old locks). */
  pageRewrites?: PageRewrite[];
  documentOverviewScores?: PageOverviewScore[];
  diagramEvaluations?: DiagramEvaluation[];
  draftSnapshot: { score: number | null; summary: string };
  inspectionText: string;
  feedbackDraft: string;
};

function readAllAiOnlyEvalLocks(): Record<string, AiOnlyEvalLockV1> {
  if (typeof sessionStorage === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(AI_ONLY_EVAL_LOCK_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, AiOnlyEvalLockV1>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function readAiOnlyEvalLock(submissionId: string): AiOnlyEvalLockV1 | null {
  const row = readAllAiOnlyEvalLocks()[submissionId];
  return row?.v === 1 ? row : null;
}

function writeAiOnlyEvalLock(submissionId: string, lock: Omit<AiOnlyEvalLockV1, 'v'>): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const all = readAllAiOnlyEvalLocks();
    all[submissionId] = { v: 1, ...lock };
    sessionStorage.setItem(AI_ONLY_EVAL_LOCK_STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* quota or private mode */
  }
}

function removeAiOnlyEvalLock(submissionId: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const all = readAllAiOnlyEvalLocks();
    delete all[submissionId];
    sessionStorage.setItem(AI_ONLY_EVAL_LOCK_STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

function maybeFreezeAiOnlyEvalAfterRun(
  gradeMode: 'ai' | 'teacher' | null,
  submissionId: string,
  args: {
    criteria: AICriterion[];
    executiveSummary: string;
    languageCorrections: LanguageCorrection[];
    documentQualityNotes: string;
    correctHighlights: CorrectHighlight[];
    pageRewrites: PageRewrite[];
    documentOverviewScores: PageOverviewScore[];
    diagramEvaluations: DiagramEvaluation[];
    draftSnapshot: { score: number | null; summary: string };
    inspectionText: string;
    feedbackDraft: string;
  }
): void {
  if (gradeMode !== 'ai') return;
  if (readAiOnlyEvalLock(submissionId)) return;
  writeAiOnlyEvalLock(submissionId, {
    criteria: args.criteria.map((c) => ({ ...c })),
    executiveSummary: args.executiveSummary,
    languageCorrections: args.languageCorrections.map((r) => ({ ...r })),
    documentQualityNotes: args.documentQualityNotes,
    correctHighlights: args.correctHighlights.map((h) => ({ ...h })),
    pageRewrites: args.pageRewrites.map((r) => ({ ...r })),
    documentOverviewScores: args.documentOverviewScores.map((r) => ({ ...r })),
    diagramEvaluations: args.diagramEvaluations.map((r) => ({ ...r })),
    draftSnapshot: { ...args.draftSnapshot },
    inspectionText: args.inspectionText,
    feedbackDraft: args.feedbackDraft,
  });
}

/** Update Grade AI session lock (e.g. teacher feedback) without replacing the frozen rubric. */
function patchAiOnlyEvalLock(submissionId: string, patch: Partial<Omit<AiOnlyEvalLockV1, 'v'>>): void {
  const cur = readAiOnlyEvalLock(submissionId);
  if (!cur) return;
  writeAiOnlyEvalLock(submissionId, {
    criteria: patch.criteria?.map((c) => ({ ...c })) ?? cur.criteria.map((c) => ({ ...c })),
    executiveSummary: patch.executiveSummary ?? cur.executiveSummary,
    languageCorrections:
      patch.languageCorrections?.map((r) => ({ ...r })) ?? cur.languageCorrections.map((r) => ({ ...r })),
    documentQualityNotes: patch.documentQualityNotes ?? cur.documentQualityNotes,
    correctHighlights: patch.correctHighlights?.map((h) => ({ ...h })) ?? cur.correctHighlights.map((h) => ({ ...h })),
    pageRewrites:
      patch.pageRewrites?.map((r) => ({ ...r })) ?? (cur.pageRewrites ?? []).map((r) => ({ ...r })),
    documentOverviewScores:
      patch.documentOverviewScores?.map((r) => ({ ...r })) ??
      (cur.documentOverviewScores ?? []).map((r) => ({ ...r })),
    diagramEvaluations:
      patch.diagramEvaluations?.map((r) => ({ ...r })) ?? (cur.diagramEvaluations ?? []).map((r) => ({ ...r })),
    draftSnapshot: patch.draftSnapshot ? { ...patch.draftSnapshot } : { ...cur.draftSnapshot },
    inspectionText: patch.inspectionText ?? cur.inspectionText,
    feedbackDraft: patch.feedbackDraft ?? cur.feedbackDraft,
  });
}

/** Session-only: Grade Teacher in-progress rubric + applied score until publish / redo / clear. */
const TEACHER_ONLY_DRAFT_STORAGE_KEY = 'sde_teacher_only_draft_v1';

type TeacherOnlyDraftV1 = {
  v: 1;
  teacherCriteria: AICriterion[];
  teacherScoreInput: string;
  appliedTeacherScore: number;
  feedback: string;
  inspectionText: string;
};

function readTeacherOnlyDraft(submissionId: string): TeacherOnlyDraftV1 | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(TEACHER_ONLY_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const all = JSON.parse(raw) as Record<string, TeacherOnlyDraftV1>;
    const row = all?.[submissionId];
    return row?.v === 1 ? row : null;
  } catch {
    return null;
  }
}

function writeTeacherOnlyDraft(submissionId: string, draft: Omit<TeacherOnlyDraftV1, 'v'>): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(TEACHER_ONLY_DRAFT_STORAGE_KEY);
    const all = (raw ? JSON.parse(raw) : {}) as Record<string, TeacherOnlyDraftV1>;
    if (typeof all !== 'object' || all === null) return;
    all[submissionId] = { v: 1, ...draft };
    sessionStorage.setItem(TEACHER_ONLY_DRAFT_STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

function removeTeacherOnlyDraft(submissionId: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(TEACHER_ONLY_DRAFT_STORAGE_KEY);
    if (!raw) return;
    const all = JSON.parse(raw) as Record<string, TeacherOnlyDraftV1>;
    if (typeof all !== 'object' || all === null) return;
    delete all[submissionId];
    sessionStorage.setItem(TEACHER_ONLY_DRAFT_STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
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

function insightDepthCriterion(content: string, max: number): AICriterion {
  const keys = [
    'analysis',
    'evaluate',
    'compare',
    'contrast',
    'limitation',
    'recommend',
    'conclusion',
    'insight',
    'discussion',
    'improvement',
    'future',
    'risk',
    'benefit',
    'critique',
  ];
  const score = scoreByKeywords(content, keys, max);
  const ratio = max > 0 ? score / max : 0;
  const comment =
    ratio >= 0.82
      ? 'Strong evaluative depth: tradeoffs, recommendations, or synthesis read clearly in the draft.'
      : ratio >= 0.55
        ? 'Some analytical language; strengthen conclusions, risks, and concrete recommendations.'
        : 'Limited critical analysis — expand interpretation, evaluation, and actionable takeaways.';
  return { name: 'Critical analysis & insight', score, max, comment };
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
    insightDepthCriterion(content, 20),
    grammarMechanicsCriterion(content, 24),
    lengthCompletenessCriterion(content, docType, 24),
  ];
}

function buildAIFeedback(criteria: AICriterion[]): string {
  if (criteria.length === 0) return '';
  const ratio = (c: AICriterion) => (c.max > 0 ? c.score / c.max : 0);
  const strengths = criteria.filter((c) => c.max > 0 && ratio(c) >= 0.85).map((c) => c.name);
  const improvements = criteria.filter((c) => c.max > 0 && ratio(c) < 0.75).map((c) => c.name);

  const intro =
    'This extended automated summary is generated from the rubric-aligned draft scores on this screen. It is used when the live Gemini model is unavailable or did not return usable structured JSON — treat every claim as provisional until you have reviewed the actual submission file.';

  const mid = criteria
    .map((c) => {
      const r = ratio(c);
      const band =
        r >= 0.85 ? 'This criterion is scoring in a strong band.' : r >= 0.65 ? 'This criterion is mixed — room to tighten.' : 'This criterion is weak relative to its weight — expect gaps.';
      return `${c.name} (${c.score}/${c.max}): ${band} ${c.comment}`;
    })
    .join('\n\n');

  const tail = [
    strengths.length ? `Strengths: ${strengths.join(', ')}.` : '',
    improvements.length ? `Needs improvement: ${improvements.join(', ')}.` : '',
    'Please read each rubric cell in the modal, adjust scores or comments as needed, then publish when the evaluation matches your professional judgment.',
  ].filter(Boolean);

  return [intro, mid, ...tail].join('\n\n');
}

/** Snapshot persisted for students as “AI preliminary” versus teacher-adjusted `score` / `feedback`. */
function criteriaToDraftSnapshot(
  criteria: AICriterion[],
  executiveSummary?: string | null,
  extras?: {
    languageCorrections?: LanguageCorrection[];
    documentQualityNotes?: string | null;
    correctHighlights?: CorrectHighlight[];
    pageRewrites?: PageRewrite[];
    documentOverviewScores?: PageOverviewScore[];
    diagramEvaluations?: DiagramEvaluation[];
  } | null
): { score: number | null; summary: string } {
  const total = criteria.reduce((s, c) => s + c.score, 0);
  const maxTotal = criteria.reduce((s, c) => s + c.max, 0);
  const scorePct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : null;
  const exec = executiveSummary?.trim() ?? '';
  const rubricLine = buildAIFeedback(criteria);
  let summary = exec
    ? executiveSummaryHasUiTail(exec)
      ? exec
      : rubricLine
        ? `${exec}\n\n${rubricLine}`
        : exec
    : rubricLine;
  const cor = extras?.languageCorrections ?? [];
  const qn = extras?.documentQualityNotes?.trim() ?? '';
  const ch = extras?.correctHighlights ?? [];
  const pr = extras?.pageRewrites ?? [];
  const ov = extras?.documentOverviewScores ?? [];
  const dg = extras?.diagramEvaluations ?? [];
  if (cor.length > 0 || qn || ch.length > 0 || pr.length > 0 || ov.length > 0 || dg.length > 0) {
    summary = appendPersistedAiEvalExtras(summary, {
      languageCorrections: cor,
      documentQualityNotes: qn,
      correctHighlights: ch,
      pageRewrites: pr,
      documentOverviewScores: ov,
      diagramEvaluations: dg,
    });
  }
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
        'Cannot accept an empty or nearly empty submission for the AI evaluator. Add submission text (from the file or storage) in the evaluator panel, or choose Needs resubmission.',
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

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const clean = b64.replace(/\s/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function submissionLooksLikeDocx(sub: Submission, httpUrl: string): boolean {
  const fn = (sub.file_name || '').toLowerCase();
  if (fn.endsWith('.docx')) return true;
  const path = httpUrl.split(/[?#]/)[0].toLowerCase();
  if (path.endsWith('.docx')) return true;
  if (/[?&](?:file)?name=[^&]*\.docx\b/i.test(httpUrl)) return true;
  return false;
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
    if (lower.includes('wordprocessingml.document') || lower.includes('officedocument.wordprocessingml.document')) {
      if (!isBase64) {
        return {
          text: '',
          hint: 'This Word data URL is not base64-encoded; cannot extract text for the AI.',
          openHref: href,
        };
      }
      try {
        const buf = base64ToArrayBuffer(data);
        const extracted = (await extractTextFromDocxBuffer(buf)).trim();
        if (extracted.length === 0) {
          return {
            text: '',
            hint: 'This .docx has no extractable text (e.g. images only). Open the file or paste the body.',
            openHref: href,
          };
        }
        const capped =
          extracted.length > 500_000 ? `${extracted.slice(0, 500_000)}\n\n…(truncated)` : extracted;
        return { text: capped, hint: null, openHref: href };
      } catch {
        return {
          text: '',
          hint: 'Could not read this Word document from the data URL.',
          openHref: href,
        };
      }
    }
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

    if (submissionLooksLikeDocx(sub, fetchHref)) {
      try {
        const res = await fetch(fetchHref);
        if (!res.ok) {
          return {
            text: '',
            hint: `Could not download the Word file (${res.status}). Use Open file or paste text.`,
            openHref: href,
          };
        }
        const buf = await res.arrayBuffer();
        if (buf.byteLength < 64) {
          return {
            text: '',
            hint: 'Downloaded file is too small to be a valid .docx.',
            openHref: href,
          };
        }
        const extracted = (await extractTextFromDocxBuffer(buf)).trim();
        if (extracted.length > 0) {
          const capped =
            extracted.length > 500_000 ? `${extracted.slice(0, 500_000)}\n\n…(truncated)` : extracted;
          return { text: capped, hint: null, openHref: href };
        }
        return {
          text: '',
          hint: 'This .docx has no readable body text (e.g. scanned pages as images). Open the file or paste text.',
          openHref: href,
        };
      } catch (e) {
        console.warn('[grading] .docx text extract failed:', e);
        return {
          text: '',
          hint: 'Could not read text from this .docx (network, CORS, or corrupt file). Open in Word and paste here, or export as PDF.',
          openHref: href,
        };
      }
    }

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
        if (ct.includes('wordprocessingml.document')) {
          const buf = await res.arrayBuffer();
          if (buf.byteLength >= 64) {
            try {
              const extracted = (await extractTextFromDocxBuffer(buf)).trim();
              if (extracted.length > 0) {
                const capped =
                  extracted.length > 500_000 ? `${extracted.slice(0, 500_000)}\n\n…(truncated)` : extracted;
                return { text: capped, hint: null, openHref: href };
              }
            } catch (e) {
              console.warn('[grading] Content-Type docx extract failed:', e);
            }
          }
        } else {
          const t = await res.text();
          const sample = t.slice(0, 4000);
          if (t.length < 2_000_000 && !sampleHasSuspiciousBinaryControls(sample)) {
            const capped = t.length > 500_000 ? `${t.slice(0, 500_000)}\n\n…(truncated)` : t;
            return { text: capped, hint: null, openHref: href };
          }
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
  /** Structured language fixes from the last Gemini run (also embedded in `ai_draft_summary` on publish). */
  const [aiLanguageCorrections, setAiLanguageCorrections] = useState<LanguageCorrection[]>([]);
  const [aiDocumentQualityNotes, setAiDocumentQualityNotes] = useState('');
  /** Passages the model verified as correct in the submission (persisted in `ai_draft_summary`). */
  const [aiCorrectHighlights, setAiCorrectHighlights] = useState<CorrectHighlight[]>([]);
  /** Per-page Before → After rewrites Gemini produced for this submission. */
  const [aiPageRewrites, setAiPageRewrites] = useState<PageRewrite[]>([]);
  const [aiDocumentOverviewScores, setAiDocumentOverviewScores] = useState<PageOverviewScore[]>([]);
  const [aiDiagramEvaluations, setAiDiagramEvaluations] = useState<DiagramEvaluation[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  /** Grade AI: first successful Run AI Evaluator freezes rubric + text (session lock); no re-run. */
  const [aiOnlyEvalLocked, setAiOnlyEvalLocked] = useState(false);
  const [inspectionNotice, setInspectionNotice] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const [inspectionText, setInspectionText] = useState('');
  /**
   * Binary parts (PDF pages, images, audio, video, images extracted from a
   * .docx) shipped to Gemini as `inlineData` so it can actually read visual,
   * auditory, and rich-format content — not just the text we already
   * scrape into `inspectionText`.
   */
  const [inspectionAttachments, setInspectionAttachments] = useState<GeminiInlineAttachment[]>([]);
  /**
   * Production `/api/gemini-evaluate`: result of GET probe for `GEMINI_API_KEY`.
   * `null` = not checked yet; `true` = server can call Gemini; `false` = missing key on Vercel.
   */
  const [geminiServerKeyOk, setGeminiServerKeyOk] = useState<boolean | null>(() => {
    if ((import.meta.env.VITE_GEMINI_EVAL_URL || '').trim() || (import.meta.env.VITE_GEMINI_API_KEY || '').trim()) {
      return true;
    }
    return null;
  });
  /** Immutable snapshot when the grading modal loads (student text before teacher edits). */
  const [feedback, setFeedback] = useState('');
  /** Working value in the teacher-grade input (string while editing). */
  const [teacherScoreInput, setTeacherScoreInput] = useState('');
  /** Confirmed teacher grade applied via the "Grade as teacher" button. Null = no manual grade. */
  const [appliedTeacherScore, setAppliedTeacherScore] = useState<number | null>(null);
  /** Inline message under the teacher-grade button (validation / confirmation). */
  const [teacherGradeNotice, setTeacherGradeNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  /** Row-selection set for the bulk "Delete selected" toolbar above the queue. */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [resubmitSavingId, setResubmitSavingId] = useState<string | null>(null);
  const [viewScoreOpen, setViewScoreOpen] = useState<{ row: Submission; focus: 'ai' | 'teacher' } | null>(null);
  const [fileOpenHref, setFileOpenHref] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const submissionDeepLinkConsumed = useRef<string | null>(null);
  /** Latest automated AI run (“before” teacher tweaks criterion sliders). Persisted as `ai_draft_*` when saving. */
  const aiDraftSnapshotRef = useRef<{ score: number | null; summary: string } | null>(null);
  /** Which grade flow the teacher wanted when opening the modal ('ai' | 'teacher'). Drives auto-scroll to the right section. */
  const pendingGradeIntentRef = useRef<'ai' | 'teacher' | null>(null);
  /** Focus target for the teacher-grade input when the "Grade (Teacher)" row button is pressed. */
  const teacherScoreInputRef = useRef<HTMLInputElement>(null);

  function closeGradingModal() {
    setSelected(null);
    setGradeMode(null);
    setAiOnlyEvalLocked(false);
    setFileOpenHref(null);
    setAiExecutiveSummary('');
    setAiLanguageCorrections([]);
    setAiDocumentQualityNotes('');
    setAiCorrectHighlights([]);
    setAiPageRewrites([]);
    setAiDocumentOverviewScores([]);
    setAiDiagramEvaluations([]);
    setInspectionText('');
    setInspectionAttachments([]);
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
      if (gradeMode === 'teacher') {
        setAppliedTeacherScore((prev) => {
          if (prev != null) {
            window.queueMicrotask(() =>
              setTeacherGradeNotice({
                kind: 'ok',
                text: `Rubric updated to ${rubricTotal}%. Press Publish to send this version to the student.`,
              })
            );
          }
          return prev != null ? rubricTotal : prev;
        });
      } else {
        setAppliedTeacherScore((prev) => (prev != null && prev !== rubricTotal ? null : prev));
      }
      return next;
    });
  }

  function updateTeacherCriterionComment(idx: number, comment: string) {
    setTeacherCriteria((rows) => rows.map((c, i) => (i === idx ? { ...c, comment } : c)));
  }

  function resetTeacherRubric() {
    if (selected) removeTeacherOnlyDraft(selected.id);
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
      text: `Teacher grade ${parsed}% saved. Adjust the rubric or feedback anytime, then Publish (or publish again) to update what the student sees.`,
    });
  }

  function clearTeacherGrade() {
    if (selected) removeTeacherOnlyDraft(selected.id);
    setTeacherScoreInput('');
    setAppliedTeacherScore(null);
    setTeacherGradeNotice(null);
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(scope: Submission[], selectAll: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selectAll) for (const s of scope) next.add(s.id);
      else for (const s of scope) next.delete(s.id);
      return next;
    });
  }

  async function deleteSelected(scope: Submission[]) {
    const ids = scope.filter((s) => selectedIds.has(s.id)).map((s) => s.id);
    if (ids.length === 0) return;
    /** Drop the local selection now so the toolbar reflects the action immediately. */
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
    await deleteByIds(ids);
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
      for (const id of ids) {
        removeAiOnlyEvalLock(id);
        removeTeacherOnlyDraft(id);
      }
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

  const geminiEvalReady = useMemo(() => {
    if ((import.meta.env.VITE_GEMINI_EVAL_URL || '').trim() || (import.meta.env.VITE_GEMINI_API_KEY || '').trim()) {
      return true;
    }
    if (!import.meta.env.PROD) return false;
    return geminiServerKeyOk === true;
  }, [geminiServerKeyOk]);

  useEffect(() => {
    if ((import.meta.env.VITE_GEMINI_EVAL_URL || '').trim() || (import.meta.env.VITE_GEMINI_API_KEY || '').trim()) {
      return;
    }
    if (!import.meta.env.PROD) {
      setGeminiServerKeyOk(false);
      return;
    }
    let cancelled = false;
    void fetch('/api/gemini-evaluate', { method: 'GET', credentials: 'same-origin' })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { serverKeyConfigured?: boolean };
        if (!cancelled) setGeminiServerKeyOk(Boolean(j.serverKeyConfigured));
      })
      .catch(() => {
        if (!cancelled) setGeminiServerKeyOk(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void load();
  }, []);

  /** Grade Teacher: keep rubric + applied score + feedback steady in this browser until publish, redo, or clear. */
  useEffect(() => {
    if (!selected || gradeMode !== 'teacher' || appliedTeacherScore == null) return;
    writeTeacherOnlyDraft(selected.id, {
      teacherCriteria: teacherCriteria.map((c) => ({ ...c })),
      teacherScoreInput,
      appliedTeacherScore,
      feedback,
      inspectionText,
    });
  }, [
    selected?.id,
    gradeMode,
    appliedTeacherScore,
    teacherCriteria,
    teacherScoreInput,
    feedback,
    inspectionText,
  ]);

  /** Grade AI: keep teacher feedback in the session lock in sync before publish. */
  useEffect(() => {
    if (!selected || gradeMode !== 'ai' || !aiOnlyEvalLocked) return;
    if (!readAiOnlyEvalLock(selected.id)) return;
    patchAiOnlyEvalLock(selected.id, { feedbackDraft: feedback });
  }, [feedback, selected?.id, gradeMode, aiOnlyEvalLocked]);

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
    const teacherDraftEarly = intent === 'teacher' ? readTeacherOnlyDraft(sub.id) : null;
    setFeedback(
      teacherDraftEarly ? (sub.feedback?.trim() ? sub.feedback : teacherDraftEarly.feedback) : sub.feedback || ''
    );
    setAiCriteria([]);
    setAiExecutiveSummary('');
    setAiLanguageCorrections([]);
    setAiDocumentQualityNotes('');
    setAiCorrectHighlights([]);
    setAiPageRewrites([]);
    setAiDocumentOverviewScores([]);
    setAiDiagramEvaluations([]);
    setInspectionNotice(null);
    setInspectionText('');
    setInspectionAttachments([]);
    setFileOpenHref(null);

    if (teacherDraftEarly) {
      setTeacherScoreInput(teacherDraftEarly.teacherScoreInput);
      setAppliedTeacherScore(teacherDraftEarly.appliedTeacherScore);
      setTeacherCriteria(teacherDraftEarly.teacherCriteria.map((c) => ({ ...c })));
      setTeacherGradeNotice({
        kind: 'ok',
        text: 'Restored your teacher grade draft from this browser session. Adjust the rubric or feedback, then Publish again when ready.',
      });
    } else {
      /** Restore the teacher's previously-published manual grade so a re-grade starts where they left off. */
      const priorScore = sub.status === 'reviewed' && sub.score != null ? sub.score : null;
      setTeacherScoreInput(priorScore != null ? String(priorScore) : '');
      setAppliedTeacherScore(priorScore);
      setTeacherGradeNotice(null);
      if (intent === 'teacher') {
        setTeacherCriteria([]);
      }
    }

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
    const [payload, attachments] = await Promise.all([
      loadSubmissionInspectionPayload(sub),
      loadSubmissionAttachmentsForGemini(sub),
    ]);
    setFileOpenHref(payload.openHref);
    setInspectionAttachments(attachments);
    if (attachments.length > 0) {
      const summary = summarizeAttachmentsForNotice(attachments);
      setInspectionNotice({
        kind: 'ok',
        text: `Loaded ${summary} for Gemini to inspect directly — diagrams, images, scanned pages, audio and video will be graded alongside any extracted text. Press Run AI Evaluator to score everything.`,
      });
    }
    setAiOnlyEvalLocked(false);
    /** Grade AI: no heuristic rubric until Run AI Evaluator; session lock restores the first-run score if present. */
    if (intent === 'ai') {
      const lock = readAiOnlyEvalLock(sub.id);
      if (lock) {
        setInspectionText(lock.inspectionText);
        aiDraftSnapshotRef.current = lock.draftSnapshot;
        setAiCriteria(lock.criteria);
        setAiExecutiveSummary(lock.executiveSummary);
        setAiLanguageCorrections(lock.languageCorrections);
        setAiDocumentQualityNotes(lock.documentQualityNotes);
        setAiCorrectHighlights(lock.correctHighlights);
        setAiPageRewrites(lock.pageRewrites ?? []);
        setAiDocumentOverviewScores(lock.documentOverviewScores ?? []);
        setAiDiagramEvaluations(lock.diagramEvaluations ?? []);
        setFeedback(sub.feedback?.trim() ? sub.feedback : lock.feedbackDraft);
        setTeacherCriteria([]);
        setAiOnlyEvalLocked(true);
      } else {
        setInspectionText(payload.text);
        aiDraftSnapshotRef.current = null;
        setTeacherCriteria([]);
      }
    } else if (intent === 'teacher') {
      if (teacherDraftEarly) {
        setInspectionText(teacherDraftEarly.inspectionText);
        const criteria = runFullAIDraft(gradingDocTypeForAI(sub), teacherDraftEarly.inspectionText);
        aiDraftSnapshotRef.current = criteriaToDraftSnapshot(criteria, null);
        setAiCriteria(criteria);
      } else {
        setInspectionText(payload.text);
        const criteria = runFullAIDraft(gradingDocTypeForAI(sub), payload.text);
        aiDraftSnapshotRef.current = criteriaToDraftSnapshot(criteria, null);
        setAiCriteria(criteria);
        if (!sub.feedback) setFeedback(buildAIFeedback(criteria));
        setTeacherCriteria(buildTeacherRubricOutOfHundred(criteria));
      }
    } else {
      setInspectionText(payload.text);
      const criteria = runFullAIDraft(gradingDocTypeForAI(sub), payload.text);
      aiDraftSnapshotRef.current = criteriaToDraftSnapshot(criteria, null);
      setAiCriteria(criteria);
      if (!sub.feedback) setFeedback(buildAIFeedback(criteria));
      setTeacherCriteria(buildTeacherRubricOutOfHundred(criteria));
    }
    setAiLoading(false);
  }

  /**
   * After the modal opens and payload load finishes, jump the teacher to the section that matches
   * the row button: AI section for "Grade AI" (no scores until Run AI Evaluator), Teacher section
   * (and focus the score input) for "Grade Teacher".
   */
  useEffect(() => {
    if (!selected || aiLoading) return;
    const intent = pendingGradeIntentRef.current;
    if (!intent) return;
    pendingGradeIntentRef.current = null;
    if (intent === 'ai') {
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
    if (gradeMode === 'ai' && readAiOnlyEvalLock(selected.id)) return;

    if (!geminiEvalReady) {
      if (import.meta.env.PROD && geminiServerKeyOk === null) {
        setInspectionNotice({
          kind: 'warn',
          text: 'Checking whether GEMINI_API_KEY is set on Vercel — wait a moment and press Run again.',
        });
        return;
      }
      if (import.meta.env.PROD && geminiServerKeyOk === false) {
        setInspectionNotice({
          kind: 'err',
          text: `This URL (${typeof window !== 'undefined' ? window.location.host : 'production'}) needs a Gemini key on its Vercel project: Settings → Environment Variables → add GEMINI_API_KEY (best) or VITE_GEMINI_API_KEY for Production → Redeploy. A key on a different Vercel project will not work.`,
        });
        return;
      }
    }

    const docType = gradingDocTypeForAI(selected);
    const template = runFullAIDraft(docType, inspectionText);
    const { evalUrl, apiKey, model } = resolveGeminiEvalRuntime();

    if (!evalUrl && !apiKey) {
      const snap = criteriaToDraftSnapshot(template, null);
      aiDraftSnapshotRef.current = snap;
      setAiCriteria(template);
      setAiExecutiveSummary('');
      setAiLanguageCorrections([]);
      setAiDocumentQualityNotes('');
      setAiCorrectHighlights([]);
      setAiPageRewrites([]);
      setAiDocumentOverviewScores([]);
      setAiDiagramEvaluations([]);
      const autoFb = buildAIFeedback(template);
      if (!feedback.trim()) setFeedback(autoFb);
      maybeFreezeAiOnlyEvalAfterRun(gradeMode, selected.id, {
        criteria: template,
        executiveSummary: '',
        languageCorrections: [],
        documentQualityNotes: '',
        correctHighlights: [],
        pageRewrites: [],
        documentOverviewScores: [],
        diagramEvaluations: [],
        draftSnapshot: snap,
        inspectionText,
        feedbackDraft: autoFb,
      });
      if (gradeMode === 'ai') setAiOnlyEvalLocked(true);
      return;
    }

    setInspectionNotice(null);
    setAiLoading(true);
    try {
      const result = await runGeminiBackedEvaluation({
        docType,
        content: inspectionText,
        template,
        attachments: inspectionAttachments,
        evalUrl: evalUrl || null,
        apiKey: apiKey || null,
        model: model?.trim() || null,
      });
      if (result) {
        const snap = criteriaToDraftSnapshot(result.criteria, result.executiveSummary, {
          languageCorrections: result.languageCorrections,
          documentQualityNotes: result.documentQualityNotes,
          correctHighlights: result.correctHighlights,
          pageRewrites: result.pageRewrites,
          documentOverviewScores: result.documentOverviewScores,
          diagramEvaluations: result.diagramEvaluations,
        });
        aiDraftSnapshotRef.current = snap;
        setAiCriteria(result.criteria);
        setAiExecutiveSummary(result.executiveSummary);
        setAiLanguageCorrections(result.languageCorrections);
        setAiDocumentQualityNotes(result.documentQualityNotes);
        setAiCorrectHighlights(result.correctHighlights);
        setAiPageRewrites(result.pageRewrites);
        setAiDocumentOverviewScores(result.documentOverviewScores);
        setAiDiagramEvaluations(result.diagramEvaluations);
        const autoFb = buildAIFeedback(result.criteria);
        if (!feedback.trim()) setFeedback(autoFb);
        maybeFreezeAiOnlyEvalAfterRun(gradeMode, selected.id, {
          criteria: result.criteria,
          executiveSummary: result.executiveSummary,
          languageCorrections: result.languageCorrections,
          documentQualityNotes: result.documentQualityNotes,
          correctHighlights: result.correctHighlights,
          pageRewrites: result.pageRewrites,
          documentOverviewScores: result.documentOverviewScores,
          diagramEvaluations: result.diagramEvaluations,
          draftSnapshot: snap,
          inspectionText,
          feedbackDraft: autoFb,
        });
        if (gradeMode === 'ai') setAiOnlyEvalLocked(true);
        const mediaSummary = summarizeAttachmentsForNotice(inspectionAttachments);
        const mediaSuffix = mediaSummary
          ? ` Gemini also evaluated ${mediaSummary} sent as inline media.`
          : '';
        const pageSuffix = result.pageRewrites.length > 0
          ? ` Per-page Before → After is ready for ${result.pageRewrites.length} page${result.pageRewrites.length === 1 ? '' : 's'} — scroll the AI evaluator to review.`
          : '';
        const overviewSuffix =
          result.documentOverviewScores.length > 0
            ? ` Document overview spans ${result.documentOverviewScores.length} section${result.documentOverviewScores.length === 1 ? '' : 's'}.`
            : '';
        const diagramSuffix =
          result.diagramEvaluations.length > 0
            ? ` Visual & diagram evaluation covers ${result.diagramEvaluations.length} figure${result.diagramEvaluations.length === 1 ? '' : 's'}.`
            : '';
        setInspectionNotice({
          kind: 'ok',
          text:
            gradeMode === 'ai'
              ? `AI score is set from this run and cannot be changed — publish when ready.${mediaSuffix}${pageSuffix}${overviewSuffix}${diagramSuffix}`
              : `AI evaluator refreshed scores, verified-correct excerpts, issues, before/after fixes, and the executive summary. Adjust rubric cells if needed, then save or publish.${mediaSuffix}${pageSuffix}${overviewSuffix}${diagramSuffix}`,
        });
      } else {
        const snap = criteriaToDraftSnapshot(template, null);
        aiDraftSnapshotRef.current = snap;
        setAiCriteria(template);
        setAiExecutiveSummary('');
        setAiLanguageCorrections([]);
        setAiDocumentQualityNotes('');
        setAiCorrectHighlights([]);
        setAiPageRewrites([]);
        setAiDocumentOverviewScores([]);
        setAiDiagramEvaluations([]);
        const autoFb = buildAIFeedback(template);
        if (!feedback.trim()) setFeedback(autoFb);
        maybeFreezeAiOnlyEvalAfterRun(gradeMode, selected.id, {
          criteria: template,
          executiveSummary: '',
          languageCorrections: [],
          documentQualityNotes: '',
          correctHighlights: [],
          pageRewrites: [],
          documentOverviewScores: [],
          diagramEvaluations: [],
          draftSnapshot: snap,
          inspectionText,
          feedbackDraft: autoFb,
        });
        if (gradeMode === 'ai') setAiOnlyEvalLocked(true);
        setInspectionNotice({
          kind: 'warn',
          text:
            gradeMode === 'ai'
              ? 'Using the built-in draft for this run — this score is now fixed for publish. Open DevTools → Console if you expected Gemini JSON.'
              : 'Gemini did not return usable JSON. Using the built-in draft. Open DevTools → Console for details.',
        });
      }
    } catch (e) {
      console.error('[grading] Gemini / eval URL failed:', e);
      const snap = criteriaToDraftSnapshot(template, null);
      aiDraftSnapshotRef.current = snap;
      setAiCriteria(template);
      setAiExecutiveSummary('');
      setAiLanguageCorrections([]);
      setAiDocumentQualityNotes('');
      setAiCorrectHighlights([]);
      setAiPageRewrites([]);
      setAiDocumentOverviewScores([]);
      setAiDiagramEvaluations([]);
      const autoFb = buildAIFeedback(template);
      if (!feedback.trim()) setFeedback(autoFb);
      maybeFreezeAiOnlyEvalAfterRun(gradeMode, selected.id, {
        criteria: template,
        executiveSummary: '',
        languageCorrections: [],
        documentQualityNotes: '',
        correctHighlights: [],
        pageRewrites: [],
        documentOverviewScores: [],
        diagramEvaluations: [],
        draftSnapshot: snap,
        inspectionText,
        feedbackDraft: autoFb,
      });
      if (gradeMode === 'ai') setAiOnlyEvalLocked(true);
      const notice = formatGeminiTeacherNotice(e);
      setInspectionNotice({
        kind: notice.kind,
        text:
          gradeMode === 'ai'
            ? `${notice.text} This built-in draft score is now fixed for publish.`
            : notice.text,
      });
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
      } else if (gradeMode === 'ai') {
        /** AI-only: teacher accepts the last run’s rubric total; no per-row readiness floor. */
        if (isInsufficientSubmissionText(inspectionText) && inspectionAttachments.length === 0) {
          alert(getReadiness(aiCriteria, inspectionText).message);
          return;
        }
        if (aiCriteria.length === 0) {
          alert('Run AI Evaluator first so there is a rubric score to publish.');
          return;
        }
      } else {
        /** Combined / legacy modal: keep per-criterion readiness for AI-based publish. */
        const gate = getReadiness(aiCriteria, inspectionText);
        if (!gate.ready) {
          alert(gate.message);
          return;
        }
      }
    }
    setSaving(true);
    const nextStatus = status === 'reviewed' ? 'reviewed' : status === 'resubmit' ? 'resubmit' : 'under_review';
    const draft = aiDraftSnapshotRef.current;
    const ai_draft_score = draft?.score ?? null;
    const ai_draft_summary = draft?.summary ?? null;
    const feedbackOut =
      nextStatus === 'resubmit' && !feedback.trim()
        ? DEFAULT_TEACHER_RESUBMIT_FEEDBACK
        : feedback;

    const total = aiCriteria.reduce((s, c) => s + c.score, 0);
    const maxTotal = aiCriteria.reduce((s, c) => s + c.max, 0);
    const aiAggregateScore = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : null;
    /** Deep-link / legacy modal: teacher override wins when applied, else AI aggregate. */
    const legacyCombinedScore =
      gradeMode == null
        ? appliedTeacherScore != null
          ? appliedTeacherScore
          : aiAggregateScore
        : null;

    /** AI-only: update AI snapshot + feedback only — never overwrites `score`. */
    /** Teacher-only: update official score + feedback only — never overwrites AI draft columns. */
    const fullPayload: Record<string, unknown> =
      nextStatus === 'resubmit'
        ? {
            status: nextStatus,
            feedback: feedbackOut,
            score: null,
            ai_draft_score: null,
            ai_draft_summary: null,
          }
        : nextStatus === 'reviewed' && gradeMode === 'ai'
          ? {
              status: nextStatus,
              feedback: feedbackOut,
              ai_draft_score,
              ai_draft_summary,
            }
          : nextStatus === 'reviewed' && gradeMode === 'teacher'
            ? {
                status: nextStatus,
                feedback: feedbackOut,
                score: appliedTeacherScore,
              }
            : nextStatus === 'reviewed' && gradeMode == null
              ? {
                  status: nextStatus,
                  feedback: feedbackOut,
                  score: legacyCombinedScore,
                  ai_draft_score,
                  ai_draft_summary,
                }
              : {
                  status: nextStatus,
                  feedback: feedbackOut,
                };

    const basePayload: Record<string, unknown> =
      nextStatus === 'resubmit'
        ? {
            status: nextStatus,
            feedback: feedbackOut,
            score: null,
            ai_draft_score: null,
            ai_draft_summary: null,
          }
        : {
            status: nextStatus,
            feedback: feedbackOut,
            ...(Object.prototype.hasOwnProperty.call(fullPayload, 'score') ? { score: fullPayload.score } : {}),
          };

    const table = await resolveSubmissionTableName();
    if (table) {
      const { error } = await supabase.from(table).update(fullPayload as never).eq('id', selected.id);
      const missingAiCols =
        error?.message &&
        /ai_draft|could not find|column|PGRST204|schema cache/i.test(error.message);
      if (error && missingAiCols) {
        if (gradeMode === 'ai') {
          alert(
            'This project’s submissions table is missing AI draft columns (ai_draft_score / ai_draft_summary). Add them with the Supabase SQL in docs, then publish again.'
          );
          setSaving(false);
          return;
        }
        const { error: e2 } = await supabase.from(table).update(basePayload as never).eq('id', selected.id);
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
        return {
          ...row,
          status: nextStatus as SubStatus,
          feedback: feedbackOut,
          ...(Object.prototype.hasOwnProperty.call(fullPayload, 'score')
            ? { score: fullPayload.score as number | null }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(fullPayload, 'ai_draft_score')
            ? { ai_draft_score: fullPayload.ai_draft_score as number | null }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(fullPayload, 'ai_draft_summary')
            ? { ai_draft_summary: fullPayload.ai_draft_summary as string | null }
            : {}),
        };
      });
      localStorage.setItem(TEACHER_LOCAL_SUBMISSION_KEY, JSON.stringify(updated));
    }
    setSaving(false);
    removeAiOnlyEvalLock(selected.id);
    removeTeacherOnlyDraft(selected.id);
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
      removeAiOnlyEvalLock(sub.id);
      removeTeacherOnlyDraft(sub.id);
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
  /**
   * Treat the submission as gradeable when EITHER the extracted text is
   * substantive OR Gemini has multimodal attachments to read directly
   * (PDF pages, images, audio, video, docx-embedded images). Otherwise the
   * AI Evaluator and Publish actions are gated as before.
   */
  const submissionIsGradeable =
    !isInsufficientSubmissionText(inspectionText) || inspectionAttachments.length > 0;

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
            <span className="font-semibold text-emerald-800">Grade AI</span> opens the AI step (press Run when ready),{' '}
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
        <p className="text-[11px] text-slate-500 mb-3">
          Use <span className="font-semibold text-slate-700">Grade AI</span>,{' '}
          <span className="font-semibold text-slate-700">Grade Teacher</span>, <span className="font-semibold text-slate-700">Redo</span>, or{' '}
          <span className="font-semibold text-slate-700">Delete</span> on each row — same actions as{' '}
          <Link to="/class-list" className="font-semibold text-[#84001B] hover:underline">
            Class list
          </Link>{' '}
          and Submission roster.
        </p>
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
              Maroon header matches Class list. Scroll sideways on narrow screens if columns are clipped.
            </TeacherAmberCue>
            <div className="flex flex-wrap items-center justify-end gap-2 px-3 py-2 border-b border-slate-200/90 bg-slate-50/95">
              <label className="inline-flex items-center gap-2 text-[11px] font-medium text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  aria-label={
                    filtered.length > 0 && filtered.every((s) => selectedIds.has(s.id))
                      ? 'Deselect all submissions in this view'
                      : 'Select all submissions in this view'
                  }
                  checked={filtered.length > 0 && filtered.every((s) => selectedIds.has(s.id))}
                  ref={(el) => {
                    if (!el) return;
                    const sel = filtered.reduce((acc, s) => (selectedIds.has(s.id) ? acc + 1 : acc), 0);
                    el.indeterminate = sel > 0 && sel < filtered.length;
                  }}
                  onChange={(e) => toggleSelectAll(filtered, e.target.checked)}
                  className="h-3.5 w-3.5 accent-[#84001B] cursor-pointer"
                />
                Select all in view
              </label>
              {(() => {
                const sel = filtered.reduce((acc, s) => (selectedIds.has(s.id) ? acc + 1 : acc), 0);
                return (
                  <button
                    type="button"
                    disabled={sel === 0 || deleting}
                    onClick={() => void deleteSelected(filtered)}
                    className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-[10px] font-semibold text-red-700 shadow-sm hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title={
                      sel === 0
                        ? 'Tick rows below (or use Select all) to enable bulk delete'
                        : `Delete the ${sel} selected submission${sel === 1 ? '' : 's'}`
                    }
                  >
                    <Trash className="w-3 h-3 shrink-0" aria-hidden />
                    Delete selected{sel > 0 ? ` (${sel})` : ''}
                  </button>
                );
              })()}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px] text-sm border-collapse">
                <thead>
                  <tr className={teacherMaroonTheadClasses}>
                    <th className="px-3 py-3 text-left min-w-[96px] text-white">Title</th>
                    <th className="px-3 py-3 text-left min-w-[140px] text-white">File name</th>
                    <th className="px-3 py-3 text-left min-w-[120px] text-white">Student ID</th>
                    <th className="px-3 py-3 text-left min-w-[140px] text-white">Student name</th>
                    <th className="px-3 py-3 text-left min-w-[112px] text-white">Date submitted</th>
                    <th className="px-3 py-3 text-left min-w-[100px] text-white">Status</th>
                    <th className="px-3 py-3 text-right min-w-[320px] text-white">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((s) => {
                    const subDm = formatStackedDateTime(s.submitted_at);
                    const roster = rosterStatusChip(s);
                    return (
                      <tr key={s.id} className="hover:bg-gray-50/80 transition-colors">
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
                          <span
                            className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-semibold ${roster.className}`}
                          >
                            {roster.showCheck ? <CheckCircle className="w-3.5 h-3.5 shrink-0" aria-hidden /> : null}
                            {roster.label}
                          </span>
                        </td>
                        <td className="px-3 py-3 align-middle">
                          <div className="flex flex-col gap-1.5 items-end">
                            <div className="inline-flex items-center gap-1.5 justify-end w-full">
                              <input
                                type="checkbox"
                                aria-label={`Select submission ${s.file_name}`}
                                checked={selectedIds.has(s.id)}
                                onChange={() => toggleSelected(s.id)}
                                className="h-3.5 w-3.5 accent-[#84001B] cursor-pointer"
                              />
                            </div>
                            <div className="inline-flex flex-row-reverse items-center gap-1 flex-wrap justify-end max-w-[20rem] ml-auto">
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
                              {submissionHasViewableTeacherScore(s) ? (
                                <button
                                  type="button"
                                  disabled={deleting || resubmitSavingId === s.id}
                                  onClick={() => setViewScoreOpen({ row: s, focus: 'teacher' })}
                                  className="inline-flex items-center gap-0.5 rounded-lg bg-amber-400 px-2 py-1.5 text-[10px] font-bold text-amber-950 shadow-sm shadow-amber-500/25 hover:bg-amber-500 disabled:opacity-50 whitespace-nowrap"
                                  title="View instructor-published score"
                                >
                                  <GraduationCap className="w-3 h-3 shrink-0" aria-hidden />
                                  View Teacher score
                                </button>
                              ) : null}
                              {submissionHasViewableAiScore(s) ? (
                                <button
                                  type="button"
                                  disabled={deleting || resubmitSavingId === s.id}
                                  onClick={() => setViewScoreOpen({ row: s, focus: 'ai' })}
                                  className="inline-flex items-center gap-0.5 rounded-lg bg-amber-400 px-2 py-1.5 text-[10px] font-bold text-amber-950 shadow-sm shadow-amber-500/25 hover:bg-amber-500 disabled:opacity-50 whitespace-nowrap"
                                  title="View automated AI score and feedback"
                                >
                                  <Sparkles className="w-3 h-3 shrink-0" aria-hidden />
                                  View AI score
                                </button>
                              ) : null}
                            </div>
                            <div className="inline-flex flex-wrap justify-end gap-1.5">
                              <button
                                type="button"
                                disabled={deleting || resubmitSavingId === s.id}
                                onClick={() => void openReview(s, 'ai')}
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-900 shadow-sm hover:bg-emerald-100 hover:border-emerald-400 transition-colors disabled:opacity-50"
                                title="Open grading in AI mode — run the evaluator when you are ready"
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
                            </div>
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
          <div className="md:hidden">
            <div className="flex flex-wrap items-center justify-end gap-2 px-3 py-2 mb-3 rounded-xl border border-slate-200/90 bg-slate-50/95">
              <label className="inline-flex items-center gap-2 text-[11px] font-medium text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  aria-label={
                    filtered.length > 0 && filtered.every((s) => selectedIds.has(s.id))
                      ? 'Deselect all submissions in this view'
                      : 'Select all submissions in this view'
                  }
                  checked={filtered.length > 0 && filtered.every((s) => selectedIds.has(s.id))}
                  ref={(el) => {
                    if (!el) return;
                    const sel = filtered.reduce((acc, s) => (selectedIds.has(s.id) ? acc + 1 : acc), 0);
                    el.indeterminate = sel > 0 && sel < filtered.length;
                  }}
                  onChange={(e) => toggleSelectAll(filtered, e.target.checked)}
                  className="h-3.5 w-3.5 accent-[#84001B] cursor-pointer"
                />
                Select all
              </label>
              {(() => {
                const sel = filtered.reduce((acc, s) => (selectedIds.has(s.id) ? acc + 1 : acc), 0);
                return (
                  <button
                    type="button"
                    disabled={sel === 0 || deleting}
                    onClick={() => void deleteSelected(filtered)}
                    className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-[10px] font-semibold text-red-700 shadow-sm hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    title={sel === 0 ? 'Tick rows to enable bulk delete' : `Delete the ${sel} selected`}
                  >
                    <Trash className="w-3 h-3 shrink-0" aria-hidden />
                    Delete selected{sel > 0 ? ` (${sel})` : ''}
                  </button>
                );
              })()}
            </div>
            <div className="space-y-3">
            {filtered.map(s => (
              <div key={s.id} className="bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-sm hover:border-gray-200 transition-all">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    aria-label={`Select submission ${s.file_name}`}
                    checked={selectedIds.has(s.id)}
                    onChange={() => toggleSelected(s.id)}
                    className="mt-3 h-3.5 w-3.5 accent-[#84001B] cursor-pointer shrink-0"
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
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <div className="inline-flex flex-row-reverse items-center gap-1 flex-wrap justify-end">
                          <button
                            type="button"
                            disabled={deleting || resubmitSavingId === s.id}
                            onClick={() => void quickRequestResubmission(s)}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[10px] font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50 shadow-sm"
                            title="Request resubmission"
                          >
                            <Undo2 className="w-3 h-3 shrink-0" aria-hidden />
                            Redo
                          </button>
                          {submissionHasViewableTeacherScore(s) ? (
                            <button
                              type="button"
                              disabled={deleting || resubmitSavingId === s.id}
                              onClick={() => setViewScoreOpen({ row: s, focus: 'teacher' })}
                              className="inline-flex items-center gap-0.5 rounded-lg bg-amber-400 px-2 py-1.5 text-[10px] font-bold text-amber-950 shadow-sm shadow-amber-500/25 hover:bg-amber-500 disabled:opacity-50 whitespace-nowrap"
                              title="View instructor-published score"
                            >
                              <GraduationCap className="w-3 h-3 shrink-0" aria-hidden />
                              View Teacher score
                            </button>
                          ) : null}
                          {submissionHasViewableAiScore(s) ? (
                            <button
                              type="button"
                              disabled={deleting || resubmitSavingId === s.id}
                              onClick={() => setViewScoreOpen({ row: s, focus: 'ai' })}
                              className="inline-flex items-center gap-0.5 rounded-lg bg-amber-400 px-2 py-1.5 text-[10px] font-bold text-amber-950 shadow-sm shadow-amber-500/25 hover:bg-amber-500 disabled:opacity-50 whitespace-nowrap"
                              title="View automated AI score and feedback"
                            >
                              <Sparkles className="w-3 h-3 shrink-0" aria-hidden />
                              View AI score
                            </button>
                          ) : null}
                        </div>
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
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                      <button
                        type="button"
                        disabled={deleting || resubmitSavingId === s.id}
                        onClick={() => void openReview(s, 'ai')}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-900 shadow-sm hover:bg-emerald-100 hover:border-emerald-400 transition-colors disabled:opacity-50"
                        title="Open AI evaluator"
                      >
                        <Sparkles className="w-3.5 h-3.5 shrink-0" aria-hidden />
                        Grade AI
                      </button>
                      <button
                        type="button"
                        disabled={deleting || resubmitSavingId === s.id}
                        onClick={() => void openReview(s, 'teacher')}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#84001B] text-white px-3 py-2 text-[11px] font-semibold hover:bg-[#6b0016] transition-colors disabled:opacity-50"
                        title="Grade as teacher"
                      >
                        <GraduationCap className="w-3.5 h-3.5 shrink-0" aria-hidden />
                        Grade Teacher
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap justify-center gap-1.5">
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
                    </div>
                    <p className="text-xs text-gray-300 mt-1">{new Date(s.submitted_at).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            ))}
            </div>
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
              className="relative flex w-full max-w-[min(92rem,calc(100vw-0.5rem))] flex-col rounded-2xl bg-white shadow-2xl my-auto max-h-[min(94vh,calc(100vh-0.5rem))]"
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
                    <h2 id="grading-modal-title" className="font-bold text-slate-900 text-xl md:text-2xl leading-tight">
                      {gradeMode === 'ai'
                        ? 'AI evaluator'
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

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8 sm:py-7 space-y-6 bg-slate-50/30">
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
                  className="rounded-2xl border-2 border-emerald-300/70 bg-gradient-to-b from-white to-emerald-50/20 p-5 sm:p-7 shadow-lg scroll-mt-4"
                >
                  <div className="flex items-start gap-3 mb-5">
                    <SectionBadge n={2} Icon={Sparkles} accent="emerald" />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base sm:text-lg font-bold text-slate-900 inline-flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-emerald-600 shrink-0" aria-hidden />
                        AI document evaluator
                      </h3>
                      <p className="text-sm text-slate-600 leading-relaxed mt-1.5">
                        Gemini scores this submission from the text below: rubric, what is{' '}
                        <span className="font-semibold text-slate-800">correct vs wrong</span>, suggested fixes, and an
                        executive summary — all generated by the model for{' '}
                        <span className="font-semibold text-slate-800">{gradingDocTypeForAI(selected)}</span>.{' '}
                        {geminiEvalReady
                          ? gradeMode === 'ai'
                            ? 'Grade AI: the first successful Run AI Evaluator fixes the rubric and score for this submission until you publish or request a redo.'
                            : 'Nothing here is hand-authored rubric fill-in; press run to regenerate from the file text.'
                          : import.meta.env.DEV
                            ? 'Local dev: add VITE_GEMINI_API_KEY in .env (or run vercel dev with GEMINI_API_KEY) to enable the live Gemini evaluator.'
                            : import.meta.env.PROD && geminiServerKeyOk === null
                              ? 'Checking whether GEMINI_API_KEY is set on the server…'
                              : `Production: open the Vercel project that deploys ${typeof window !== 'undefined' ? window.location.host : 'this site'} → Settings → Environment Variables → add GEMINI_API_KEY (recommended) or ensure VITE_GEMINI_API_KEY is set for Production, save, then redeploy. Variables on a different Vercel project will not apply here.`}
                        {gradeMode === 'ai'
                          ? ' The draft total is what you can publish to the student.'
                          : ' Use as a draft — your teacher grade in the next step wins on publish.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
                    <div className="min-w-0 flex-1 space-y-4 xl:w-[min(100%,42rem)] xl:shrink-0">
                      <details open className="rounded-xl border border-slate-200 bg-white shadow-sm group">
                        <summary className="cursor-pointer select-none px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-700 hover:bg-slate-50 rounded-t-xl flex items-center justify-between gap-2 list-none [&::-webkit-details-marker]:hidden">
                          <span className="inline-flex items-center gap-2">
                            <Wand2 className="w-4 h-4 text-emerald-600" aria-hidden />
                            Submission text the AI evaluates
                          </span>
                          <span className="text-[11px] font-semibold text-slate-500 normal-case tracking-normal tabular-nums">
                            {inspectionText.trim().split(/\s+/).filter(Boolean).length.toLocaleString()} words
                            <ChevronDown className="w-4 h-4 inline ml-1 -mt-0.5 group-open:rotate-180 transition-transform" aria-hidden />
                          </span>
                        </summary>
                        <div className="border-t border-slate-200 px-4 py-3">
                          <p className="text-[11px] text-slate-500 mb-2 leading-snug">
                            This is the text the evaluator sees. <span className="font-semibold text-slate-600">.docx</span>{' '}
                            uploads are unpacked here when the file URL can be fetched (signed links from your bucket work in
                            this browser session). If word count stays at 0, open the file and paste the body, or check CORS /
                            storage on the download URL.
                          </p>
                          {inspectionAttachments.length > 0 && (
                            <div className="mb-3 rounded-lg border border-emerald-200/80 bg-emerald-50/70 px-2.5 py-2">
                              <p className="text-[11px] font-semibold text-emerald-900 uppercase tracking-wide">
                                Also sent to Gemini (multimodal)
                              </p>
                              <p className="text-[11px] text-emerald-900/90 mt-1 leading-snug">
                                {summarizeAttachmentsForNotice(inspectionAttachments)} — diagrams, scanned pages, photos, charts,
                                code-in-image, audio, and video are read directly by the model alongside any text above.
                              </p>
                              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                                {inspectionAttachments.map((a, i) => (
                                  <li
                                    key={`${a.mimeType}-${i}`}
                                    className="inline-flex items-center gap-1 rounded-full border border-emerald-300/80 bg-white px-2 py-0.5 text-[10px] font-semibold text-emerald-900"
                                    title={a.fileName || a.mimeType}
                                  >
                                    <Sparkles className="w-3 h-3" aria-hidden />
                                    {a.role || a.mimeType}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <textarea
                            value={inspectionText}
                            onChange={(e) => setInspectionText(e.target.value)}
                            readOnly={gradeMode === 'ai' && aiOnlyEvalLocked}
                            rows={16}
                            placeholder="Submission body for the AI evaluator (loaded when possible)…"
                            className={`w-full min-h-[16rem] px-3 py-3 border border-slate-200 rounded-lg text-[15px] leading-7 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 resize-y font-sans ${
                              gradeMode === 'ai' && aiOnlyEvalLocked
                                ? 'bg-slate-50 text-slate-700 cursor-not-allowed'
                                : 'bg-white'
                            }`}
                          />
                        </div>
                      </details>
                    </div>

                    <div className="min-w-0 flex-1 space-y-4">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!aiLoading) void runInspectionNow();
                        }}
                        className="rounded-xl border border-emerald-200/80 bg-white/90 p-4 shadow-sm"
                        aria-label="AI document evaluator"
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            type="submit"
                            disabled={
                              aiLoading ||
                              (gradeMode === 'ai' && aiOnlyEvalLocked) ||
                              (import.meta.env.PROD && !geminiEvalReady)
                            }
                            className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-base font-bold shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                              geminiEvalReady
                                ? 'bg-emerald-700 text-white hover:bg-emerald-800 focus:ring-emerald-600/50 shadow-emerald-800/25'
                                : 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 focus:ring-slate-300'
                            }`}
                            title={
                              gradeMode === 'ai' && aiOnlyEvalLocked
                                ? 'The AI score from your first successful run is fixed until you publish or request a redo.'
                                : 'Run Gemini on the submission text and full rubric (or heuristic draft if no API key).'
                            }
                          >
                            {aiLoading ? (
                              <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
                            ) : (
                              <Sparkles className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
                            )}
                            {aiLoading ? 'Running AI Evaluator…' : 'Run AI Evaluator'}
                          </button>
                          {geminiEvalReady ? (
                            <span
                              className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600"
                              title={
                                import.meta.env.DEV
                                  ? 'VITE_GEMINI_API_KEY or VITE_GEMINI_EVAL_URL is set for local Gemini calls.'
                                  : 'Vercel has GEMINI_API_KEY for /api/gemini-evaluate.'
                              }
                            >
                              Gemini configured
                            </span>
                          ) : import.meta.env.PROD && geminiServerKeyOk === null ? (
                            <span
                              className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-900"
                              title="Probing /api/gemini-evaluate for GEMINI_API_KEY"
                            >
                              Checking server…
                            </span>
                          ) : import.meta.env.PROD && geminiServerKeyOk === false ? (
                            <span
                              className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-red-900"
                              title="Add GEMINI_API_KEY in Vercel → Environment Variables (Production), then redeploy."
                            >
                              GEMINI_API_KEY missing
                            </span>
                          ) : null}
                          {aiCriteria.length > 0 && !aiLoading && (
                            <span className="text-sm font-semibold text-slate-600 tabular-nums ml-auto">
                              Draft total:{' '}
                              <span className="text-emerald-800 text-lg font-extrabold">
                                {maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0}%
                              </span>
                            </span>
                          )}
                        </div>
                        {gradeMode === 'ai' && aiOnlyEvalLocked && (
                          <p className="mt-3 text-[11px] font-medium text-slate-600 leading-snug">
                            The AI rubric and score from your first successful run stay fixed here. You can still edit
                            teacher feedback in step 3, then Publish (or publish again) to update the student. Use Request
                            redo if they must upload a new file (clears this lock).
                          </p>
                        )}

                        {aiLoading && aiCriteria.length > 0 ? (
                          <p className="mt-4 text-xs font-medium text-emerald-900 leading-relaxed">
                            Running AI Evaluator — updating rubric and analysis from the submission text…
                          </p>
                        ) : aiCriteria.length > 0 && !aiLoading ? (
                          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border-2 border-emerald-300/80 bg-emerald-50/80 px-3 py-2.5">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-700 text-white px-3 py-1 text-[11px] font-bold uppercase tracking-wide">
                              <Sparkles className="w-3.5 h-3.5" aria-hidden />
                              AI graded
                            </span>
                            <span className="text-2xl font-extrabold tabular-nums text-emerald-900">
                              {maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0}%
                            </span>
                            <span className="text-xs text-slate-700">
                              {gradeMode === 'ai'
                                ? 'Publish to send this score; edit feedback below and publish again to update the student.'
                                : 'Draft only unless you publish without a teacher override.'}
                            </span>
                          </div>
                        ) : !aiLoading ? (
                          <p className="mt-4 text-xs text-slate-600 leading-relaxed">
                            Not run yet — confirm submission text on the left, then press{' '}
                            <span className="font-semibold text-emerald-800">Run AI Evaluator</span>.
                          </p>
                        ) : null}

                        {inspectionNotice && (
                          <div
                            className={`mt-3 flex gap-2 rounded-lg border px-3 py-2.5 text-sm leading-snug ${
                              inspectionNotice.kind === 'ok'
                                ? 'border-emerald-200 bg-emerald-50/90 text-emerald-950'
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
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </form>

                      {aiLoading && aiCriteria.length === 0 ? (
                        <div className="space-y-3">
                          {[...Array(5)].map((_, i) => (
                            <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-200/70" />
                          ))}
                        </div>
                      ) : aiCriteria.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
                          <Sparkles className="w-10 h-10 text-emerald-200 mx-auto mb-3" aria-hidden />
                          <p className="text-base font-semibold text-slate-800">No rubric report yet</p>
                          <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
                            Run AI Evaluator to fill rubric scores, what is correct in the file, what needs fixing, and the
                            executive summary — all model-generated from this submission.
                          </p>
                        </div>
                      ) : (
                        <div className={aiLoading ? 'relative' : undefined}>
                          {aiLoading && (
                            <div
                              className="pointer-events-none absolute inset-0 z-[1] rounded-xl bg-white/50 backdrop-blur-[1px]"
                              aria-hidden
                            />
                          )}
                          {aiLoading && (
                            <p className="absolute left-1/2 top-4 z-[2] -translate-x-1/2 rounded-full border border-emerald-200 bg-white px-4 py-1.5 text-xs font-semibold text-emerald-900 shadow-md">
                              Running AI Evaluator…
                            </p>
                          )}
                          <AIDocumentEvaluationReport
                            criteria={aiCriteria}
                            aiScorePercent={maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : null}
                            teacherScorePercent={gradeMode === 'ai' ? null : selected.status === 'reviewed' && selected.score != null ? selected.score : null}
                            summaryText={aiExecutiveSummary.trim() ? aiExecutiveSummary : buildAIFeedback(aiCriteria)}
                            documentQualityNotes={aiDocumentQualityNotes.trim() || null}
                            languageCorrections={aiLanguageCorrections}
                            correctHighlights={aiCorrectHighlights}
                            pageRewrites={aiPageRewrites}
                            documentOverviewScores={aiDocumentOverviewScores}
                            diagramEvaluations={aiDiagramEvaluations}
                            showTeacherGrade={gradeMode !== 'ai'}
                            heading={gradeMode === 'ai' ? 'Grading score' : 'AI evaluator — analysis & rubric'}
                            density="comfortable"
                            detailEvaluation="narrative"
                          />
                        </div>
                      )}
                    </div>
                  </div>
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
                        title="Apply the teacher grade. Adjust the rubric or this number later, then Publish (or publish again) to update the student."
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
                          {gradeMode === 'teacher' ? (
                            <>
                              Steady for this session — adjust the rubric to update this total, or edit the number and
                              press Grade as teacher again. Then use{' '}
                              <span className="font-semibold">Publish</span> in the footer (again if the row was already
                              graded).
                            </>
                          ) : (
                            <>
                              will be the published score · press <span className="font-semibold">Publish</span> in the
                              footer.
                            </>
                          )}
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
                                text: `Teacher grade ${rubricSum}/${rubricMax} saved from rubric. Publish (or publish again) to update what the student sees.`,
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
                  const aiReady =
                    aiCriteria.length > 0 &&
                    submissionIsGradeable &&
                    (gradeMode === 'ai' || readiness.ready);
                  const teacherInputMatchesApplied =
                    appliedTeacherScore != null &&
                    (parseTeacherScoreInput(teacherScoreInput) === appliedTeacherScore ||
                      teacherScoreInput.trim() === String(appliedTeacherScore));
                  const teacherReady = appliedTeacherScore != null && teacherInputMatchesApplied;
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
                  const pendingTeacherReapply =
                    gradeMode === 'teacher' &&
                    appliedTeacherScore != null &&
                    !teacherInputMatchesApplied;
                  return (
                    <>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                        {gradeMode === 'ai' ? (
                          <>
                            <ReadinessPill
                              ok={submissionIsGradeable}
                              label={inspectionAttachments.length > 0 ? 'Text + media' : 'Text'}
                              title={
                                inspectionAttachments.length > 0
                                  ? 'Gemini will read the attached PDF / images / audio / video directly, even if there is little or no extracted text.'
                                  : 'Green when enough text was extracted from the submission to score.'
                              }
                            />
                            <ReadinessPill
                              ok={aiCriteria.length > 0 && submissionIsGradeable}
                              label="AI grade"
                              title="Green after Run AI Evaluator returns a rubric and the submission has usable text or media."
                            />
                          </>
                        ) : gradeMode === 'teacher' ? (
                          <ReadinessPill ok={teacherReady} label="Teacher grade" />
                        ) : (
                          <>
                            <ReadinessPill
                              ok={submissionIsGradeable}
                              label={inspectionAttachments.length > 0 ? 'Text + media' : 'Text'}
                              title={
                                inspectionAttachments.length > 0
                                  ? 'Gemini will read the attached PDF / images / audio / video directly, even if there is little or no extracted text.'
                                  : 'Green when enough text was extracted from the submission to score.'
                              }
                            />
                            <ReadinessPill
                              ok={aiCriteria.length > 0 && readiness.ready}
                              label="AI grade"
                              title="AI-based publish needs each criterion above the app’s minimum; use teacher grade instead if you accept the draft as-is."
                            />
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
                        {pendingTeacherReapply && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 text-amber-900 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                            title="The number in the teacher box no longer matches the applied grade. Press Grade as teacher to apply it, or match the box to the rubric total."
                          >
                            <Info className="w-3 h-3" aria-hidden />
                            Sync teacher box
                          </span>
                        )}
                        {publishSource && publishValue != null && (
                          <span
                            className={`inline-flex items-center gap-1 ml-auto rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                              !canPublish
                                ? 'border-amber-300 bg-amber-50 text-amber-950'
                                : publishSource === 'teacher'
                                  ? 'border-[#84001B]/30 bg-[#ffd21a]/15 text-[#5c0014]'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-900'
                            }`}
                            title={
                              !canPublish && publishSource === 'ai'
                                ? readiness.message
                                : publishSource === 'teacher'
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
                            {!canPublish && publishSource === 'ai' ? ' — blocked' : ''}
                          </span>
                        )}
                      </div>
                      {!canPublish && !saving && !aiLoading && gradeMode === 'ai' && (
                        <p className="text-[11px] font-medium text-amber-950 leading-snug rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2">
                          {!submissionIsGradeable
                            ? readiness.message
                            : 'Press Run AI Evaluator to generate a rubric score before publishing.'}
                        </p>
                      )}
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
                                ? `Publishes your teacher score and feedback — the AI draft on file is not changed.`
                                : `Publishes the AI draft score and report — the instructor-published score (if any) is not changed.`
                              : gradeMode === 'ai'
                                ? !submissionIsGradeable
                                  ? readiness.message
                                  : aiCriteria.length === 0
                                    ? 'Press Run AI Evaluator to generate a score before publishing.'
                                    : undefined
                                : gradeMode === 'teacher'
                                  ? pendingTeacherReapply
                                    ? 'The teacher score box does not match the applied grade. Press Grade as teacher to apply the number you typed, or align it with the rubric total.'
                                    : appliedTeacherScore == null
                                      ? 'Type a teacher grade and press "Grade as teacher" before publishing.'
                                      : undefined
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
      {viewScoreOpen ? (
        <TeacherViewScoreModal
          row={viewScoreOpen.row}
          focus={viewScoreOpen.focus}
          onClose={() => setViewScoreOpen(null)}
        />
      ) : null}
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
function ReadinessPill({ ok, label, title }: { ok: boolean; label: string; title?: string }) {
  return (
    <span
      title={title}
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
