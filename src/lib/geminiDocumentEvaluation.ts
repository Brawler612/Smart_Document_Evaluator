/**
 * Optional Gemini-backed rubric fill-in. Uses the heuristic template’s names/max;
 * the model supplies scores, comments, and an executive summary.
 *
 * Configure either:
 * - VITE_GEMINI_EVAL_URL — POST JSON, server holds the API key (recommended for production).
 * - VITE_GEMINI_API_KEY — calls Google directly from the browser (key is public in the bundle; dev/prototype only).
 */

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

type GeminiJsonRow = { name?: unknown; score?: unknown; comment?: unknown };

type ParsedPayload = {
  executiveSummary?: unknown;
  criteria?: unknown;
  documentQualityNotes?: unknown;
  languageCorrections?: unknown;
  correctHighlights?: unknown;
};

const AI_DRAFT_LANG_START = '\n\n__AI_DRAFT_LANG_JSON__\n';
const AI_DRAFT_LANG_END = '\n__END_AI_DRAFT_LANG_JSON__';

/** Max chars kept for `documentQualityNotes` in API parse + persisted JSON (aligned in both code paths). */
const DOC_QUALITY_NOTES_MAX_CHARS = 8500;

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

function extractJsonObject(raw: string): ParsedPayload | null {
  let s = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(s);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1)) as ParsedPayload;
  } catch {
    return null;
  }
}

