/**
 * POST /api/delete-submission
 *
 * Deletes a submission owned by the signed-in student using the service role.
 * Used when RLS blocks direct client DELETE (production before SQL fix is applied).
 *
 * Env (Vercel → Environment Variables):
 *   SUPABASE_SERVICE_ROLE_KEY  (required for this route)
 *   VITE_SUPABASE_URL or SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Untyped client — API routes are not wired to generated Database types. */
type SupabaseAdmin = SupabaseClient;

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

function readJsonBody(body: unknown): Record<string, unknown> {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof body === 'object') return body as Record<string, unknown>;
  return {};
}

async function deleteFromTable(
  admin: SupabaseAdmin,
  table: string,
  submissionId: string,
  studentId: string
): Promise<boolean> {
  const { error, count } = await admin
    .from(table)
    .delete({ count: 'exact' })
    .eq('id', submissionId)
    .eq('student_id', studentId);

  if (error) {
    if (/relation|does not exist|42P01/i.test(error.message)) return false;
    throw error;
  }
  return (count ?? 0) > 0;
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const anonKey = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!url || !anonKey || !serviceKey) {
    return res.status(503).json({
      ok: false,
      error: 'Server delete is not configured (missing Supabase service role key).',
    });
  }

  const auth = headerString(req, 'authorization') ?? headerString(req, 'Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'Missing authorization' });
  }

  const body = readJsonBody(req.body);
  const submissionId = String(body.submissionId ?? body.id ?? '').trim();
  if (!submissionId) {
    return res.status(400).json({ ok: false, error: 'submissionId is required' });
  }

  const userClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  const user = userData?.user;
  if (userErr || !user?.id) {
    return res.status(401).json({ ok: false, error: 'Invalid session' });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    let deleted =
      (await deleteFromTable(admin, 'submissions', submissionId, user.id)) ||
      (await deleteFromTable(admin, 'submission', submissionId, user.id));

    if (!deleted) {
      return res.status(404).json({ ok: false, error: 'Submission not found or not yours' });
    }

    return res.status(200).json({ ok: true, deleted: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Delete failed';
    console.error('[delete-submission]', message);
    return res.status(500).json({ ok: false, error: message });
  }
}
