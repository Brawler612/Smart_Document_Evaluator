/**
 * Optional Gemini-backed rubric fill-in. Uses the heuristic template’s names/max;
 * the model supplies scores, comments, and an executive summary.
 *
 * Multimodal: pass `attachments` to evaluate images, scanned PDFs, charts,
 * screenshots, audio, video, or images embedded inside a Word document.
 * They travel to Google as `inlineData` parts alongside the prompt — so
 * Gemini can see and grade visual / audio / video content directly instead
 * of relying only on text we extracted client-side.
 *
 * Configure either:
 * - VITE_GEMINI_EVAL_URL — POST JSON, server holds the API key (recommended for production).
 * - VITE_GEMINI_API_KEY — calls Google directly from the browser (key is public in the bundle; dev/prototype only).
 */

import type { GeminiInlineAttachment } from './geminiAttachments';

export type { GeminiInlineAttachment } from './geminiAttachments';

export type RubricCriterionRow = { name: string; score: number; max: number; comment: string };

/** Short before/after language fixes grounded in the submitted document (from Gemini JSON). */
export type LanguageCorrection = {
  before: string;
  after: string;
  category?: string;
  note?: string;
};

/** Passages the model flags as correct / well done, with justification tied to scoring. */
export type CorrectHighlight = {
  excerpt: string;
  verification: string;
  rubricTie?: string;
};

/**
 * Per-page (or per-section / per-slide / per-frame) before → after rewrite.
 * Gemini emits one entry per page in the submission so the AI evaluator can
 * show students exactly how each page of their SRS / SDD / SPMP / STD / report
 * should improve. Works for PDFs, images, scanned pages, .docx sections,
 * slide decks, and video/audio timestamps (`page` then becomes the slide
 * number or timestamp marker).
 */
export type PageRewrite = {
  /** 1-indexed page-like position (page, slide, section, scene). */
  page: number;
  /** Optional human title — e.g. "Page 3 — 2.1 Functional Requirements". */
  pageLabel?: string;
  /** What's on this page right now (transcription / faithful summary). */
  before: string;
  /** Improved version of the same page after AI applies its fixes. */
  after: string;
  /** Short bullets of what's wrong on this page (1–6 items). */
  issues?: string[];
  /** Short bullets describing diagrams / images / figures on this page. */
  imagesObserved?: string[];
  /** Optional rubric criterion the page mainly maps to. */
  rubricTie?: string;
};

/** Gemini-style “Document overview & scoring” row (page range + score /10 + narrative). */
export type PageOverviewScore = {
  pageRange: string;
  scoreOutOf10: number;
  evaluation: string;
};

/** Gemini-style diagram / figure scoring table row. */
export type DiagramEvaluation = {
  diagram: string;
  evaluation: string;
  scoreOutOf10: number;
};

type GeminiJsonRow = { name?: unknown; score?: unknown; comment?: unknown };

type ParsedPayload = {
  executiveSummary?: unknown;
  criteria?: unknown;
  documentQualityNotes?: unknown;
  languageCorrections?: unknown;
  correctHighlights?: unknown;
  pageRewrites?: unknown;
  documentOverviewScores?: unknown;
  diagramEvaluations?: unknown;
};

const AI_DRAFT_LANG_START = '\n\n__AI_DRAFT_LANG_JSON__\n';
const AI_DRAFT_LANG_END = '\n__END_AI_DRAFT_LANG_JSON__';

/** Max chars kept for `documentQualityNotes` in API parse + persisted JSON (aligned in both code paths). */
const DOC_QUALITY_NOTES_MAX_CHARS = 14_000;

