/**
 * Optional Gemini-backed rubric fill-in. Uses the heuristic template’s names/max;
 * the model supplies scores, comments, and an executive summary.
 *
 * Configure either:
 * - VITE_GEMINI_EVAL_URL — POST JSON, server holds the API key (recommended for production).
 * - VITE_GEMINI_API_KEY — calls Google directly from the browser (key is public in the bundle; dev/prototype only).
 */

export type RubricCriterionRow = { name: string; score: number; max: number; comment: string };

type GeminiJsonRow = { name?: unknown; score?: unknown; comment?: unknown };

type ParsedPayload = {
  executiveSummary?: unknown;
  criteria?: unknown;
};

/** Keeps prompts smaller so free-tier RPM/TPM limits are less likely to trip. */
const MAX_BODY_CHARS = 48_000;

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
  if (u.includes('account has been suspended')) return true;
  return false;
}

/** Short, user-facing message for failed Gemini / proxy calls (no raw key in UI). */
export function formatGeminiEvaluationError(err: unknown): string {
  if (err instanceof Error) {
    const m = err.message;
    if (isGeminiBillingOrCreditsBlock(m)) {
      return 'Gemini is paused until billing has balance: your Google AI prepayment credits are depleted (or billing is not set up). Open Google AI Studio → pick this API key’s project → Billing / add credits: https://aistudio.google.com/ — Details: https://ai.google.dev/gemini-api/docs/billing#prepay — Waiting a few minutes will not fix this. Until then, remove VITE_GEMINI_API_KEY from .env to use the built-in draft only.';
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
      return 'That model was not found for your key (HTTP 404). The app tries several models automatically; set VITE_GEMINI_MODEL (e.g. gemini-1.5-flash) or use an AI Studio API key.';
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

function buildPrompt(docType: string, content: string, template: RubricCriterionRow[]): string {
  const rubric = template.map((c) => ({ name: c.name, max: c.max }));
  return `You are an expert reviewer for academic and software-engineering documents.

Document type label: ${docType}

Rubric — you must return one entry per name below. Each score is an integer from 0 through max inclusive. Comments should be specific (reference what is present or missing in the document).

${JSON.stringify(rubric, null, 0)}

Document text:
---
${truncateBody(content)}
---

Return ONLY valid JSON (no markdown) with this exact shape:
{"executiveSummary":"string (2–5 sentences for the instructor/student)","criteria":[{"name":"exact rubric name","score":number,"comment":"string"}]}

Rules:
- Include every rubric name exactly once; names must match character-for-character (case-sensitive).
- Scores must respect each criterion's max.
- Be fair: reward clear structure and technical depth; penalize vagueness or missing sections implied by the rubric names.`;
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

/** Ordered list: env first, then ids that usually exist on generativelanguage.googleapis.com. */
function geminiModelCandidates(preferred: string): string[] {
  const p = normalizeGeminiModelId(preferred);
  const pool = [
    p,
    'gemini-1.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash-8b',
    'gemini-1.5-pro',
    'gemini-3-flash-preview',
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
        temperature: 0.35,
        maxOutputTokens: 2048,
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
  const candidates = geminiModelCandidates(model || 'gemini-1.5-flash');
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

export async function runGeminiBackedEvaluation(options: {
  docType: string;
  content: string;
  template: RubricCriterionRow[];
  /** Full URL (e.g. https://your.app/api/evaluate) that accepts POST JSON and returns the same JSON shape as Gemini. */
  evalUrl?: string | null;
  apiKey?: string | null;
  model?: string | null;
}): Promise<{ criteria: RubricCriterionRow[]; executiveSummary: string } | null> {
  const { docType, content, template } = options;
  if (template.length === 0) return null;

  const evalUrl = options.evalUrl?.trim() || null;
  const apiKey = options.apiKey?.trim() || null;
  const model = normalizeGeminiModelId(options.model?.trim() || '') || 'gemini-1.5-flash';

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
  const executiveSummary = normalizeExecutiveSummary(parsed);
  return { criteria: merged, executiveSummary };
}
