/**
 * Bulk invitation sender: emails every invited student via Resend in one go.
 *
 * Usage (PowerShell):
 *   $env:RESEND_API_KEY = "re_xxx_xxx"
 *   npm run invite:send-all
 *
 * Optional flags:
 *   --only=email1@gmail.com,email2@gmail.com   send only to a subset
 *   --skip=email3@gmail.com                    skip specific addresses
 *   --dry-run                                  print the plan, don't call Resend
 *
 * Optional env (same as the deployed `/api/send-invitation-email`):
 *   SMARTDOCS_FROM_EMAIL    default "Smart Docs Validator <onboarding@resend.dev>"
 *   SMARTDOCS_APP_URL       default "https://smart-document-evalutator.vercel.app"
 *   SMARTDOCS_SURVEY_URL    default the IT332 usability survey
 *   INVITE_BATCH_GAP_MS     default 350 (gap between sends to stay under Resend's 2 req/s limit)
 */

import process from 'node:process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  buildInvitationHtml,
  buildInvitationText,
  firstName,
  INVITATION_SUBJECT,
} from './lib/invitationEmailTemplate.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FROM_EMAIL =
  (process.env.SMARTDOCS_FROM_EMAIL || '').trim() ||
  'Smart Docs Validator <onboarding@resend.dev>';
const APP_URL =
  (process.env.SMARTDOCS_APP_URL || '').trim() || 'https://smart-document-evalutator.vercel.app';
const SURVEY_URL =
  (process.env.SMARTDOCS_SURVEY_URL || '').trim() ||
  'https://docs.google.com/forms/d/e/1FAIpQLSeZGz5bD6sf-XMKk3tjachS03eZOsLmDYb3Sd1GgtnB2o_qlA/viewform';

const BATCH_GAP_MS = Math.max(
  0,
  Number.parseInt(process.env.INVITE_BATCH_GAP_MS ?? '', 10) || 350
);

/**
 * Read the invited Gmail list straight from the TypeScript source so the
 * script never falls out of sync with the deployed allow-list. We do a
 * lightweight regex parse to avoid pulling a TS compiler into a Node script.
 */
function loadInvitedRoster() {
  const invitedPath = resolve(__dirname, '..', 'src', 'data', 'invitedStudentEmails.ts');
  const rosterPath = resolve(__dirname, '..', 'src', 'data', 'it332Sem2ClassRoster.ts');

  const invitedRaw = readFileSync(invitedPath, 'utf8');
  const emails = Array.from(
    invitedRaw.matchAll(/['"`]([a-z0-9._+-]+@gmail\.com)['"`]/gi),
    (m) => m[1].toLowerCase()
  );
  const uniqueEmails = Array.from(new Set(emails));

  const rosterRaw = readFileSync(rosterPath, 'utf8');
  const nameByEmail = new Map();
  const blockRegex =
    /lastName:\s*'([^']+)',\s*\r?\n\s*firstName:\s*'([^']+)',\s*\r?\n\s*citEmail:\s*'([^']*)'/g;
  let match;
  while ((match = blockRegex.exec(rosterRaw)) !== null) {
    const [, lastName, firstName, email] = match;
    if (email) nameByEmail.set(email.toLowerCase(), { firstName, lastName });
  }

  return uniqueEmails.map((email) => ({
    email,
    fullName: nameByEmail.has(email)
      ? `${nameByEmail.get(email).firstName} ${nameByEmail.get(email).lastName}`.trim()
      : null,
  }));
}

function parseArgs(argv) {
  const only = new Set();
  const skip = new Set();
  let dryRun = false;
  for (const arg of argv) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg.startsWith('--only=')) {
      arg
        .slice('--only='.length)
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .forEach((e) => only.add(e));
    } else if (arg.startsWith('--skip=')) {
      arg
        .slice('--skip='.length)
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .forEach((e) => skip.add(e));
    }
  }
  return { only, skip, dryRun };
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function main() {
  const { only, skip, dryRun } = parseArgs(process.argv.slice(2));
  const apiKey = (process.env.RESEND_API_KEY || '').trim();

  if (!apiKey && !dryRun) {
    console.error('RESEND_API_KEY is not set. Get one at https://resend.com');
    process.exit(1);
  }

  const roster = loadInvitedRoster();
  const queue = roster.filter((entry) => {
    if (only.size && !only.has(entry.email)) return false;
    if (skip.has(entry.email)) return false;
    return true;
  });

  console.log(`Plan: send ${queue.length} invitation(s) (gap ${BATCH_GAP_MS}ms)`);
  for (const entry of queue) {
    const greet = firstName(entry.fullName || entry.email.split('@')[0]);
    console.log(`  → ${entry.email}  (greeting: ${greet})`);
  }

  if (dryRun) {
    console.log('\n[--dry-run] No emails sent.');
    return;
  }

  let ok = 0;
  let failed = 0;
  const failures = [];

  for (let i = 0; i < queue.length; i++) {
    const { email, fullName } = queue[i];
    const greetingSource = fullName || email.split('@')[0];
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [email],
          subject: INVITATION_SUBJECT,
          html: buildInvitationHtml(greetingSource, { appUrl: APP_URL, surveyUrl: SURVEY_URL }),
          text: buildInvitationText(greetingSource, { appUrl: APP_URL, surveyUrl: SURVEY_URL }),
        }),
      });

      const detail = await resp.text();
      if (!resp.ok) {
        failed++;
        failures.push({ email, status: resp.status, detail });
        console.log(`  x ${email}  HTTP ${resp.status}: ${detail}`);
      } else {
        ok++;
        const parsed = (() => {
          try {
            return JSON.parse(detail);
          } catch {
            return null;
          }
        })();
        console.log(`  + ${email}  id=${parsed?.id ?? 'n/a'}`);
      }
    } catch (e) {
      failed++;
      failures.push({ email, status: 0, detail: e instanceof Error ? e.message : String(e) });
      console.log(`  x ${email}  network error: ${e instanceof Error ? e.message : e}`);
    }

    if (i < queue.length - 1) await sleep(BATCH_GAP_MS);
  }

  console.log(`\nSent ${ok}/${queue.length} invitation(s).`);
  if (failed > 0) {
    console.log(`Failed: ${failed}`);
    for (const f of failures) console.log(`  - ${f.email}: HTTP ${f.status} ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
