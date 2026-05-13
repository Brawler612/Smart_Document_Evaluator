/**
 * Bulk invitation sender via Gmail SMTP (no domain verification required).
 *
 * Use this when Resend's domain verification is slow or unavailable. It uses
 * Nodemailer with Gmail's SMTP server and a Google App Password tied to the
 * personal Gmail account that owns the project (e.g. `trafalgardreii@gmail.com`).
 *
 * Setup (one-time):
 *   1. Turn on 2-Step Verification at https://myaccount.google.com/security
 *   2. Open https://myaccount.google.com/apppasswords, generate a 16-char
 *      app password (App = "Mail", Device = "Other → Smart Docs"), copy it.
 *   3. Set env vars:
 *        $env:GMAIL_USER         = "trafalgardreii@gmail.com"
 *        $env:GMAIL_APP_PASSWORD = "xxxxxxxxxxxxxxxx"   # 16-char, no spaces
 *      Optional:
 *        $env:GMAIL_FROM_NAME    = "Smart Docs"          # display name
 *        $env:SMARTDOCS_APP_URL  = "https://smart-document-evalutator.vercel.app"
 *        $env:SMARTDOCS_SURVEY_URL = "<google form>"
 *        $env:INVITE_BATCH_GAP_MS = "1500"               # Gmail likes >1s gaps
 *
 * Run:
 *   npm run invite:gmail               # send to all 45 (or use --only / --skip / --dry-run)
 *
 * Limits: Personal Gmail allows ~500 recipients/day. We only need 44 — well within.
 */

import process from 'node:process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import nodemailer from 'nodemailer';
import {
  buildInvitationHtml,
  buildInvitationText,
  firstName,
  INVITATION_SUBJECT,
} from './lib/invitationEmailTemplate.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GMAIL_USER = (process.env.GMAIL_USER || '').trim();
const GMAIL_APP_PASSWORD = (process.env.GMAIL_APP_PASSWORD || '').trim();
const FROM_NAME = (process.env.GMAIL_FROM_NAME || 'Smart Docs').trim();
const APP_URL =
  (process.env.SMARTDOCS_APP_URL || '').trim() ||
  'https://smart-document-evalutator.vercel.app';
const SURVEY_URL =
  (process.env.SMARTDOCS_SURVEY_URL || '').trim() ||
  'https://docs.google.com/forms/d/e/1FAIpQLSeZGz5bD6sf-XMKk3tjachS03eZOsLmDYb3Sd1GgtnB2o_qlA/viewform';
const BATCH_GAP_MS = Math.max(
  500,
  Number.parseInt(process.env.INVITE_BATCH_GAP_MS ?? '', 10) || 1500
);

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
    const [, lastName, fn, email] = match;
    if (email) nameByEmail.set(email.toLowerCase(), { firstName: fn, lastName });
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

  if (!dryRun) {
    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      console.error(
        'Gmail SMTP credentials missing. Set GMAIL_USER and GMAIL_APP_PASSWORD.\n' +
          'Create an app password at https://myaccount.google.com/apppasswords.'
      );
      process.exit(1);
    }
  }

  const roster = loadInvitedRoster();
  const queue = roster.filter((entry) => {
    if (only.size && !only.has(entry.email)) return false;
    if (skip.has(entry.email)) return false;
    return true;
  });

  console.log(`Plan: send ${queue.length} invitation(s) via Gmail SMTP (gap ${BATCH_GAP_MS}ms)`);
  for (const entry of queue) {
    const greet = firstName(entry.fullName || entry.email.split('@')[0]);
    console.log(`  → ${entry.email}  (greeting: ${greet})`);
  }

  if (dryRun) {
    console.log('\n[--dry-run] No emails sent.');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  try {
    await transporter.verify();
    console.log(`\nSMTP login OK (${GMAIL_USER}). Sending…\n`);
  } catch (e) {
    console.error('SMTP login FAILED. Check GMAIL_USER / GMAIL_APP_PASSWORD.');
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }

  let ok = 0;
  let failed = 0;
  const failures = [];

  for (let i = 0; i < queue.length; i++) {
    const { email, fullName } = queue[i];
    const greetingSource = fullName || email.split('@')[0];
    try {
      const info = await transporter.sendMail({
        from: `"${FROM_NAME}" <${GMAIL_USER}>`,
        to: email,
        subject: INVITATION_SUBJECT,
        text: buildInvitationText(greetingSource, { appUrl: APP_URL, surveyUrl: SURVEY_URL }),
        html: buildInvitationHtml(greetingSource, { appUrl: APP_URL, surveyUrl: SURVEY_URL }),
      });
      ok++;
      console.log(`  + ${email}  id=${info.messageId}`);
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      failures.push({ email, detail: msg });
      console.log(`  x ${email}  ${msg}`);
    }

    if (i < queue.length - 1) await sleep(BATCH_GAP_MS);
  }

  transporter.close();

  console.log(`\nSent ${ok}/${queue.length} invitation(s) via Gmail.`);
  if (failed > 0) {
    console.log(`Failed: ${failed}`);
    for (const f of failures) console.log(`  - ${f.email}: ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
