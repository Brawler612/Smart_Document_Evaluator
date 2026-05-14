/**
 * POST /api/gemini-evaluate — runs Gemini with `GEMINI_API_KEY` (server secret).
 * GET /api/gemini-evaluate — `{ ok, serverKeyConfigured }` for grading UI (no secrets).
 *
 * Server-side Gemini proxy for production. Uses the same **Node (req, res)**
 * default export as `send-invitation-email.ts`. The Web `{ fetch }` export can
 * fail on Vite + Vercel with `FUNCTION_INVOCATION_FAILED` depending on builder.
 *
 * `shared/geminiDocumentEvaluation.ts` must not import `geminiAttachments.ts`
 * (mammoth); types live in `shared/geminiInlineTypes.ts` so the function bundle
 * stays Node-safe.
 *
 * Vercel → Environment Variables: `GEMINI_API_KEY` (required), optional
 * `VITE_GEMINI_MODEL`, `GEMINI_PROXY_EXTRA_ORIGINS`. See `.env.example`.
 */

import {
  runGeminiBackedEvaluation,
  type GeminiInlineAttachment,
  type RubricCriterionRow,
} from '../shared/geminiDocumentEvaluation.js';
import { clampInlineAttachmentsForVercelProxy } from '../shared/geminiProxyPayload.js';

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

function parseExtraAllowedOrigins(): Set<string> {
  const raw = (process.env.GEMINI_PROXY_EXTRA_ORIGINS || '').trim();
  if (!raw) return new Set();
  const out = new Set<string>();
  for (const part of raw.split(',')) {
    const s = part.trim();
    if (!s) continue;
    try {
      if (s.includes('://')) {
        out.add(new URL(s).origin.toLowerCase());
      } else {
        out.add(s.toLowerCase().replace(/^\.+/, ''));
      }
    } catch {
      /* skip invalid token */
    }
  }
  return out;
}

const EXTRA_ORIGINS = parseExtraAllowedOrigins();

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && u.hostname === 'localhost')) return false;
    const host = u.hostname.toLowerCase();
    if (EXTRA_ORIGINS.has(origin.toLowerCase()) || EXTRA_ORIGINS.has(host)) return true;
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (host.endsWith('.vercel.app')) return true;
    if (host === 'smartformevaluator.com' || host === 'www.smartformevaluator.com') return true;
    if (host === 'smart-document-evaluator.vercel.app' || host === 'smart-document-evalutator.vercel.app') return true;
    return false;
  } catch {
    return false;
  }
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const origin = originOrFromReferrer(req);

  if (req.method === 'GET') {
    if (!isAllowedOrigin(origin)) {
      res.status(403).json({ ok: false, error: 'Forbidden: invalid Origin.' });
      return;
    }
    res.status(200).json({ ok: true, serverKeyConfigured: Boolean(serverGeminiApiKey()) });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

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

  let raw: Record<string, unknown>;
  try {
    raw = readJsonBody(req.body);
  } catch {
    res.status(400).json({ ok: false, error: 'Invalid or malformed JSON body.' });
    return;
  }

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
  const rawList = isAttachmentList(raw.attachments) ? raw.attachments : [];
  const attachments = rawList.length > 0 ? clampInlineAttachmentsForVercelProxy(rawList) : undefined;

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
