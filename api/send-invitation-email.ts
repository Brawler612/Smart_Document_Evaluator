/**
 * POST /api/send-invitation-email
 *
 * Sends a one-time, branded invitation email (Smart Docs Validator) to an
 * invited student via Resend's HTTP API. The student's Gmail must be on the
 * server-side allow-list below — anything else returns 403 so the endpoint
 * cannot be abused as an open mail relay.
 *
 * Env vars consumed (set in the Vercel project → Settings → Environment Variables):
 *   - RESEND_API_KEY        (required) Resend API key. Get one for free at https://resend.com.
 *   - SMARTDOCS_FROM_EMAIL  (optional) Defaults to `Smart Docs Validator <onboarding@resend.dev>`.
 *                            Override once you verify a custom domain in Resend.
 *   - SMARTDOCS_APP_URL     (optional) Defaults to `https://smart-document-evalutator.vercel.app`.
 *   - SMARTDOCS_SURVEY_URL  (optional) Defaults to the IT332 Software Usability survey form.
 *
 * Local development:
 *   - You can `vercel dev` from the repo root once you `npm i -g vercel` and
 *     `vercel link` the project. The Vercel CLI loads env vars from
 *     `.env.development.local` / `.env`.
 */

type RequestLike = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type ResponseLike = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => ResponseLike;
  json: (data: unknown) => void;
  end: () => void;
};

/**
 * Server-side allow-list — kept in sync with `src/data/invitedStudentEmails.ts`.
 * Duplicated here so the function stays self-contained (Vercel builds API
 * functions in isolation from the Vite source tree).
 */
const INVITED_STUDENT_GMAILS: ReadonlyArray<string> = [
  'allysonsharaine@gmail.com',
  'anaclaireellen@gmail.com',
  'andresalonga.cit@gmail.com',
  'arnnon.pangan123@gmail.com',
  'banicojosephjames@gmail.com',
  'binagatanalexander2005@gmail.com',
  'bramwellicer@gmail.com',
  'bryekanesy@gmail.com',
  'charlesdarwinhudar@gmail.com',
  'chrisdanielcabatana@gmail.com',
  'christianaire18@gmail.com',
  'davidrysia12@gmail.com',
  'destinegalo29@gmail.com',
  'drakathrosalina@gmail.com',
  'earlgeraldesparcia@gmail.com',
  'geraldezjunjie@gmail.com',
  'gyraldmigelbelen4604@gmail.com',
  'homerfernandez213@gmail.com',
  'jgcjgc123123@gmail.com',
  'jhecyleightolibasmando@gmail.com',
  'joshuaphillipanggamer@gmail.com',
  'justinrey312@gmail.com',
  'karylleamad1@gmail.com',
  'kirstenshaneb@gmail.com',
  'kylenearong127@gmail.com',
  'lanticsev@gmail.com',
  'marklorenzbarangan@gmail.com',
  'markantoncamoro@gmail.com',
  'monicanajarro111@gmail.com',
  'morrelukerz@gmail.com',
  'obejerochad@gmail.com',
  'polarsystem09@gmail.com',
  'rodayban@gmail.com',
  'rodgabriellecanete2002@gmail.com',
  'rubyxmanalo@gmail.com',
  'sheshtyz@gmail.com',
  'sonephoenix46@gmail.com',
  'tedbennarsico04@gmail.com',
  'trafalgardreii@gmail.com',
  'trixieann750@gmail.com',
  'valmera27@gmail.com',
  'villadareznn@gmail.com',
  'zlyhansonbatucan@gmail.com',
  'zyrrahkayelacida@gmail.com',
];

const ALLOWED = new Set(INVITED_STUDENT_GMAILS.map((e) => e.toLowerCase()));

const FROM_EMAIL =
  (process.env.SMARTDOCS_FROM_EMAIL || '').trim() ||
  'Smart Docs Validator <onboarding@resend.dev>';
