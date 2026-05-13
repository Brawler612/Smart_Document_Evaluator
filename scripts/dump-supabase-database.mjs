/**
 * Dump the full Supabase Postgres database (schema + data) to a single SQL
 * file you can ship as a deliverable. Uses the same `DATABASE_URL` you
 * already use for `npm run db:apply`.
 *
 * Usage (PowerShell):
 *   $env:DATABASE_URL = "postgresql://postgres.[ref]:PASSWORD@db.[ref].supabase.co:5432/postgres"
 *   npm run db:dump                          # full schema + data
 *   npm run db:dump -- --schema-only         # schema only
 *   npm run db:dump -- --data-only           # data only
 *   npm run db:dump -- --out=path\to\dump.sql
 *
 * Requirements:
 *   - PostgreSQL client tools (`pg_dump`) must be installed and on PATH.
 *     • Windows: install from https://www.postgresql.org/download/windows/ (untick the server, keep "Command Line Tools").
 *     • macOS:    brew install libpq && brew link --force libpq
 *     • Linux:    sudo apt-get install postgresql-client
 *   - DATABASE_URL set, with the password URL-encoded if it contains @ / : etc.
 *
 * Output:
 *   The default destination is db-dumps/smart-docs-<UTC-timestamp>.sql so dumps
 *   never overwrite one another. The folder is created automatically.
 */

import process from 'node:process';
import { mkdirSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function parseArgs(argv) {
  let schemaOnly = false;
  let dataOnly = false;
  let outPath = null;
  for (const arg of argv) {
    if (arg === '--schema-only') schemaOnly = true;
    else if (arg === '--data-only') dataOnly = true;
    else if (arg.startsWith('--out=')) outPath = arg.slice('--out='.length);
  }
  if (schemaOnly && dataOnly) {
    console.error('Pick one of --schema-only or --data-only, not both.');
    process.exit(1);
  }
  return { schemaOnly, dataOnly, outPath };
}

function timestamp() {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace(/Z$/, 'Z');
}

function defaultOutPath() {
  const dumpsDir = resolve(__dirname, '..', 'db-dumps');
  if (!existsSync(dumpsDir)) mkdirSync(dumpsDir, { recursive: true });
  return resolve(dumpsDir, `smart-docs-${timestamp()}.sql`);
}

function run() {
  const databaseUrl = (process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) {
    console.error(
      'DATABASE_URL is not set. Get it from Supabase → Project Settings → Database → Connection string.\n' +
        'In PowerShell: $env:DATABASE_URL = "postgresql://postgres.[ref]:PASSWORD@db.[ref].supabase.co:5432/postgres"'
    );
    process.exit(1);
  }

  const { schemaOnly, dataOnly, outPath } = parseArgs(process.argv.slice(2));
  const out = outPath ? resolve(process.cwd(), outPath) : defaultOutPath();

  const args = [
    '--dbname=' + databaseUrl,
    '--no-owner',
    '--no-privileges',
    '--clean',
    '--if-exists',
    '--quote-all-identifiers',
    '--file=' + out,
  ];
  if (schemaOnly) args.push('--schema-only');
  if (dataOnly) args.push('--data-only');

  console.log('Dumping Supabase database with pg_dump …');
  console.log('  → ' + out);

  const child = spawn('pg_dump', args, { stdio: ['ignore', 'inherit', 'inherit'] });

  child.on('error', (err) => {
    if (err && err.code === 'ENOENT') {
      console.error(
        '\n`pg_dump` was not found on PATH. Install the PostgreSQL client tools and retry:\n' +
          '  Windows: https://www.postgresql.org/download/windows/  (untick "PostgreSQL Server", keep "Command Line Tools")\n' +
          '  macOS:   brew install libpq && brew link --force libpq\n' +
          '  Linux:   sudo apt-get install postgresql-client'
      );
    } else {
      console.error('pg_dump failed to start:', err.message);
    }
    process.exit(1);
  });

  child.on('close', (code) => {
    if (code === 0) {
      console.log('\n✔  Dump written to ' + out);
      console.log('Share this file with whoever needs the database snapshot.');
    } else {
      console.error('\n✖  pg_dump exited with code ' + code);
      process.exit(code || 1);
    }
  });
}

run();
