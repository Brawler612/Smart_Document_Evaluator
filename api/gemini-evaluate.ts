/**
 * POST /api/gemini-evaluate
 *
 * Server-side Gemini proxy for production deployments. The browser calls this
 * same-origin endpoint so the API key never ships in the client bundle and
 * Google Cloud "HTTP referrer" restrictions on the key cannot block
 * `*.vercel.app` / custom domains (a common reason localhost works but
 * production always falls back to the 2% heuristic).
 *
 * Vercel → Project → Environment Variables (Production + Preview as needed):
 *   - GEMINI_API_KEY   (required) Google AI Studio key (usually AIzaSy…).
 *                        Aliases also accepted: GOOGLE_GEMINI_API_KEY,
 *                        GOOGLE_AI_API_KEY, or VITE_GEMINI_API_KEY if you
 *                        already added the key under that name for local dev.
 *   - VITE_GEMINI_MODEL (optional) Passed through from the client body; the
 *                        server can also read process.env.VITE_GEMINI_MODEL.
 *
 * Local `npm run dev` (Vite only): this route is NOT served — use
 * `VITE_GEMINI_API_KEY` in `.env` for direct browser calls, or run `vercel dev`.
 */

import {
  runGeminiBackedEvaluation,
  type GeminiInlineAttachment,
  type RubricCriterionRow,
} from '../src/lib/geminiDocumentEvaluation.ts';

type RequestLike = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type ResponseLike = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => ResponseLike;
  json: (data: unknown) => void;
  end: () => void;
};

function headerString(req: RequestLike, name: string): string | undefined {
  const h = req.headers;
  if (!h) return undefined;
  const v = h[name] ?? h[name.toLowerCase()];
  if (Array.isArray(v)) return v[0];
  return typeof v === 'string' ? v : undefined;
}

function originOrFromReferrer(req: RequestLike): string | undefined {
  const o = headerString(req, 'origin') ?? headerString(req, 'Origin');
  if (o) return o;
  const ref = headerString(req, 'referer') ?? headerString(req, 'Referer');
  if (!ref) return undefined;
  try {
    return new URL(ref).origin;
  } catch {
    return undefined;
  }
}

function isRubricTemplate(rows: unknown[]): rows is RubricCriterionRow[] {
  return rows.every((x) => {
    if (!x || typeof x !== 'object') return false;
    const o = x as Record<string, unknown>;
    return (
      typeof o.name === 'string' &&
      typeof o.comment === 'string' &&
      typeof o.score === 'number' &&
      typeof o.max === 'number'
    );
  });
}

function isAttachmentList(x: unknown): x is GeminiInlineAttachment[] {
  if (!Array.isArray(x)) return false;
  return x.every((a) => {
    if (!a || typeof a !== 'object') return false;
    const o = a as Record<string, unknown>;
    return typeof o.mimeType === 'string' && typeof o.data === 'string' && o.data.length > 0;
  });
}

/**
 * Loose allow-list: same deployment family + localhost. Stops drive-by
 * abuse of your Gemini quota from random origins (the key is still server-only).
 */
function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && u.hostname === 'localhost')) return false;
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (host.endsWith('.vercel.app')) return true;
    if (host === 'smartformevaluator.com' || host === 'www.smartformevaluator.com') return true;
    if (host === 'smart-document-evaluator.vercel.app' || host === 'smart-document-evalutator.vercel.app') return true;
    return false;
  } catch {
    return false;
  }
}

function readJsonBody(body: unknown): Record<string, unknown> {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof body === 'object') {
    return body as Record<string, unknown>;
  }
  return {};
}

function serverGeminiApiKey(): string {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY ||
    process.env.GOOGLE_AI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    ''
  ).trim();
}

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const origin = originOrFromReferrer(req);
  if (!isAllowedOrigin(origin)) {
    res.status(403).json({
      ok: false,
      error:
        'Forbidden: invalid Origin. The AI evaluator proxy only accepts requests from this app’s own domain.',
    });
    return;
  }

  const apiKey = serverGeminiApiKey();
  if (!apiKey) {
    res.status(503).json({
      ok: false,
      error:
        'GEMINI_API_KEY is not set on the server. In Vercel → Settings → Environment Variables add GEMINI_API_KEY (your AI Studio key), then redeploy.',
    });
    return;
  }

  const raw = readJsonBody(req.body);
  const docType = typeof raw.docType === 'string' ? raw.docType : '';
  const content = typeof raw.content === 'string' ? raw.content : '';
  const templateRaw = Array.isArray(raw.template) ? raw.template : null;
  if (!docType || !templateRaw || templateRaw.length === 0 || !isRubricTemplate(templateRaw)) {
    res.status(400).json({
      ok: false,
      error: 'JSON body must include docType (string) and template (non-empty array of { name, score, max, comment }).',
    });
    return;
  }
  const template = templateRaw;
  const attachments = isAttachmentList(raw.attachments) ? raw.attachments : undefined;

  const modelFromBody = typeof raw.model === 'string' ? raw.model.trim() : '';
  const model = modelFromBody || (process.env.VITE_GEMINI_MODEL || '').trim() || null;

  try {
    const result = await runGeminiBackedEvaluation({
      docType,
      content,
      template,
      attachments,
      evalUrl: null,
      apiKey,
      model,
    });

    if (!result) {
      res.status(502).json({
        ok: false,
        error: 'Gemini did not return usable rubric JSON. Try again in a minute or shorten the submission.',
      });
      return;
    }

    res.status(200).json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(502).json({ ok: false, error: msg.slice(0, 800) });
  }
}
