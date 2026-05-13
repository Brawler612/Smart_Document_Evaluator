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

const FROM_EMAIL =
  (process.env.SMARTDOCS_FROM_EMAIL || '').trim() ||
  'Smart Docs Validator <onboarding@resend.dev>';
const APP_URL =
  (process.env.SMARTDOCS_APP_URL || '').trim() || 'https://smartformevaluator.com';
const SURVEY_URL =
  (process.env.SMARTDOCS_SURVEY_URL || '').trim() ||
  'https://docs.google.com/forms/d/e/1FAIpQLSeZGz5bD6sf-XMKk3tjachS03eZOsLmDYb3Sd1GgtnB2o_qlA/viewform';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firstName(value) {
  if (!value) return 'there';
  const head = String(value).trim().split(/\s+/)[0] || '';
  return head || 'there';
}

function buildInvitationHtml(name) {
  const safeName = escapeHtml(firstName(name));
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>You have been added to Smart Docs Validator</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f4f7;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 6px 24px rgba(132,0,27,0.06);">
          <tr>
            <td style="background:#84001B;padding:28px 24px;text-align:center;">
              <p style="margin:0 0 4px;color:#ffd21a;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;">You have been invited</p>
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:0.3px;">Smart Docs Validator</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 30px 8px;">
              <h2 style="margin:0 0 12px;color:#0f172a;font-size:22px;line-height:1.25;">
                Welcome, <span style="color:#84001B;">${safeName}</span>!
              </h2>
              <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#334155;">
                You have been invited to evaluate <strong>Smart Docs Validator</strong> &mdash; the AI-powered
                academic document evaluator built for the IT332 / CS342 cohort. Sign in with this Gmail
                to upload your task, get a complete AI evaluation report, and tell us what to ship next.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 30px 4px;">
              <a href="${APP_URL}"
                 style="display:inline-block;background:#84001B;color:#ffffff;padding:14px 34px;border-radius:999px;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.3px;box-shadow:0 4px 14px rgba(132,0,27,0.25);">
                Open Smart Docs
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 30px 6px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                     style="background:#fffbeb;border:1px solid #fcd34d;border-radius:12px;">
                <tr>
                  <td style="padding:14px 16px;text-align:center;">
                    <p style="margin:0 0 8px;font-size:13px;color:#78350f;font-weight:700;">
                      After you try it &mdash; please rate us!
                    </p>
                    <a href="${SURVEY_URL}"
                       style="display:inline-block;background:#ffffff;border:2px solid #84001B;color:#84001B;padding:9px 18px;border-radius:10px;text-decoration:none;font-weight:800;font-size:12px;letter-spacing:0.4px;">
                      &#9733;&nbsp; Rate us now
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 30px 6px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                     style="background:#f0f4ff;border-left:4px solid #6366f1;border-radius:6px;">
                <tr>
                  <td style="padding:12px 14px;font-size:12.5px;line-height:1.55;color:#475569;">
                    <strong style="color:#312e81;">Note:</strong> You are receiving this email as an invite because
                    you are part of the IT332 / CS342 cohort selected to evaluate Smart Docs Validator.
                    If you believe this is a mistake, please reply to this email or simply ignore it.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 30px 26px;text-align:center;">
              <p style="margin:0;font-size:11.5px;color:#94a3b8;line-height:1.5;">
                If the button doesn&rsquo;t work, copy and paste this link into your browser:<br>
                <a href="${APP_URL}" style="color:#84001B;text-decoration:underline;">${APP_URL}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#fafafa;padding:14px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #f1f1f3;">
              &copy; 2026 Smart Docs Validator. Built for academic excellence.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildInvitationText(name) {
  return [
    `Hi ${firstName(name)},`,
    '',
    'You have been invited to evaluate Smart Docs Validator — the AI-powered academic',
    'document evaluator built for the IT332 / CS342 cohort. Sign in with this Gmail to',
    'upload your task, get a complete AI evaluation report, and tell us what to ship next.',
    '',
    `Open Smart Docs:  ${APP_URL}`,
    `Rate us now:      ${SURVEY_URL}`,
    '',
    'Note: You are receiving this email because you are part of the IT332 / CS342 cohort',
    'selected to evaluate Smart Docs Validator. If you believe this is a mistake, please',
    'reply to this email or simply ignore it.',
    '',
    '— Smart Docs Validator',
  ].join('\n');
}

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
      subject: "You've been added to Smart Docs Validator",
      html: buildInvitationHtml(fullName),
      text: buildInvitationText(fullName),
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
