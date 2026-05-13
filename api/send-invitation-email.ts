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
 *   - SMARTDOCS_APP_URL     (optional) Defaults to `https://smartformevaluator.com`.
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
const APP_URL =
  (process.env.SMARTDOCS_APP_URL || '').trim() || 'https://smartformevaluator.com';
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
 * Builds the HTML invitation email. Layout mirrors the ScholarFlow-style
 * reference the user provided: branded header, large welcome heading, a
 * primary CTA pill, a "Note" panel explaining why the user got the email,
 * and a plain-text fallback link in case the button is stripped by the
 * client.
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

function buildInvitationText(name: string): string {
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
