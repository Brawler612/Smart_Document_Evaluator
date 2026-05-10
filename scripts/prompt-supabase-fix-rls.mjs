/**
 * Opens SQL Editor and copies docs/supabase-fix-users-rls-recursion.sql — run if /users returns 500 or "infinite recursion".
 * Usage: npm run supabase:fix-rls
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');
const sqlPath = path.join(root, 'docs', 'supabase-fix-users-rls-recursion.sql');

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
    execSync(`powershell -NoProfile -Command "Get-Content -LiteralPath '${psPath}' -Raw | Set-Clipboard"`, {
      stdio: 'pipe',
      encoding: 'utf8',
    });
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

console.log('\nSupabase — fix users RLS recursion (paste + Run in SQL Editor)\n');

if (!fs.existsSync(envPath)) {
  console.error('× No .env file.\n');
  process.exit(1);
}
if (!fs.existsSync(sqlPath)) {
  console.error('× Missing docs/supabase-fix-users-rls-recursion.sql\n');
  process.exit(1);
}

const env = parseEnvFile(fs.readFileSync(envPath, 'utf8'));
const ref = env.VITE_SUPABASE_URL?.trim() ? projectRefFromSupabaseUrl(env.VITE_SUPABASE_URL.trim()) : null;
if (!ref) {
  console.error('× Could not read project ref from VITE_SUPABASE_URL\n');
  process.exit(1);
}

const dash = `https://supabase.com/dashboard/project/${ref}/sql/new`;
console.log('Opening SQL Editor…');
console.log(' ', dash);
openBrowser(dash);

const copied = copySqlToClipboard(sqlPath);
if (copied) console.log('\n✓ Fix SQL copied — Ctrl+V in editor → Run → wait a few seconds.');
else console.log('\n⚠ Copy manually:', sqlPath);

console.log('Or with DATABASE_URL in .env: npm run db:fix-rls');
console.log('Then: npm run verify:env\n');
