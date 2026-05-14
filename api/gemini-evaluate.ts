/**
 * POST /api/gemini-evaluate
 *
 * Server-side Gemini proxy for production deployments. The browser calls this
 * same-origin endpoint so the API key never ships in the client bundle and
 * Google Cloud "HTTP referrer" restrictions on the key cannot block
 * `*.vercel.app` / custom domains (a common reason localhost works but
 * production always falls back to the 2% heuristic).
 *
 * Uses Vercel’s **Web fetch** export (`export default { fetch }`) so the
 * function matches the current Node.js runtime contract. The legacy
 * `(req, res)` default export can fail at cold start with
 * `FUNCTION_INVOCATION_FAILED` on newer builders.
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

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/** ~10 MiB decoded payload budget so JSON.parse + Gemini request stay under serverless RAM. */
const MAX_ATTACHMENT_DECODED_BYTES = 10 * 1024 * 1024;

function jsonResponse(data: unknown, status: number): Response {
  return Response.json(data, { status, headers: CORS_HEADERS });
}

function originFromRequest(request: Request): string | undefined {
  const o = request.headers.get('origin')?.trim();
  if (o) return o;
  const ref = request.headers.get('referer')?.trim();
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
 * Keeps multimodal calls stable on Vercel: huge base64 PDFs / many Word images
 * can OOM the isolate before Google is reached.
 */
function clampAttachmentsForServer(list: GeminiInlineAttachment[] | undefined): GeminiInlineAttachment[] | undefined {
  if (!list?.length) return undefined;
  let total = 0;
  const out: GeminiInlineAttachment[] = [];
  for (const a of list) {
    const estDecoded = Math.floor(a.data.length * 0.75);
    if (total + estDecoded > MAX_ATTACHMENT_DECODED_BYTES) break;
    total += estDecoded;
    out.push(a);
  }
  return out.length > 0 ? out : undefined;
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

function serverGeminiApiKey(): string {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY ||
    process.env.GOOGLE_AI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    ''
  ).trim();
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
    }

    const origin = originFromRequest(request);
    if (!isAllowedOrigin(origin)) {
      return jsonResponse(
        {
          ok: false,
          error:
            'Forbidden: invalid Origin. The AI evaluator proxy only accepts requests from this app’s own domain.',
        },
        403
      );
    }

    const apiKey = serverGeminiApiKey();
    if (!apiKey) {
      return jsonResponse(
        {
          ok: false,
          error:
            'GEMINI_API_KEY is not set on the server. In Vercel → Settings → Environment Variables add GEMINI_API_KEY (your AI Studio key), then redeploy.',
        },
        503
      );
    }

    let raw: Record<string, unknown>;
    try {
      raw = (await request.json()) as Record<string, unknown>;
    } catch {
      return jsonResponse({ ok: false, error: 'Invalid or malformed JSON body.' }, 400);
    }

    const docType = typeof raw.docType === 'string' ? raw.docType : '';
    const content = typeof raw.content === 'string' ? raw.content : '';
    const templateRaw = Array.isArray(raw.template) ? raw.template : null;
    if (!docType || !templateRaw || templateRaw.length === 0 || !isRubricTemplate(templateRaw)) {
      return jsonResponse(
        {
          ok: false,
          error:
            'JSON body must include docType (string) and template (non-empty array of { name, score, max, comment }).',
        },
        400
      );
    }
    const template = templateRaw;
    const rawAttachments = isAttachmentList(raw.attachments) ? raw.attachments : undefined;
    const attachments = clampAttachmentsForServer(rawAttachments);

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
        return jsonResponse(
          {
            ok: false,
            error: 'Gemini did not return usable rubric JSON. Try again in a minute or shorten the submission.',
          },
          502
        );
      }

      return jsonResponse({ ok: true, ...result }, 200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return jsonResponse({ ok: false, error: msg.slice(0, 800) }, 502);
    }
  },
};