function mergeTemplateWithModel(template: RubricCriterionRow[], rows: GeminiJsonRow[]): RubricCriterionRow[] {
  const map = new Map<string, GeminiJsonRow>();
  for (const r of rows) {
    if (typeof r.name === 'string') map.set(r.name.trim().toLowerCase(), r);
  }
  return template.map((t) => {
    const m = map.get(t.name.trim().toLowerCase());
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
    if (out.length >= 18) break;
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
} {
  const s = stored ?? '';
  const idx = s.lastIndexOf(AI_DRAFT_LANG_START);
  if (idx === -1) {
    return { visibleSummary: s.trim(), languageCorrections: [], documentQualityNotes: '', correctHighlights: [] };
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
    };
  } catch {
    return { visibleSummary: s.trim(), languageCorrections: [], documentQualityNotes: '', correctHighlights: [] };
  }
}

export type PersistedAiEvalExtras = {
  languageCorrections: LanguageCorrection[];
  documentQualityNotes: string;
  correctHighlights: CorrectHighlight[];
};

/** Appends a parseable JSON tail on `ai_draft_summary` for structured AI extras (fixes, verified-correct excerpts). */
export function appendPersistedAiEvalExtras(summary: string, extras: PersistedAiEvalExtras): string {
  const notes = extras.documentQualityNotes.trim();
  const cor = extras.languageCorrections ?? [];
  const ch = extras.correctHighlights ?? [];
  if (cor.length === 0 && !notes && ch.length === 0) return summary;
  const payload = JSON.stringify({
    ...(notes ? { documentQualityNotes: notes } : {}),
    ...(ch.length > 0 ? { correctHighlights: ch } : {}),
    languageCorrections: cor,
  });
  return `${summary}${AI_DRAFT_LANG_START}${payload}${AI_DRAFT_LANG_END}`;
}

function buildPrompt(docType: string, content: string, template: RubricCriterionRow[]): string {
  const rubric = template.map((c) => ({ name: c.name, max: c.max }));

  return `You are Gemini, the sole automated document evaluator for this screen. You must judge ONLY from the submission text below—no outside sources. Write thorough, instructor-ready feedback: substantive paragraphs, concrete references to phrases or sections in the document, and nuance when quality is mixed. Prefer depth and usefulness over brevity, while staying truthful to what appears in the text.

Never compress into one-liners: if a section risks sounding like a generic blurb, add specific evidence (short quotes, paraphrases, or “in section X you argue …”) until it reads like a careful human review.

Document type label: ${docType}

Rubric (${rubric.length} criteria) — return one JSON object per rubric name. Each score is an integer from 0 through max inclusive. Every score must be justified by what is actually correct or incorrect IN the document: cite evidence (short quotes or paraphrases tied to locations/ideas in the text). Use the full range: high scores only when the submission clearly earns them on that criterion; low scores when requirements are missing, wrong, or weak. Each rubric comment must be 5–10 sentences mixing (a) what is done well or correctly where applicable and (b) what is wrong, thin, or incomplete where applicable—both grounded in the text. Open with the main takeaway for that criterion, then unpack with examples.

${JSON.stringify(rubric, null, 0)}

Submission text (this is all you may evaluate):
---
${truncateBody(content)}
---

Return ONLY valid JSON (no markdown code fences). Exact top-level keys:
{"executiveSummary":"string","documentQualityNotes":"string","criteria":[{"name":"exact rubric name","score":number,"comment":"string"}],"languageCorrections":[{"category":"grammar|spelling|punctuation|wording|structure|clarity|completeness|other","before":"string","after":"string","note":"string"}],"correctHighlights":[{"excerpt":"string","verification":"string","rubricTie":"string"}]}

executiveSummary rules (this field must be LONG — aim for roughly 500–1200 words before the two Strengths/Needs lines):
- Write 5–9 substantial paragraphs (plain text, no markdown) BEFORE the Strengths/Needs lines. Cover, in order: (1) overall verdict and how well the document fits its apparent purpose; (2) content quality, claims, evidence, and accuracy grounded in the submission; (3) organization, flow, headings, and completeness vs the rubric expectations; (4) language, clarity, and polish; (5–7) optional extra paragraphs for longer or mixed-quality work—call out both strong and weak stretches with specific references; (8) if relevant, risks, ambiguities, or missing definitions the reader would still have.
- Quote or closely paraphrase the submission where helpful; never invent facts not supported by the text.
- Then on their own lines at the END (required for UI parsing — keep these two lines last):
  Strengths: <comma-separated highlights, can be longer than a few words each>
  Needs improvement: <comma-separated gaps>

documentQualityNotes rules:
- Three paragraphs (12–22 sentences total): first on systematic strengths and what already works; second on systematic issues (structure, completeness, argument, evidence, tone); third on cross-cutting patterns (e.g. recurring phrasing, consistency, audience fit). Ground every claim in the submission. Use "" only if truly redundant with executiveSummary.

languageCorrections rules:
- 10–20 items for important fixable issues when the text has them; each before = short verbatim from submission, after = improved wording, note should be 1–2 sentences explaining why the fix matters for clarity or professionalism. Fewer items if the text is very clean. Minimum 0.

correctHighlights rules:
- 8–16 items for passages that are clearly correct, accurate, well argued, or meet rubric expectations. Each item:
  - excerpt: SHORT verbatim quote from the submission.
  - verification: 6–12 sentences explaining why this excerpt is correct or high quality, how it supports a fair score, what would weaken it if changed, and how it ties to rubric ideas (even if rubricTie is empty).
  - rubricTie: optional exact rubric criterion name from the list above when this excerpt mainly supports that criterion; else "".
- If the submission is mostly weak, return fewer items (minimum 0)—do not invent praise.

Other rules:
- Include every rubric name exactly once in criteria; names must match character-for-character (case-sensitive).
- If the body is empty or too short to evaluate, keep scores low, explain in comments, and return empty arrays where appropriate.`;
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
function geminiModelCandidates(preferred: string): string[] {
  const p = normalizeGeminiModelId(preferred);
  const pool = [
    p,
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-2.5-pro',
  ].filter((id): id is string => Boolean(id));
  return pool.filter((id, i) => pool.indexOf(id) === i);
}

async function callGeminiRestOnce(
  apiKey: string,
  model: string,
  prompt: string
): Promise<ParsedPayload | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.42,
        maxOutputTokens: 16384,
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
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    promptFeedback?: { blockReason?: string };
  };
  const block = data.promptFeedback?.blockReason;
  if (block) throw new Error(`Gemini blocked the prompt: ${block}`);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string' || !text.trim()) return null;
  return extractJsonObject(text);
}

/**
 * Retries on 429 / transient errors; on 404 / unknown model tries the next model id (fixes wrong VITE_GEMINI_MODEL).
 */
async function callGeminiRest(apiKey: string, model: string, prompt: string): Promise<ParsedPayload | null> {
  const candidates = geminiModelCandidates(model || 'gemini-2.5-flash');
  let lastError: Error | null = null;

  for (const tryModel of candidates) {
    const maxAttempts = 4;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await callGeminiRestOnce(apiKey, tryModel, prompt);
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
  body: { docType: string; content: string; template: RubricCriterionRow[] }
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
} | null> {
  const { docType, content, template } = options;
  if (template.length === 0) return null;

  const evalUrl = options.evalUrl?.trim() || null;
  const apiKey = options.apiKey?.trim() || null;
  const model = normalizeGeminiModelId(options.model?.trim() || '') || 'gemini-2.5-flash';

  const prompt = buildPrompt(docType, content, template);

  let parsed: ParsedPayload | null = null;
  if (evalUrl) {
    parsed = await callEvalProxy(evalUrl, { docType, content, template });
  } else if (apiKey) {
    parsed = await callGeminiRest(apiKey, model, prompt);
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
  return { criteria: merged, executiveSummary, documentQualityNotes, languageCorrections, correctHighlights };
}
