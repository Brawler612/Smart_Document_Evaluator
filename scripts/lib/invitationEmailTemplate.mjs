/**
 * Shared invitation email template used by both `scripts/send-invitation-email-test.mjs`
 * and `scripts/send-invitation-email-bulk.mjs`. The deployed Vercel function
 * (`api/send-invitation-email.ts`) carries its own copy of the same markup so
 * the serverless build stays self-contained — update both places together
 * when changing the design.
 */

const APP_URL_DEFAULT = 'https://smart-document-evalutator.vercel.app';

function loginUrlFromBase(base) {
  const b = String(base || '').trim().replace(/\/$/, '');
  return b ? `${b}/login` : '/login';
}
const SURVEY_URL_DEFAULT =
  'https://docs.google.com/forms/d/e/1FAIpQLSeZGz5bD6sf-XMKk3tjachS03eZOsLmDYb3Sd1GgtnB2o_qlA/viewform';

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function firstName(value) {
  if (!value) return 'there';
  const head = String(value).trim().split(/\s+/)[0] || '';
  return head || 'there';
}

export function buildInvitationHtml(name, options = {}) {
  const appUrl = options.appUrl || APP_URL_DEFAULT;
  const loginUrl = loginUrlFromBase(appUrl);
  const surveyUrl = options.surveyUrl || SURVEY_URL_DEFAULT;
  const safeName = escapeHtml(firstName(name));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>You have been added to Smart Docs Validator</title>
</head>
<body style="margin:0;padding:0;background:#f5f6fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f6fa;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(132,0,27,0.08);">
          <tr>
            <td style="background:#84001B;background-image:linear-gradient(135deg,#a30022 0%,#84001B 55%,#5a0012 100%);padding:44px 24px 38px;text-align:center;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto 14px;">
                <tr>
                  <td width="42" height="42" align="center" valign="middle" style="background:#ffd21a;border-radius:50%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-weight:800;color:#84001B;font-size:19px;line-height:42px;">S</td>
                </tr>
              </table>
              <h1 style="margin:0;color:#ffffff;font-size:30px;font-weight:800;letter-spacing:0.5px;line-height:1.1;">Smart Docs</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.88);font-size:13px;font-weight:500;letter-spacing:0.1px;">AI-Powered Document Evaluator</p>
            </td>
          </tr>

          <tr>
            <td style="padding:36px 32px 6px;">
              <h2 style="margin:0 0 14px;color:#0f172a;font-size:22px;font-weight:700;line-height:1.3;">Welcome to your evaluation!</h2>
              <p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.65;">
                Hi <strong style="color:#84001B;">${safeName}</strong>, you have been added as an invited evaluator on
                <strong>Smart Docs Validator</strong>.
              </p>
              <p style="margin:0 0 4px;color:#334155;font-size:15px;line-height:1.65;">
                Sign in with this Gmail to upload your task, view your complete AI evaluation report
                (rubric scores, executive summary, page-by-page Before &rarr; After fixes, and a visual
                &amp; diagram review), and tell us how to make the system better.
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:22px 32px 8px;">
              <a href="${loginUrl}"
                 style="display:inline-block;background:#84001B;color:#ffffff;padding:14px 40px;border-radius:999px;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.3px;box-shadow:0 4px 14px rgba(132,0,27,0.28);">
                Open Smart Docs
              </a>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:0 32px 22px;">
              <a href="${surveyUrl}"
                 style="display:inline-block;color:#84001B;text-decoration:none;font-weight:600;font-size:12.5px;letter-spacing:0.2px;border-bottom:1px solid rgba(132,0,27,0.35);padding-bottom:2px;">
                &#9733;&nbsp; After trying it, rate us
              </a>
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px 20px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                     style="background:#fff5f5;border-left:4px solid #84001B;border-radius:8px;">
                <tr>
                  <td style="padding:14px 16px;font-size:13px;line-height:1.6;color:#475569;">
                    <strong style="color:#84001B;">Note:</strong> You are receiving this email as an invite because
                    you are part of the IT332 / CS342 cohort selected to evaluate Smart Docs Validator. If you
                    believe this is a mistake, please reply to this email or simply ignore it.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 30px 26px;text-align:center;">
              <p style="margin:0;font-size:11.5px;color:#94a3b8;line-height:1.6;">
                If the button doesn&rsquo;t work, copy and paste this link into your browser:<br>
                <a href="${loginUrl}" style="color:#84001B;text-decoration:underline;">${loginUrl}</a>
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

export function buildInvitationText(name, options = {}) {
  const appUrl = options.appUrl || APP_URL_DEFAULT;
  const loginUrl = loginUrlFromBase(appUrl);
  const surveyUrl = options.surveyUrl || SURVEY_URL_DEFAULT;
  return [
    `Hi ${firstName(name)},`,
    '',
    'You have been added as an invited evaluator on Smart Docs Validator — the',
    'AI-powered document evaluator built for the IT332 / CS342 cohort. Sign in with',
    'this Gmail to upload your task, view your complete AI evaluation report, and',
    'tell us how to make the system better.',
    '',
    `Open Smart Docs:  ${loginUrl}`,
    `Rate us:          ${surveyUrl}`,
    '',
    'Note: You are receiving this email because you are part of the IT332 / CS342',
    'cohort selected to evaluate Smart Docs Validator. If you believe this is a',
    'mistake, please reply to this email or simply ignore it.',
    '',
    '— Smart Docs Validator',
  ].join('\n');
}

export const INVITATION_SUBJECT = "You've been added to Smart Docs Validator";
