/**
 * Applies docs/supabase-setup-all-in-one.sql to your Supabase Postgres database.
 * The JS client and anon key cannot create tables; this uses a direct DB connection.
 *
 * 1) Supabase Dashboard → Project Settings → Database
 * 2) Copy "Connection string" → URI (use Session mode, or direct port 5432)
 * 3) Add to .env (NEVER commit; .gitignore should include .env):
 *      DATABASE_URL=postgresql://postgres.[project-ref]:YOUR_DB_PASSWORD@aws-0-....pooler.supabase.com:5432/postgres
 *    Or use the "Direct connection" host on port 5432 if the pooler fails.
 * 4) Run: npm run db:apply
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Client } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

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

const envPath = path.join(root, '.env');
if (!fs.existsSync(envPath)) {
  console.error('Missing .env. Copy .env.example to .env and add DATABASE_URL (see script header in apply-supabase-schema.mjs).');
  process.exit(1);
}

const env = parseEnvFile(fs.readFileSync(envPath, 'utf8'));
const databaseUrl = (env.DATABASE_URL || env.SUPABASE_DB_URL || '').trim();

if (!databaseUrl || databaseUrl.startsWith('postgresql://YOUR_')) {
  console.error('Set DATABASE_URL (or SUPABASE_DB_URL) in .env to your Supabase Postgres connection string.');
  console.error('Dashboard: Project Settings → Database → Connection string (URI), include the password.\n');
  console.error('Without it, open Supabase → SQL Editor and run docs/supabase-setup-all-in-one.sql manually,');
  console.error('or run: npm run supabase:setup  (copy to clipboard + open editor)\n');
  process.exit(1);
}

const sqlFile =
  process.argv[2] && !process.argv[2].startsWith('-')
    ? path.resolve(process.cwd(), process.argv[2])
    : path.join(root, 'docs', 'supabase-setup-all-in-one.sql');

if (!fs.existsSync(sqlFile)) {
  console.error('SQL file not found:', sqlFile);
  process.exit(1);
}

const sql = fs.readFileSync(sqlFile, 'utf8');

console.log('Applying schema from:', path.relative(root, sqlFile));
console.log('Connecting with DATABASE_URL…');

const client = new Client({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('supabase.co') ? { rejectUnauthorized: false } : undefined,
});

try {
  await client.connect();
  console.log('Connected. Running SQL (this may take ~30s)…');
  await client.query(sql);
  console.log('\n✓ Done. PostgREST reload was requested by the script (NOTIFY pgrst).');
  console.log('  Restart npm run dev if the app still shows “missing submissions”. Then Refresh task list.\n');
} catch (e) {
  console.error('\n✗ Failed:', e.message || e);
  if (/password|authentication|28P01/i.test(String(e.message))) {
    console.error('\nCheck the password in the connection string (Database settings → reset if needed).');
  }
  if (/ENOTFOUND|getaddrinfo|timeout/i.test(String(e.message))) {
    console.error('\nTry the other connection mode in Supabase (Session pooler vs direct 5432).');
  }
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