/** Caps document text in the prompt (balance: context vs tokens / latency). */
const MAX_BODY_CHARS = 56_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True when Google rejects the call until billing / credits are fixed (waiting won't help). */
function isGeminiBillingOrCreditsBlock(message: string): boolean {
  const u = message.toLowerCase();
  if (u.includes('prepayment credits') && u.includes('deplet')) return true;
  if (u.includes('credits are depleted')) return true;
  if (u.includes('billing') && /ai studio|aistudio|manage your project/i.test(message)) return true;
  if (u.includes('payment required') || u.includes('payment_required')) return true;
  if (u.includes('billing has not been enabled') || u.includes('billing must be enabled')) return true;
  if (u.includes('billing_disabled') || u.includes('billing disabled')) return true;
  if (u.includes('account has been suspended')) return true;
  /** Cloud project has no billing → free-tier quotas often stay at zero (429 RESOURCE_EXHAUSTED). */
  if (/free[_-]?tier|generate_content_free_tier|consumer_quota/i.test(u) && /limit:\s*0|quota.*0\b|exceeded your/i.test(u))
    return true;
  if (/\blimit:\s*0\b/i.test(message) && /resource_exhausted|quota|free|gemini|generatecontent/i.test(u)) return true;
  return false;
}

/** Short, user-facing message for failed Gemini / proxy calls (no raw key in UI). */
export function formatGeminiEvaluationError(err: unknown): string {
  if (err instanceof Error) {
    const m = err.message;
    if (/prepayment credits are depleted/i.test(m)) {
      return 'This API key’s project still has no usable Gemini prepay balance. Open https://aistudio.google.com → pick the same Google Cloud project as this key → Billing / add prepayment credits (or link Cloud billing there). Cloud Console payment alone does not always refill AI Studio prepay. Then wait 2–5 minutes, run npm run verify:gemini, restart npm run dev. Details: https://ai.google.dev/gemini-api/docs/billing#prepay';
    }
    if (isGeminiBillingOrCreditsBlock(m)) {
      return 'Gemini needs billing + API access on the Google Cloud project for this key: Cloud Console → link Billing to that project → APIs & Services → enable Generative Language API → Credentials → API key (allow that API). If you use AI Studio prepay, top up in AI Studio for the same project. Wait 2–5 minutes, run npm run verify:gemini, restart npm run dev. https://aistudio.google.com/ — https://ai.google.dev/gemini-api/docs/billing';
    }
    if (/HTTP 401|UNAUTHENTICATED|API key not valid/i.test(m)) {
      return 'The API key was rejected. Create a new key, update .env, restart the dev server, and try again.';
    }
    if (/HTTP 403|PERMISSION_DENIED|blocked/i.test(m)) {
      return 'Access was denied. Enable the Gemini / Generative Language API for this project and confirm the API key restrictions allow that API.';
    }
    if (/No Gemini model worked for this key/i.test(m)) {
      return 'No model ID worked with this API key. Use a key from Google AI Studio (usually starts with AIzaSy) or set VITE_GEMINI_MODEL to an id from https://ai.google.dev/gemini-api/docs/models — then restart npm run dev.';
    }
    if (/HTTP 404|NOT_FOUND/i.test(m)) {
      return 'That model was not found for your key (HTTP 404). The app tries several models automatically; set VITE_GEMINI_MODEL (e.g. gemini-2.5-flash) or use an AI Studio API key. List: https://ai.google.dev/gemini-api/docs/models';
    }
    if (/HTTP 429|RESOURCE_EXHAUSTED|rate limit|Too many requests|quota exceeded|exceeded your current quota/i.test(m)) {
      const tail = m.replace(/^Gemini HTTP \d+:\s*/i, '').trim();
      const extra = tail && tail.length < 400 && !/API[_ ]?key/i.test(tail) ? ` (${tail})` : '';
      return `Google rate limit or short-term quota${extra}. Wait 1–2 minutes and avoid rapid re-clicks. If the message mentions billing or depleted credits, fix billing in AI Studio instead. Quotas: Google Cloud → APIs & Services → Gemini API → Quotas. https://ai.google.dev/gemini-api/docs/rate-limits`;
    }
    if (/Failed to fetch|NetworkError/i.test(m)) {
      return 'Network error talking to Google. Check your connection, ad blockers, and try again.';
    }
    return m.length > 320 ? `${m.slice(0, 300)}…` : m;
  }
  return String(err);
}

/** True when Google rejected the call for account/billing/prepay (not a model bug or transient rate limit). */
export function isGeminiAccountOrBillingBlock(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message;
  if (/prepayment credits are depleted/i.test(m)) return true;
  return isGeminiBillingOrCreditsBlock(m);
}

function formatGeminiBillingShortMessage(err: unknown): string {
  if (!(err instanceof Error)) return formatGeminiEvaluationError(err);
  const m = err.message;
  if (/prepayment credits are depleted/i.test(m)) {
    return 'Google declined Gemini for this key (prepayment credits depleted). The rubric below is the built-in draft—you can edit it and publish. In AI Studio, pick the same Google Cloud project as this API key, add billing or prepay, wait a few minutes, then press Re-grade again: https://aistudio.google.com/';
  }
  return 'Gemini is paused until billing and the Generative Language API are enabled for this key’s Google Cloud project. The rubric below is the built-in draft. See https://ai.google.dev/gemini-api/docs/billing — then run npm run verify:gemini.';
}

/** Grading UI: billing blocks are warnings (draft still works); other failures stay errors. */
export function formatGeminiTeacherNotice(err: unknown): { kind: 'warn' | 'err'; text: string } {
  if (isGeminiAccountOrBillingBlock(err)) {
    return { kind: 'warn', text: formatGeminiBillingShortMessage(err) };
  }
  return { kind: 'err', text: formatGeminiEvaluationError(err) };
}

function parseGoogleApiErrorBody(raw: string): string | null {
  try {
    const j = JSON.parse(raw) as { error?: { message?: string } };
    const msg = j.error?.message;
    return typeof msg === 'string' && msg.trim() ? msg.trim() : null;
  } catch {
    return null;
  }
}

function truncateBody(text: string): string {
  const t = text.trim();
  if (t.length <= MAX_BODY_CHARS) return t;
  return `${t.slice(0, MAX_BODY_CHARS)}\n\n[…truncated for model context…]`;
}

/**
 * Extracts the first JSON object with correct `{` … `}` brace depth (ignores braces inside strings).
 * Fixes many cases where `lastIndexOf('}')` swallowed trailing prose or where the model appended text after JSON.
 */
function extractBalancedJsonObject(raw: string): string | null {
  let s = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(s);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\' && inString) {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function extractJsonObject(raw: string): ParsedPayload | null {
  const balanced = extractBalancedJsonObject(raw);
  const candidates = [balanced, (() => {
    let s = raw.trim();
    const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(s);
    if (fence) s = fence[1].trim();
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    return s.slice(start, end + 1);
  })()].filter((x): x is string => Boolean(x));
  for (const slice of candidates) {
    try {
      return JSON.parse(slice) as ParsedPayload;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Normalizes rubric names so Gemini minor wording differences still merge (e.g. extra spaces, “&” vs “and”). */
function rubricNameKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/&/g, 'and')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, '');
}

function mergeTemplateWithModel(template: RubricCriterionRow[], rows: GeminiJsonRow[]): RubricCriterionRow[] {
  const map = new Map<string, GeminiJsonRow>();
  for (const r of rows) {
    if (typeof r.name === 'string') {
      const k = rubricNameKey(r.name);
      if (k) map.set(k, r);
    }
  }
  return template.map((t) => {
    const m = map.get(rubricNameKey(t.name));
    if (!m) return t;
    const n = Number(m.score);
    const score = Number.isFinite(n) ? Math.round(n) : t.score;
    const clamped = Math.min(t.max, Math.max(0, score));
    const comment =
      typeof m.comment === 'string' && m.comment.trim() ? m.comment.trim() : t.comment;
    return { ...t, score: clamped, comment };
  });
}

function normalizeCriteriaPayload(parsed: ParsedPayload | null, template: RubricCriterionRow[]): RubricCriterionRow[] | null {
  if (!parsed || !Array.isArray(parsed.criteria)) return null;
  const rows: GeminiJsonRow[] = parsed.criteria.filter(
    (x): x is GeminiJsonRow => x != null && typeof x === 'object'
  );
  if (rows.length === 0) return null;
  return mergeTemplateWithModel(template, rows);
}

function normalizeExecutiveSummary(parsed: ParsedPayload | null): string {
  const e = parsed?.executiveSummary;
  return typeof e === 'string' ? e.trim() : '';
}

export function executiveSummaryHasUiTail(exec: string): boolean {
  const low = exec.toLowerCase();
  return low.includes('strengths:') && low.includes('needs improvement:');
}

/** When the model returns a very short executive summary but valid criteria, prepend rubric detail (keeps Strengths:/Needs improvement: at the end for UI parsing). */
function enrichThinExecutiveSummary(exec: string, criteria: RubricCriterionRow[]): string {
  const t = exec.trim();
  if (t.length >= 380 || criteria.length === 0) return t;
  const expansion = criteria
    .map((c) => `On "${c.name}" (${c.score}/${c.max}): ${c.comment}`)
    .join('\n\n');
  const low = t.toLowerCase();
  const si = low.indexOf('strengths:');
  if (si >= 0) {
    const head = t.slice(0, si).trim();
    const tail = t.slice(si).trim();
    const bridge = head ? `${head}\n\nFurther rubric-backed detail:\n\n${expansion}` : `Further rubric-backed detail:\n\n${expansion}`;
    return `${bridge}\n\n${tail}`;
  }
  return t ? `${t}\n\nFurther rubric-backed detail:\n\n${expansion}` : expansion;
}

function normalizeDocumentQualityNotes(parsed: ParsedPayload | null): string {
  const n = parsed?.documentQualityNotes;
  return typeof n === 'string' ? n.trim().slice(0, DOC_QUALITY_NOTES_MAX_CHARS) : '';
}

export function normalizeCorrectHighlights(raw: unknown): CorrectHighlight[] {
  if (!Array.isArray(raw)) return [];
  const out: CorrectHighlight[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const excerpt = typeof o.excerpt === 'string' ? o.excerpt.trim() : '';
    const verification = typeof o.verification === 'string' ? o.verification.trim() : '';
    if (!excerpt || !verification) continue;
    const rubricTie = typeof o.rubricTie === 'string' ? o.rubricTie.trim().slice(0, 120) : '';
    out.push({
      excerpt: excerpt.slice(0, 620),
      verification: verification.slice(0, 2600),
      ...(rubricTie ? { rubricTie } : {}),
    });
    if (out.length >= 12) break;
  }
  return out;
}

/** Per-page rewrite limits: keep tables / scrolls manageable in the UI and the JSON payload bounded. */
const PAGE_REWRITE_MAX_ENTRIES = 32;
const PAGE_REWRITE_MAX_CHARS = 4200;
const PAGE_REWRITE_TITLE_MAX = 200;
const PAGE_REWRITE_BULLET_MAX = 320;

const PAGE_OVERVIEW_MAX = 20;
const PAGE_OVERVIEW_EVAL_MAX = 3600;
const DIAGRAM_EVAL_MAX = 16;
const DIAGRAM_EVAL_TEXT_MAX = 2800;

function normalizeBulletList(raw: unknown, max: number, maxChars: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    const t = v.trim();
    if (!t) continue;
    out.push(t.slice(0, maxChars));
    if (out.length >= max) break;
  }
  return out;
}

