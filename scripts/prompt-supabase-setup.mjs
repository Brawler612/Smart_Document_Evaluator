/**
 * Opens your Supabase SQL Editor in the browser and copies the one-shot setup SQL to the clipboard.
 * We cannot run SQL on Supabase from your laptop without the DB password — you still click Run in the dashboard.
 *
 * Usage: npm run supabase:setup
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');
const sqlPath = path.join(root, 'docs', 'supabase-setup-all-in-one.sql');

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

function projectRefFromSupabaseUrl(urlStr) {
  try {
    const u = new URL(urlStr.replace(/\/+$/, ''));
    const host = u.hostname || '';
    const ref = host.split('.')[0];
    if (!ref || !host.includes('supabase.co')) return null;
    return ref;
  } catch {
    return null;
  }
}

function openBrowser(url) {
  const plat = process.platform;
  if (plat === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  if (plat === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}

function copySqlToClipboard(filePath) {
  const plat = process.platform;
  const raw = fs.readFileSync(filePath, 'utf8');
  if (plat === 'win32') {
    const psPath = filePath.replace(/'/g, "''");
    execSync(
      `powershell -NoProfile -Command "Get-Content -LiteralPath '${psPath}' -Raw | Set-Clipboard"`,
      { stdio: 'pipe', encoding: 'utf8' }
    );
    return true;
  }
  if (plat === 'darwin') {
    try {
      execSync('pbcopy', { input: raw, encoding: 'utf8' });
      return true;
    } catch {
      return false;
    }
  }
  try {
    execSync('xclip -selection clipboard', { input: raw, encoding: 'utf8' });
    return true;
  } catch {
    try {
      execSync('wl-copy', { input: raw, encoding: 'utf8' });
      return true;
    } catch {
      return false;
    }
  }
}

console.log('\nSmart Docs — Supabase setup helper\n');

if (!fs.existsSync(envPath)) {
  console.error('× No .env file. Copy .env.example to .env and add VITE_SUPABASE_URL.\n');
  process.exit(1);
}

if (!fs.existsSync(sqlPath)) {
  console.error('× Missing docs/supabase-setup-all-in-one.sql\n');
  process.exit(1);
}

const env = parseEnvFile(fs.readFileSync(envPath, 'utf8'));
const url = env.VITE_SUPABASE_URL?.trim();
const ref = url ? projectRefFromSupabaseUrl(url) : null;

if (!ref) {
  console.error('× Could not read project ref from VITE_SUPABASE_URL in .env');
  console.error('  Expected: https://YOUR_REF.supabase.co\n');
  process.exit(1);
}

const dash = `https://supabase.com/dashboard/project/${ref}/sql/new`;
console.log('1) Opening SQL Editor in your browser…');
console.log('   ', dash);
openBrowser(dash);

console.log('\n2) Copying setup SQL to clipboard…');
const copied = copySqlToClipboard(sqlPath);
if (copied) {
  console.log('   ✓ Clipboard ready (paste with Ctrl+V in the Supabase editor).');
} else {
  console.log('   ⚠ Could not copy automatically. Open this file and copy all:');
  console.log('    ', sqlPath);
}

console.log('\n3) In Supabase: click in the empty editor → Ctrl+V → Run.');
console.log('   This creates assignments + submissions tables so uploads persist after Google sign-in on any device.');
console.log('4) If you ever see HTTP 500 / "infinite recursion" on users: npm run supabase:fix-rls');
console.log('5) Then locally: npm run verify:env   and restart: npm run dev\n');
