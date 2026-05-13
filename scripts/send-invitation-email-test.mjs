/**
 * Standalone CLI: send a Smart Docs invitation email via Resend without
 * waiting for a sign-in. Useful for testing the template + delivery before
 * the deployed `/api/send-invitation-email` endpoint is hit.
 *
 * Usage:
 *   # 1) Get a free API key from https://resend.com → API Keys
 *   # 2) Set the env var (PowerShell):
 *   #      $env:RESEND_API_KEY = "re_xxx_xxx"
 *   # 3) Run:
 *   node scripts/send-invitation-email-test.mjs trafalgardreii@gmail.com "Trafalgar Drei"
 *
 * Optional env overrides:
 *   SMARTDOCS_FROM_EMAIL   default "Smart Docs Validator <onboarding@resend.dev>"
 *   SMARTDOCS_APP_URL      default "https://smartformevaluator.com"
 *   SMARTDOCS_SURVEY_URL   default the IT332 Software Usability survey
 */

import process from 'node:process';
import {
  buildInvitationHtml,
  buildInvitationText,
  firstName,
  INVITATION_SUBJECT,
} from './lib/invitationEmailTemplate.mjs';

const FROM_EMAIL =
  (process.env.SMARTDOCS_FROM_EMAIL || '').trim() ||
  'Smart Docs Validator <onboarding@resend.dev>';
const APP_URL =
  (process.env.SMARTDOCS_APP_URL || '').trim() || 'https://smartformevaluator.com';
const SURVEY_URL =
  (process.env.SMARTDOCS_SURVEY_URL || '').trim() ||
  'https://docs.google.com/forms/d/e/1FAIpQLSeZGz5bD6sf-XMKk3tjachS03eZOsLmDYb3Sd1GgtnB2o_qlA/viewform';

async function main() {
  const [emailArg, ...nameParts] = process.argv.slice(2);
  if (!emailArg) {
    console.error(
      'Usage: node scripts/send-invitation-email-test.mjs <email> [full name]'
    );
    process.exit(1);
  }
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    console.error('RESEND_API_KEY is not set. Get one at https://resend.com');
    process.exit(1);
  }

  const email = emailArg.trim().toLowerCase();
  const fullName = nameParts.join(' ').trim() || email.split('@')[0];

  console.log(`Sending invitation to ${email} (greeting: ${firstName(fullName)})`);
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
      html: buildInvitationHtml(fullName, { appUrl: APP_URL, surveyUrl: SURVEY_URL }),
      text: buildInvitationText(fullName, { appUrl: APP_URL, surveyUrl: SURVEY_URL }),
    }),
  });

  const detail = await resp.text();
  if (!resp.ok) {
    console.error(`Resend returned ${resp.status}: ${detail}`);
    process.exit(1);
  }

  console.log(`OK — ${detail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