const APP_URL = (process.env.SMARTDOCS_APP_URL || '').trim() || 'https://smart-document-evalutator.vercel.app';
const LOGIN_URL = `${APP_URL.replace(/\/$/, '')}/login`;
const SURVEY_URL =
  (process.env.SMARTDOCS_SURVEY_URL || '').trim() ||
  'https://docs.google.com/forms/d/e/1FAIpQLSeZGz5bD6sf-XMKk3tjachS03eZOsLmDYb3Sd1GgtnB2o_qlA/viewform';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firstName(value: string | null | undefined): string {
  if (!value) return 'there';
  const head = value.trim().split(/\s+/)[0] ?? '';
  return head || 'there';
}

/**
 * Builds the HTML invitation email. Layout mirrors the ScholarFlow reference
 * the user shared: a gradient header card with a small circular accent and
 * tagline, a "Welcome to your …" heading, a personalised "Hi <name>, you've
 * been added …" intro, a single big rounded CTA pill, an inline secondary
 * "Rate us" link, a brand-colour Note block, and a copy-paste fallback link
 * for clients that strip the button.
 */
function buildInvitationHtml(name: string): string {
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
              <a href="${LOGIN_URL}"
                 style="display:inline-block;background:#84001B;color:#ffffff;padding:14px 40px;border-radius:999px;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.3px;box-shadow:0 4px 14px rgba(132,0,27,0.28);">
                Open Smart Docs
              </a>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:0 32px 22px;">
              <a href="${SURVEY_URL}"
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
                <a href="${LOGIN_URL}" style="color:#84001B;text-decoration:underline;">${LOGIN_URL}</a>
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

function buildInvitationText(name: string): string {
  return [
    `Hi ${firstName(name)},`,
    '',
    'You have been invited to evaluate Smart Docs Validator — the AI-powered academic',
    'document evaluator built for the IT332 / CS342 cohort. Sign in with this Gmail to',
    'upload your task, get a complete AI evaluation report, and tell us what to ship next.',
    '',
    `Open Smart Docs:  ${LOGIN_URL}`,
    `Rate us now:      ${SURVEY_URL}`,
    '',
    'Note: You are receiving this email because you are part of the IT332 / CS342 cohort',
    'selected to evaluate Smart Docs Validator. If you believe this is a mistake, please',
    'reply to this email or simply ignore it.',
    '',
    '— Smart Docs Validator',
  ].join('\n');
}

function readJsonBody(body: unknown): { email?: string; fullName?: string | null } {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as { email?: string; fullName?: string | null };
    } catch {
      return {};
    }
  }
  if (typeof body === 'object') {
    return body as { email?: string; fullName?: string | null };
  }
  return {};
}

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  /** CORS for the Vite dev server + smartformevaluator.com. */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    res.status(500).json({
      ok: false,
      error:
        'RESEND_API_KEY is not set on the server. Add it to Vercel → Project → Settings → Environment Variables and redeploy.',
    });
    return;
  }

  const { email, fullName } = readJsonBody(req.body);
  const cleanedEmail = (email || '').trim().toLowerCase();
  if (!cleanedEmail) {
    res.status(400).json({ ok: false, error: 'email is required in the JSON body' });
    return;
  }
  if (!ALLOWED.has(cleanedEmail)) {
    res.status(403).json({ ok: false, error: 'This email is not on the invited list.' });
    return;
  }

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [cleanedEmail],
        subject: "You've been added to Smart Docs Validator",
        html: buildInvitationHtml(fullName ?? cleanedEmail),
        text: buildInvitationText(fullName ?? cleanedEmail),
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => '<unreadable>');
      res.status(502).json({ ok: false, error: `Resend error ${resp.status}: ${detail}` });
      return;
    }

    const data = (await resp.json().catch(() => ({}))) as { id?: string };
    res.status(200).json({ ok: true, id: data.id ?? null });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e instanceof Error ? e.message : 'Unknown error sending invitation email',
    });
  }
}