export function normalizePageRewrites(raw: unknown): PageRewrite[] {
  if (!Array.isArray(raw)) return [];
  const out: PageRewrite[] = [];
  const seenPages = new Set<number>();
  for (const item of raw) {
    if (item == null || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const pageNum = Number(o.page);
    if (!Number.isFinite(pageNum)) continue;
    const page = Math.max(1, Math.min(999, Math.round(pageNum)));
    const before = typeof o.before === 'string' ? o.before.trim().slice(0, PAGE_REWRITE_MAX_CHARS) : '';
    const after = typeof o.after === 'string' ? o.after.trim().slice(0, PAGE_REWRITE_MAX_CHARS) : '';
    if (!before && !after) continue;
    const pageLabel =
      typeof o.pageLabel === 'string' ? o.pageLabel.trim().slice(0, PAGE_REWRITE_TITLE_MAX) : '';
    const issues = normalizeBulletList(o.issues, 6, PAGE_REWRITE_BULLET_MAX);
    const imagesObserved = normalizeBulletList(o.imagesObserved, 6, PAGE_REWRITE_BULLET_MAX);
    const rubricTie = typeof o.rubricTie === 'string' ? o.rubricTie.trim().slice(0, 120) : '';
    if (seenPages.has(page)) continue;
    seenPages.add(page);
    out.push({
      page,
      ...(pageLabel ? { pageLabel } : {}),
      before,
      after,
      ...(issues.length > 0 ? { issues } : {}),
      ...(imagesObserved.length > 0 ? { imagesObserved } : {}),
      ...(rubricTie ? { rubricTie } : {}),
    });
    if (out.length >= PAGE_REWRITE_MAX_ENTRIES) break;
  }
  out.sort((a, b) => a.page - b.page);
  return out;
}

export function normalizePageOverviewScores(raw: unknown): PageOverviewScore[] {
  if (!Array.isArray(raw)) return [];
  const out: PageOverviewScore[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const pageRange = typeof o.pageRange === 'string' ? o.pageRange.trim().slice(0, 120) : '';
    const n = Number(o.scoreOutOf10);
    const scoreOutOf10 = Number.isFinite(n) ? Math.max(0, Math.min(10, Math.round(n))) : 0;
    const evaluation = typeof o.evaluation === 'string' ? o.evaluation.trim().slice(0, PAGE_OVERVIEW_EVAL_MAX) : '';
    if (!pageRange || !evaluation) continue;
    out.push({ pageRange, scoreOutOf10, evaluation });
    if (out.length >= PAGE_OVERVIEW_MAX) break;
  }
  return out;
}

export function normalizeDiagramEvaluations(raw: unknown): DiagramEvaluation[] {
  if (!Array.isArray(raw)) return [];
  const out: DiagramEvaluation[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const diagram = typeof o.diagram === 'string' ? o.diagram.trim().slice(0, 200) : '';
    const n = Number(o.scoreOutOf10);
    const scoreOutOf10 = Number.isFinite(n) ? Math.max(0, Math.min(10, Math.round(n))) : 0;
    const evaluation = typeof o.evaluation === 'string' ? o.evaluation.trim().slice(0, DIAGRAM_EVAL_TEXT_MAX) : '';
    if (!diagram || !evaluation) continue;
    out.push({ diagram, evaluation, scoreOutOf10 });
    if (out.length >= DIAGRAM_EVAL_MAX) break;
  }
  return out;
}

export function normalizeLanguageCorrections(raw: unknown): LanguageCorrection[] {
  if (!Array.isArray(raw)) return [];
  const out: LanguageCorrection[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const before = typeof o.before === 'string' ? o.before.trim() : '';
    const after = typeof o.after === 'string' ? o.after.trim() : '';
    if (!before || !after) continue;
    const category = typeof o.category === 'string' ? o.category.trim().slice(0, 48) : '';
    const note = typeof o.note === 'string' ? o.note.trim().slice(0, 520) : '';
    out.push({
      before: before.slice(0, 720),
      after: after.slice(0, 720),
      ...(category ? { category } : {}),
      ...(note ? { note } : {}),
    });
    if (out.length >= 22) break;
  }
  return out;
}

/** Strips machine-readable language-fix payload from stored `ai_draft_summary` for display. */
export function parsePersistedAiDraftSummary(stored: string): {
  visibleSummary: string;
  languageCorrections: LanguageCorrection[];
  documentQualityNotes: string;
  correctHighlights: CorrectHighlight[];
  pageRewrites: PageRewrite[];
  documentOverviewScores: PageOverviewScore[];
  diagramEvaluations: DiagramEvaluation[];
} {
  const s = stored ?? '';
  const idx = s.lastIndexOf(AI_DRAFT_LANG_START);
  if (idx === -1) {
    return {
      visibleSummary: s.trim(),
      languageCorrections: [],
      documentQualityNotes: '',
      correctHighlights: [],
      pageRewrites: [],
      documentOverviewScores: [],
      diagramEvaluations: [],
    };
  }
  const head = s.slice(0, idx).trimEnd();
  const after = s.slice(idx + AI_DRAFT_LANG_START.length);
  const endIdx = after.indexOf(AI_DRAFT_LANG_END);
  const jsonRaw = (endIdx >= 0 ? after.slice(0, endIdx) : after).trim();
  try {
    const j = JSON.parse(jsonRaw) as {
      languageCorrections?: unknown;
      documentQualityNotes?: unknown;
      correctHighlights?: unknown;
      pageRewrites?: unknown;
      documentOverviewScores?: unknown;
      diagramEvaluations?: unknown;
    };
    const documentQualityNotes =
      typeof j.documentQualityNotes === 'string'
        ? j.documentQualityNotes.trim().slice(0, DOC_QUALITY_NOTES_MAX_CHARS)
        : '';
    return {
      visibleSummary: head,
      languageCorrections: normalizeLanguageCorrections(j.languageCorrections),
      documentQualityNotes,
      correctHighlights: normalizeCorrectHighlights(j.correctHighlights),
      pageRewrites: normalizePageRewrites(j.pageRewrites),
      documentOverviewScores: normalizePageOverviewScores(j.documentOverviewScores),
      diagramEvaluations: normalizeDiagramEvaluations(j.diagramEvaluations),
    };
  } catch {
    return {
      visibleSummary: s.trim(),
      languageCorrections: [],
      documentQualityNotes: '',
      correctHighlights: [],
      pageRewrites: [],
      documentOverviewScores: [],
      diagramEvaluations: [],
    };
  }
}

export type PersistedAiEvalExtras = {
  languageCorrections: LanguageCorrection[];
  documentQualityNotes: string;
  correctHighlights: CorrectHighlight[];
  pageRewrites?: PageRewrite[];
  documentOverviewScores?: PageOverviewScore[];
  diagramEvaluations?: DiagramEvaluation[];
};

/** Appends a parseable JSON tail on `ai_draft_summary` for structured AI extras (fixes, verified-correct excerpts, per-page rewrites). */
export function appendPersistedAiEvalExtras(summary: string, extras: PersistedAiEvalExtras): string {
  const notes = extras.documentQualityNotes.trim();
  const cor = extras.languageCorrections ?? [];
  const ch = extras.correctHighlights ?? [];
  const pr = extras.pageRewrites ?? [];
  const ov = extras.documentOverviewScores ?? [];
  const dg = extras.diagramEvaluations ?? [];
  if (cor.length === 0 && !notes && ch.length === 0 && pr.length === 0 && ov.length === 0 && dg.length === 0)
    return summary;
  const payload = JSON.stringify({
    ...(notes ? { documentQualityNotes: notes } : {}),
    ...(ch.length > 0 ? { correctHighlights: ch } : {}),
    ...(pr.length > 0 ? { pageRewrites: pr } : {}),
    ...(ov.length > 0 ? { documentOverviewScores: ov } : {}),
    ...(dg.length > 0 ? { diagramEvaluations: dg } : {}),
    languageCorrections: cor,
  });
  return `${summary}${AI_DRAFT_LANG_START}${payload}${AI_DRAFT_LANG_END}`;
}

function buildAttachmentManifest(attachments: GeminiInlineAttachment[]): string {
  if (attachments.length === 0) return '';
  const lines = attachments.map((a, i) => {
    const labelBits: string[] = [`#${i + 1}`, a.mimeType];
    if (a.fileName) labelBits.push(`file="${a.fileName}"`);
    if (a.role) labelBits.push(`role="${a.role}"`);
    return `- ${labelBits.join(' · ')}`;
  });
  return `\n\nAttached binary parts the student submitted (treat as PART OF the submission, not external sources):\n${lines.join('\n')}\n`;
}

function buildMultimodalGuidance(attachments: GeminiInlineAttachment[]): string {
  if (attachments.length === 0) return '';
  const hasImage = attachments.some((a) => a.mimeType.startsWith('image/'));
  const hasPdf = attachments.some((a) => a.mimeType === 'application/pdf');
  const hasAudio = attachments.some((a) => a.mimeType.startsWith('audio/'));
  const hasVideo = attachments.some((a) => a.mimeType.startsWith('video/'));
  const bullets: string[] = [];
  if (hasPdf) {
    bullets.push(
      'For PDF attachments, read EVERY page in order — including scanned pages. OCR the text, transcribe equations, and inspect tables, figures, diagrams, charts, signatures, stamps, headers, footers, and page numbers. Note layout problems (cut-off content, blurry scans, missing pages, low contrast) and tie them to rubric criteria where they affect comprehension.'
    );
  }
  if (hasImage) {
    bullets.push(
      'For image attachments, describe what is depicted and judge it against the rubric. Cover: diagrams (component / sequence / ERD / flowcharts / UML / wireframes / mock-ups), screenshots (UI / IDE / terminal output / test results), photographs of handwritten work or printed pages, charts (axes, units, labels, legend, trends, anomalies), code-in-image (transcribe the visible code and critique correctness, style, and bugs), formulas, drawings, posters, and infographics. Mention legibility, alignment, labels, captions, color use, and whether the image actually supports the surrounding claim.'
    );
  }
  if (hasAudio) {
    bullets.push(
      'For audio attachments, transcribe key passages, summarize topic flow, and judge clarity (volume, background noise, pronunciation), pacing, structure (intro / body / conclusion), accuracy of spoken content vs the rubric, and whether speakers cite sources.'
    );
  }
  if (hasVideo) {
    bullets.push(
      'For video attachments, summarize the timeline (rough timecodes if useful), describe what appears on screen (slides, demo recordings, screen captures, talking head, lab footage), transcribe meaningful audio, and judge production quality (framing, lighting, audio sync, captions, edits) only insofar as it affects the rubric criteria.'
    );
  }
  bullets.push(
    'Quote or paraphrase specific things you saw or heard in the attachments — e.g. "the ER diagram on page 3 omits a foreign key from `orders.user_id`" or "the demo video at ~0:42 shows the form crashing after submit". Never invent details not present in the attached media.'
  );
  return `\n\nMultimodal grading rules (the submission includes binary attachments):\n- ${bullets.join('\n- ')}\n`;
}

function buildPrompt(
  docType: string,
  content: string,
  template: RubricCriterionRow[],
  attachments: GeminiInlineAttachment[] = []
): string {
  const rubric = template.map((c) => ({ name: c.name, max: c.max }));
  const attachmentManifest = buildAttachmentManifest(attachments);
  const multimodalGuidance = buildMultimodalGuidance(attachments);
  const hasTextBody = content.trim().length > 0;
  const submissionLabel = attachments.length > 0
    ? hasTextBody
      ? 'Submission text (extracted from the file; combine it with the attached media below):'
      : 'No text was extracted from the file — judge the attached media below as the full submission:'
    : 'Submission text (this is all you may evaluate):';

  return `You are Gemini, the sole automated document evaluator for this screen. You must judge ONLY from the submission below (text body AND any attached binary parts)—no outside sources. Write thorough, instructor-ready feedback: substantive paragraphs, concrete references to phrases, sections, pages, slides, frames, or images in the submission, and nuance when quality is mixed. Prefer depth and usefulness over brevity, while staying truthful to what appears in the text and the attached media.

Never compress into one-liners: if a section risks sounding like a generic blurb, add specific evidence (short quotes, paraphrases, page/slide references, image descriptions, or “in section X you argue …”) until it reads like a careful human review.

Document type label: ${docType}${attachmentManifest}${multimodalGuidance}

Rubric (${rubric.length} criteria) — return one JSON object per rubric name. Each score is an integer from 0 through max inclusive. Every score must be justified by what is actually correct or incorrect IN the submission (text body or attached media): cite evidence (short quotes, paraphrases, or specific things visible/audible in the attachments tied to locations/ideas). Use the full range: high scores only when the submission clearly earns them on that criterion; low scores when requirements are missing, wrong, or weak. Each rubric comment must be 5–10 sentences mixing (a) what is done well or correctly where applicable and (b) what is wrong, thin, or incomplete where applicable—both grounded in the submission. Open with the main takeaway for that criterion, then unpack with examples.

${JSON.stringify(rubric, null, 0)}

${submissionLabel}
---
${hasTextBody ? truncateBody(content) : '(no text body extracted — rely on the attached media)'}
---

Return ONLY valid JSON (no markdown code fences). Exact top-level keys (all keys required — use empty arrays [] or empty string "" where nothing applies):
{"executiveSummary":"string","documentQualityNotes":"string","criteria":[{"name":"exact rubric name","score":number,"comment":"string"}],"languageCorrections":[{"category":"grammar|spelling|punctuation|wording|structure|clarity|completeness|other","before":"string","after":"string","note":"string"}],"correctHighlights":[{"excerpt":"string","verification":"string","rubricTie":"string"}],"pageRewrites":[{"page":1,"pageLabel":"Page 1 — Title","before":"string","after":"string","issues":["string"],"imagesObserved":["string"],"rubricTie":"string"}],"documentOverviewScores":[{"pageRange":"Pages 1–2 or Page 3","scoreOutOf10":9,"evaluation":"string"}],"diagramEvaluations":[{"diagram":"string","evaluation":"string","scoreOutOf10":10}]}

executiveSummary rules (this field must be LONG — aim for roughly 500–1200 words before the two Strengths/Needs lines):
- Write 5–9 substantial paragraphs (plain text, no markdown) BEFORE the Strengths/Needs lines. Cover, in order: (1) overall verdict and how well the document fits its apparent purpose; (2) content quality, claims, evidence, and accuracy grounded in the submission; (3) organization, flow, headings, and completeness vs the rubric expectations; (4) language, clarity, and polish; (5–7) optional extra paragraphs for longer or mixed-quality work—call out both strong and weak stretches with specific references; (8) if relevant, risks, ambiguities, or missing definitions the reader would still have.
- Quote or closely paraphrase the submission where helpful; never invent facts not supported by the text.
- Then on their own lines at the END (required for UI parsing — keep these two lines last):
  Strengths: <comma-separated highlights, can be longer than a few words each>
  Needs improvement: <comma-separated gaps>

documentQualityNotes rules:
- Three paragraphs (12–22 sentences total): first on systematic strengths and what already works; second on systematic issues (structure, completeness, argument, evidence, tone); third on cross-cutting patterns (e.g. recurring phrasing, consistency, audience fit). Ground every claim in the submission. Use "" only if truly redundant with executiveSummary.

languageCorrections rules:
- 8–16 items for important fixable issues when the text has them; each before = short verbatim from submission (or transcribed from an image / PDF / audio when no plain text body exists), after = improved wording, note should be 1–2 sentences explaining why the fix matters for clarity or professionalism. Fewer items if the text is very clean. If the submission contains no language at all (e.g. an image-only diagram), return an empty array.

correctHighlights rules:
- 6–12 items for things that are clearly correct, accurate, well argued, or meet rubric expectations. Each item:
  - excerpt: a SHORT verbatim quote from the submission. For media-only evidence, write a short bracketed description instead, e.g. "[Image #2: ERD with 3 entities and correctly drawn 1-N link from User → Order]" or "[PDF page 4: bar chart compares CPU usage across four servers]".
  - verification: 6–10 sentences explaining why this excerpt or media moment is correct or high quality, how it supports a fair score, what would weaken it if changed, and how it ties to rubric ideas (even if rubricTie is empty).
  - rubricTie: optional exact rubric criterion name from the list above when this excerpt mainly supports that criterion; else "".
- If the submission is mostly weak, return fewer items (minimum 0)—do not invent praise.

documentOverviewScores rules (Gemini-style “Document overview & scoring” — long, structured, page-by-page like a professional review chat):
- 6–${PAGE_OVERVIEW_MAX} rows when the submission has multiple pages or sections; one row can cover a single page ("Page 3") OR a natural spread ("Pages 5–7") when those pages share one theme (e.g. TOC + intro).
- Each row: pageRange (human-readable), scoreOutOf10 (0–10 integer reflecting quality of THAT span), evaluation = 4–10 sentences with concrete evidence (names, acronyms, FR ids, stack mentions, legal refs, diagram types, table issues, bookmark errors like "Error! Bookmark not defined", etc.). Write like the detailed Gemini web assistant — dense, specific, instructive — not generic praise.
- For PDFs / scans / images, tie each row to what is literally visible on those pages. For audio/video, pageRange can read "0:42–1:10" and evaluation describes what happens in that span.
- Never invent page content; if a page is blank, say so and score low with explanation.

diagramEvaluations rules (Gemini-style “Visual & diagram evaluation” table — separate from pageRewrites):
- 0–${DIAGRAM_EVAL_MAX} rows listing EVERY distinct diagram, chart, screenshot, photo, wireframe, mock-up, DFD, ERD, sequence diagram, state diagram, architecture diagram, deployment diagram, or labeled figure the submission contains (across all pages). If none, return [].
- Each row: diagram = short label (e.g. "DFD Level 0 (Context)"), evaluation = 4–8 sentences on correctness, clarity, notation, missing labels, consistency with text, and how it supports requirements; scoreOutOf10 = 0–10.
- When a diagram is weak, be blunt in evaluation while staying grounded in what is visible.

pageRewrites rules (this is the headline section students see in the AI evaluator — do it well):
- Cover EVERY page of the submission in order. Use the explicit page numbers from PDFs / images / scanned pages; for .docx / text-only bodies, treat each major section or heading boundary as a page (start at 1 and increment for every section); for slide decks, the slide number IS the page; for audio / video, use a 1-indexed "moment" number and put the timestamp in pageLabel (e.g. "0:42 — demo of submit flow"). Aim for at least 6 entries when the submission has that much content; never skip pages just because they look similar. Hard cap of ${PAGE_REWRITE_MAX_ENTRIES} entries — if there are more, summarize remaining pages by grouping nearby pages together in ONE entry whose page is the first page and pageLabel says "Pages 18–24 — Appendix" etc.
- For each page:
  - page: 1-indexed integer (or first page in a group).
  - pageLabel: short title that helps the student navigate, e.g. "Page 3 — 2.1 Functional Requirements" or "Slide 5 — Architecture Diagram" or "Moment 4 — 0:42 demo crash".
  - before: 3–8 sentence FAITHFUL transcription / close summary of what the student wrote, drew, or showed on this page. Keep the student's terminology, headings, table contents, formulas, and any captions of figures. If the page is mostly a diagram or screenshot, describe what is depicted in detail.
  - after: 3–8 sentence IMPROVED rewrite of the same page applying the fixes you'd recommend — better wording, missing requirements added, ambiguous terms defined, sentences combined or split for clarity, tables relabeled, figure captions corrected. Stay grounded: only add content that is consistent with the submission's intent. Do NOT invent new requirements, new diagrams, or new facts.
  - issues: 1–5 short bullets calling out the concrete problems on this page (e.g. "FR-2 uses 'fast' instead of a measurable response-time budget"; "ERD lacks a primary key on the Orders entity"; "page numbering restarts").
  - imagesObserved: 0–5 bullets describing every diagram / screenshot / photo / chart on this page and whether it actually supports the claim made nearby (e.g. "Class diagram has no multiplicity labels; relationships look ambiguous"). Empty array when the page has no visuals.
  - rubricTie: optional exact rubric name from the list above when this page mostly drives one criterion (e.g. "Requirements completeness"); else "".
- Cover ALL document kinds — SRS (Software Requirements Specification), SDD (Software Design Document), SPMP (Software Project Management Plan), STD (Software Test Documentation), test reports, lab reports, design documents, theses, screenshots, photographed handwritten work, slide decks, posters, datasheets — treat each the same: read every page, then produce a before → after rewrite for that page.
- When the document has structural placeholders (table of contents, blank page, "Error! Bookmark not defined.", "Lorem ipsum", "TBD"), include a page entry that calls those out explicitly in issues and shows a healthy replacement in after.

Other rules:
- Include every rubric name exactly once in criteria; names must match character-for-character (case-sensitive).
- If the body is empty or too short to evaluate AND no usable media was attached, keep scores low, explain in comments, and return empty arrays where appropriate (pageRewrites may be empty in that case).`;
}

function isRetryableGeminiFailure(status: number, message: string): boolean {
  if (isGeminiBillingOrCreditsBlock(message)) return false;
  if (status === 429 || status === 503) return true;
  const u = message.toUpperCase();
  return (
    u.includes('RESOURCE_EXHAUSTED') ||
    u.includes('UNAVAILABLE') ||
    /too many requests|try again later|deadline exceeded|internal error/i.test(message)
  );
}

/** Model id not available for this key — try another id. */
function isModelNotFoundOrInvalid(status: number, message: string): boolean {
  if (status === 404) return true;
  return /NOT_FOUND|is not found|invalid model|model .* not found|does not exist|Unsupported model/i.test(message);
}

/** Strip accidental "models/" prefix from env (some UIs copy the full resource path). */
function normalizeGeminiModelId(raw: string): string {
  let m = raw.trim();
  if (!m) return '';
  if (m.toLowerCase().startsWith('models/')) m = m.slice('models/'.length);
  return m.trim();
}

/** Ordered list: env first, then ids for generativelanguage.googleapis.com (Google retires older ids for new keys). */
function geminiModelCandidates(preferred: string, preferHeavyModelForMedia: boolean): string[] {
  const p = normalizeGeminiModelId(preferred);
  /** With PDF / images / video attached, try Pro + Flash first for longer, more grounded multimodal grading. */
  const mediaFirst = [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
  ].filter((id): id is string => Boolean(id));
  const textFirst = [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
  ].filter((id): id is string => Boolean(id));
  const tail = preferHeavyModelForMedia ? mediaFirst : textFirst;
  const pool = [p, ...tail].filter((id): id is string => Boolean(id));
  return pool.filter((id, i) => pool.indexOf(id) === i);
}

type GeminiRequestPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

function buildGeminiRequestParts(prompt: string, attachments: GeminiInlineAttachment[]): GeminiRequestPart[] {
  const parts: GeminiRequestPart[] = [{ text: prompt }];
  for (const a of attachments) {
    if (!a.mimeType || !a.data) continue;
    parts.push({ inlineData: { mimeType: a.mimeType, data: a.data } });
  }
  return parts;
}

async function callGeminiRestOnce(
  apiKey: string,
  model: string,
  prompt: string,
  attachments: GeminiInlineAttachment[]
): Promise<ParsedPayload | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: buildGeminiRequestParts(prompt, attachments) }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.42,
        /** Large cap so per-page rewrites + overview + diagram table fit without truncation. */
        maxOutputTokens: 65536,
      },
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const parsed = parseGoogleApiErrorBody(errText);
    const detail = parsed ?? errText.slice(0, 500);
    throw new Error(`Gemini HTTP ${res.status}: ${detail}`);
  }
  const data = (await res.json()) as {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      finishReason?: string;
    }[];
    promptFeedback?: { blockReason?: string };
  };
  const block = data.promptFeedback?.blockReason;
  if (block) throw new Error(`Gemini blocked the prompt: ${block}`);
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => (typeof p.text === 'string' ? p.text : '')).join('');
  const finishReason = data.candidates?.[0]?.finishReason;
  if (finishReason && finishReason !== 'STOP' && typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    console.warn('[gemini]', model, 'finishReason:', finishReason, '— if JSON is missing, response may be truncated; try again or use a smaller file.');
  }
  if (typeof text !== 'string' || !text.trim()) return null;
  return extractJsonObject(text);
}

