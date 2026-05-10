/**
 * Run: node scripts/check-env.mjs
 * Verifies .env exists and Supabase vars look sane before you debug Google OAuth.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');

function parseEnvFile(content) {
  const out = {};
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

let ok = true;
console.log('Smart Document Evaluator — environment check\n');

if (!fs.existsSync(envPath)) {
  console.error('× Missing .env in project root.');
  console.error('  Copy .env.example to .env and add your Supabase URL + anon key.\n');
  process.exit(1);
}

const raw = fs.readFileSync(envPath, 'utf8');
const env = parseEnvFile(raw);
const url = env.VITE_SUPABASE_URL?.trim();
const key = env.VITE_SUPABASE_ANON_KEY?.trim();
const looksLikePublishable = (v) => typeof v === 'string' && v.startsWith('sb_publishable_');
const looksLikeJwt = (v) => typeof v === 'string' && v.startsWith('eyJ');

if (!url) {
  console.error('× VITE_SUPABASE_URL is empty or missing in .env');
  ok = false;
} else {
  const normalized = url.replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(normalized)) {
    console.warn('⚠ VITE_SUPABASE_URL should look like https://xxxxx.supabase.co (current value may be wrong)');
    ok = false;
  } else {
    console.log('✓ VITE_SUPABASE_URL looks like a Supabase project URL');
  }
}

if (!key) {
  console.error('× VITE_SUPABASE_ANON_KEY is missing in .env');
  ok = false;
} else if (key === 'your_anon_public_key_here') {
  console.error('× VITE_SUPABASE_ANON_KEY is still the placeholder (copy the Publishable key from Supabase).');
  ok = false;
} else if (!looksLikePublishable(key) && !looksLikeJwt(key)) {
  console.error('× VITE_SUPABASE_ANON_KEY does not look like a Supabase publishable/anon key');
  ok = false;
} else {
  console.log('✓ VITE_SUPABASE_ANON_KEY is set');
}

if (!ok) {
  console.error('\nFix .env, restart npm start, then try Google sign-in again.\n');
  process.exit(1);
}

console.log('\nNext (Google OAuth):');
console.log('  1) Supabase → Authentication → Providers → Google ON + Client ID/Secret from Google Cloud');
console.log('  2) Google Cloud → OAuth client → Authorized redirect URIs must include YOUR Supabase callback:');
console.log('     https://<project-ref>.supabase.co/auth/v1/callback');
console.log('  3) Supabase → Authentication → URL Configuration → Redirect URLs must include the full return path, e.g.:');
console.log('     http://localhost:5173/login   or   http://localhost:5173/**   (origin alone is not enough for /login)');
console.log('     Site URL is usually http://localhost:5173 (origin only), not /login');
console.log('     plus your production URL when deployed');
console.log('  4) Restart dev server after any .env change.\n');

const bucket = env.VITE_SUBMISSION_STORAGE_BUCKET?.trim()?.toLowerCase();
if (!bucket || bucket === 'off' || bucket === 'false') {
  console.log(
    'ℹ Submission files: app defaults to bucket `student-submissions`. Run docs/supabase-storage-student-submissions.sql in Supabase so uploads get a public file URL.\n'
  );
} else {
  console.log(`✓ VITE_SUBMISSION_STORAGE_BUCKET=${env.VITE_SUBMISSION_STORAGE_BUCKET.trim()}\n`);
}

console.log('Checking public.users via REST (anon key, may return 200 with 0 rows if RLS hides data)…');

let databaseBootstrapMissing = false;
try {
  const base = url.replace(/\/+$/, '');
  const res = await fetch(`${base}/rest/v1/users?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  let detail = text.slice(0, 300);
  try {
    const j = JSON.parse(text);
    if (j.message) detail = j.message;
    if (j.hint && /schema|reload/i.test(String(j.hint))) detail += ` — ${j.hint}`;
  } catch {
    /* not JSON */
  }
  const tableMissing = /could not find the table|schema cache|pgrst205|pgrst204/i.test(detail);
  const rlsRecursion = /infinite recursion detected in policy/i.test(detail);
  if (res.ok) {
    console.log('✓ REST /users reachable (HTTP 200). If the app still says "schema cache", run NOTIFY in docs/supabase-bootstrap-public-users.sql).\n');
  } else {
    console.warn(`⚠ REST /users HTTP ${res.status}: ${detail}`);
    if (tableMissing) databaseBootstrapMissing = true;
    if (tableMissing) {
      console.warn('  → Run docs/supabase-bootstrap-public-users.sql in Supabase SQL Editor for this project URL.\n');
    } else if (rlsRecursion) {
      const dbUrl = (env.DATABASE_URL || env.SUPABASE_DB_URL || '').trim();
      if (dbUrl && !dbUrl.startsWith('postgresql://YOUR_')) {
        console.warn('  → Fix from your machine: npm run db:fix-rls   (needs DATABASE_URL in .env)\n');
      } else {
        console.warn(
          '  → RLS loop on public.users: npm run supabase:fix-rls (paste SQL) or add DATABASE_URL and run npm run db:fix-rls\n'
        );
      }
    } else {
      console.warn('');
    }
  }
} catch (e) {
  console.warn('⚠ Could not call Supabase REST API:', e?.message ?? e, '\n');
}

