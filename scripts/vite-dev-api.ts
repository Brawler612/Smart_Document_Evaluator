/**
 * Vite dev middleware: mounts /api/* serverless handlers during `npm run dev`.
 * Production still uses Vercel Functions; this only fixes localhost 404s.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { loadEnv } from 'vite';

type ApiResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => ApiResponse;
  json: (data: unknown) => void;
  end: () => void;
};

type ApiHandler = (req: IncomingMessage & { body?: unknown }, res: ApiResponse) => void | Promise<void>;

function wrapResponse(res: ServerResponse): ApiResponse {
  const api: ApiResponse = {
    setHeader(name, value) {
      res.setHeader(name, value);
    },
    status(code) {
      res.statusCode = code;
      return api;
    },
    json(data) {
      if (!res.getHeader('Content-Type')) {
        res.setHeader('Content-Type', 'application/json');
      }
      res.end(JSON.stringify(data));
    },
    end() {
      res.end();
    },
  };
  return api;
}

const ROUTES: Record<string, () => Promise<{ default: ApiHandler }>> = {
  'POST /api/sync-grades': () => import('../api/sync-grades'),
  'POST /api/delete-submission': () => import('../api/delete-submission'),
  'POST /api/send-invitation-email': () => import('../api/send-invitation-email'),
  'GET /api/gemini-evaluate': () => import('../api/gemini-evaluate'),
  'POST /api/gemini-evaluate': () => import('../api/gemini-evaluate'),
};

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw) as unknown);
      } catch {
        resolve(raw);
      }
    });
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  if (res.writableEnded) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

export function devApiPlugin(mode: string): Plugin {
  return {
    name: 'smart-docs-dev-api',
    configureServer(server) {
      const env = loadEnv(mode, process.cwd(), '');
      for (const [key, value] of Object.entries(env)) {
        if (value && (process.env[key] == null || process.env[key] === '')) {
          process.env[key] = value;
        }
      }

      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0] ?? '';
        if (!pathname.startsWith('/api/')) {
          next();
          return;
        }

        const routeKey = `${req.method ?? 'GET'} ${pathname}`;
        const load = ROUTES[routeKey];
        if (!load) {
          sendJson(res, 404, {
            ok: false,
            error: `No dev handler for ${routeKey}. Use production deploy or add it in scripts/vite-dev-api.ts.`,
          });
          return;
        }

        try {
          const mod = await load();
          const reqWithBody = req as IncomingMessage & { body?: unknown };
          if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
            reqWithBody.body = await readBody(req);
          }
          await mod.default(reqWithBody, wrapResponse(res));
        } catch (e) {
          console.error('[dev-api]', routeKey, e);
          sendJson(res, 500, {
            ok: false,
            error: e instanceof Error ? e.message : 'Dev API handler failed',
          });
        }
      });
    },
  };
}