/**
 * Retries on 429 / transient errors; on 404 / unknown model tries the next model id (fixes wrong VITE_GEMINI_MODEL).
 */
async function callGeminiRest(
  apiKey: string,
  model: string,
  prompt: string,
  attachments: GeminiInlineAttachment[]
): Promise<ParsedPayload | null> {
  const candidates = geminiModelCandidates(model || 'gemini-2.5-flash', attachments.length > 0);
  let lastError: Error | null = null;

  for (const tryModel of candidates) {
    const maxAttempts = 4;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await callGeminiRestOnce(apiKey, tryModel, prompt, attachments);
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        const msg = lastError.message;
        const statusMatch = msg.match(/Gemini HTTP (\d+):/i);
        const status = statusMatch ? Number(statusMatch[1]) : 0;

        if (isGeminiBillingOrCreditsBlock(msg)) {
          throw lastError;
        }

        if (status === 401 || status === 403) {
          throw lastError;
        }

        if (isModelNotFoundOrInvalid(status, msg)) {
          break;
        }

        const retryable = isRetryableGeminiFailure(status, msg);
        if (!retryable) {
          throw lastError;
        }
        if (attempt < maxAttempts - 1) {
          const delayMs = 1800 * 2 ** attempt + Math.floor(Math.random() * 700);
          await sleep(delayMs);
        }
      }
    }
  }

  throw lastError ?? new Error('No Gemini model worked for this key.');
}