let submissionsTableMissing = false;
console.log('Checking public.submissions via REST (anon key)…');
try {
  const base = url.replace(/\/+$/, '');
  const res = await fetch(`${base}/rest/v1/submissions?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  let detail = text.slice(0, 400);
  try {
    const j = JSON.parse(text);
    if (j.message) detail = j.message;
    if (j.hint && /schema|reload/i.test(String(j.hint))) detail += ` — ${j.hint}`;
  } catch {
    /* not JSON */
  }
  const tableMissing = /could not find the table|schema cache|pgrst205|pgrst204/i.test(detail);
  if (res.ok) {
    console.log('✓ REST /submissions reachable (HTTP 200).\n');
  } else {
    console.warn(`⚠ REST /submissions HTTP ${res.status}: ${detail}`);
    if (tableMissing) submissionsTableMissing = true;
  }
} catch (e) {
  console.warn('⚠ Could not probe public.submissions:', e?.message ?? e, '\n');
}

if (submissionsTableMissing) {
  console.error('=== MISSING: public.submissions (and usually assignments) ===');
  console.error(' Automated (needs DATABASE_URL in .env from Supabase → Database → connection URI):');
  console.error('   npm run db:apply');
  console.error(' Manual: Supabase SQL Editor → paste docs/supabase-setup-all-in-one.sql → Run');
  console.error(' Or (if public.users + helpers already exist): docs/supabase-assignments-submissions-core.sql');
  console.error(' Clipboard helper: npm run supabase:setup');
  console.error('');
  console.error('After Run, refresh PostgREST if needed: NOTIFY pgrst, \'reload schema\';');
  console.error('Restart dev after .env edits: npm run dev\n');
  process.exit(1);
}

console.log('--- Always run once per Supabase project (SQL Editor) ---');
console.log('  • docs/supabase-setup-all-in-one.sql  (includes assignments + submissions — same data on every device)');
console.log('  • docs/supabase-storage-student-submissions.sql  (student file URLs — Open file in grading)');
console.log('Optional: docs/supabase-submissions-ai-draft.sql');
console.log('Optional: docs/supabase-roster-columns.sql (spreadsheet columns — also in supabase-setup-all-in-one Part C)');
console.log('');

if (databaseBootstrapMissing) {
  console.error('=== MISSING: public.users ===');
  console.error(' Run: docs/supabase-bootstrap-public-users.sql');
  console.error(' Then: NOTIFY pgrst, \'reload schema\'; is included in that file.');
  console.error('');
  console.error('Restart dev after .env edits: npm run dev\n');
  process.exit(1);
}
