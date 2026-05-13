# Invitation Email Setup (Resend + Vercel)

This explains how to enable real Gmail-inbox invitation emails for the 43
invited students listed in `src/data/invitedStudentEmails.ts`.

The plumbing is already in place:

- `api/send-invitation-email.ts` — Vercel serverless function that calls
  Resend and sends the branded HTML invitation.
- `src/lib/sendInvitationEmail.ts` — fire-and-forget client helper.
- `src/components/student/StudentInvitationCard.tsx` — fires the helper
  exactly once per `(userId × browser)` when an invited Gmail signs in.
- `scripts/send-invitation-email-test.mjs` — CLI to send a test email
  without waiting for a sign-in.

All you need is a Resend API key, copied into Vercel env vars. Three steps.

---

## 1. Create a Resend account (free)

1. Go to <https://resend.com> and sign up with any email.
2. Open **API Keys** in the dashboard, click **Create API Key**, name it
   `smart-docs-prod`, give it the **Sending access** scope, copy the value
   (starts with `re_`). You will not see it again — paste it somewhere safe
   for a moment.
3. (Optional, recommended later) Verify a custom sending domain so the
   "From" address can be e.g. `invites@smartformevaluator.com` instead of
   the shared `onboarding@resend.dev` address. Skip for now — the shared
   address works out of the box and the free tier covers 100 emails / day.

---

## 2. Add the key to Vercel

In the Vercel dashboard, open the Smart Docs Validator project →
**Settings → Environment Variables** and add:

| Name                   | Value                                                                        | Env       |
| ---------------------- | ---------------------------------------------------------------------------- | --------- |
| `RESEND_API_KEY`       | `re_xxx_...` (the value you copied)                                          | All       |
| `SMARTDOCS_FROM_EMAIL` | _(optional)_ e.g. `Smart Docs <invites@smartformevaluator.com>` once verified | All       |
| `SMARTDOCS_APP_URL`    | _(optional)_ defaults to `https://smartformevaluator.com`                    | All       |
| `SMARTDOCS_SURVEY_URL` | _(optional)_ override the Rate Us Google Form URL                            | All       |

After saving, click **Redeploy → Use existing Build Cache** so the running
deployment picks up the new env var. Future pushes inherit it automatically.

---

## 3. Verify it works

### Option A — log in as an invited student

1. Sign in to <https://smartformevaluator.com> with one of the 43 Gmails in
   `src/data/invitedStudentEmails.ts` (e.g. `trafalgardreii@gmail.com`).
2. The yellow in-app invitation card slides in at the top-right.
3. Within a few seconds an email titled
   **"You've been added to Smart Docs Validator"** lands in that Gmail's
   inbox. (Check the **Updates** tab if it isn't in **Primary**.)

### Option B — test from your terminal

From the repo root, with your Resend key set:

```powershell
$env:RESEND_API_KEY = "re_xxx_xxx"
npm run invite:test -- trafalgardreii@gmail.com "Trafalgar Drei"
```

The script POSTs to Resend directly with the same template the deployed
function uses, prints the Resend response id on success, and exits non-zero
on failure (with the full Resend error message in stderr).

---

## Troubleshooting

- **`/api/send-invitation-email` returns 500 with "RESEND_API_KEY missing"** —
  the env var is not on the deployment. Re-check Vercel → Settings → Env
  Vars and redeploy.
- **403 "This email is not on the invited list"** — the email is not in the
  server-side allow-list inside `api/send-invitation-email.ts`. Add it
  there _and_ in `src/data/invitedStudentEmails.ts`, then push.
- **Email never arrives** — Resend's free tier delivers via shared IPs.
  Check the Gmail **Spam** folder, the **Updates** tab, and the Resend
  dashboard → **Logs** for the actual delivery status. `from: onboarding@resend.dev`
  is the default and is allowed without DNS setup.
- **Card shows up but no email** — open browser DevTools → Network tab,
  re-load the dashboard, and look for `POST /api/send-invitation-email`.
  The JSON response will contain the exact failure reason.

---

## Why a serverless function?

The browser cannot call Resend directly because that would expose the API
key to anyone who opens DevTools. The Vercel function keeps the key
server-side, validates the email against the invited allow-list, and only
then forwards the request to Resend. The client only ever sees a
sanitised `{ ok, id?, error? }` response.