async function callEvalProxy(
  evalUrl: string,
  body: {
    docType: string;
    content: string;
    template: RubricCriterionRow[];
    attachments?: GeminiInlineAttachment[];
  }
): Promise<ParsedPayload | null> {
  const res = await fetch(evalUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Eval proxy HTTP ${res.status}: ${errText.slice(0, 400)}`);
  }
  const data = (await res.json()) as ParsedPayload | Record<string, unknown>;
  if (data && typeof data === 'object' && 'executiveSummary' in data && 'criteria' in data) {
    return data as ParsedPayload;
  }
  if (typeof (data as { raw?: unknown }).raw === 'string') {
    return extractJsonObject((data as { raw: string }).raw);
  }
  return extractJsonObject(JSON.stringify(data));
}

/**
 * Returns rubric rows plus optional `documentQualityNotes`, `languageCorrections`, and `correctHighlights`
 * when the model (or your `VITE_GEMINI_EVAL_URL` proxy) returns the extended JSON shape from `buildPrompt`.
 */
export async function runGeminiBackedEvaluation(options: {
  docType: string;
  content: string;
  template: RubricCriterionRow[];
  /**
   * Optional binary parts to send to Gemini alongside the text body — images,
   * PDFs, audio, video, or images extracted from a Word file. Each part travels
   * as an `inlineData` content part so the model can actually see / hear what
   * the student submitted (not just text we scraped client-side).
   */
  attachments?: GeminiInlineAttachment[];
  /** Full URL (e.g. https://your.app/api/evaluate) that accepts POST JSON and returns the same JSON shape as Gemini. */
  evalUrl?: string | null;
  apiKey?: string | null;
  model?: string | null;
}): Promise<{
  criteria: RubricCriterionRow[];
  executiveSummary: string;
  documentQualityNotes: string;
  languageCorrections: LanguageCorrection[];
  correctHighlights: CorrectHighlight[];
  pageRewrites: PageRewrite[];
  documentOverviewScores: PageOverviewScore[];
  diagramEvaluations: DiagramEvaluation[];
} | null> {
  const { docType, content, template } = options;
  if (template.length === 0) return null;

  const attachments = (options.attachments ?? []).filter(
    (a) => a && typeof a.mimeType === 'string' && typeof a.data === 'string' && a.data.length > 0
  );
  const evalUrl = options.evalUrl?.trim() || null;
  const apiKey = options.apiKey?.trim() || null;
  const model = normalizeGeminiModelId(options.model?.trim() || '') || 'gemini-2.5-flash';

  const prompt = buildPrompt(docType, content, template, attachments);

  let parsed: ParsedPayload | null = null;
  if (evalUrl) {
    parsed = await callEvalProxy(evalUrl, { docType, content, template, attachments });
  } else if (apiKey) {
    parsed = await callGeminiRest(apiKey, model, prompt, attachments);
  } else {
    return null;
  }

  const merged = normalizeCriteriaPayload(parsed, template);
  if (!merged) return null;
  let executiveSummary = normalizeExecutiveSummary(parsed);
  executiveSummary = enrichThinExecutiveSummary(executiveSummary, merged);
  const documentQualityNotes = normalizeDocumentQualityNotes(parsed);
  const languageCorrections = normalizeLanguageCorrections(parsed?.languageCorrections);
  const correctHighlights = normalizeCorrectHighlights(parsed?.correctHighlights);
  const pageRewrites = normalizePageRewrites(parsed?.pageRewrites);
  const documentOverviewScores = normalizePageOverviewScores(parsed?.documentOverviewScores);
  const diagramEvaluations = normalizeDiagramEvaluations(parsed?.diagramEvaluations);
  return {
    criteria: merged,
    executiveSummary,
    documentQualityNotes,
    languageCorrections,
    correctHighlights,
    pageRewrites,
    documentOverviewScores,
    diagramEvaluations,
  };
}
