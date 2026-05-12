# Smart Document Evaluator

**Smart Document Evaluator** (branded in the UI as **Smart Docs Validator**) is a web application for **course document workflows**: students sign in with Google, open assignments, upload submissions to **Supabase Storage**, and track grades and AI feedback; teachers use a **grading / review queue**, class roster tools, analytics, and optional **Google Gemini**–assisted rubric inspection with long-form output (executive summary, per-page before/after, document overview, diagram evaluation).

---

## Tech stack

| Layer | Technology |
|--------|------------|
| **Runtime** | [Node.js](https://nodejs.org/) 18+ (LTS recommended) |
| **Framework** | [React 18](https://react.dev/) |
| **Language** | [TypeScript](https://www.typescriptlang.org/) 5.x |
| **Bundler / dev server** | [Vite](https://vitejs.dev/) 5 |
| **Routing** | [React Router](https://reactrouter.com/) 7 |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) 3 + [PostCSS](https://postcss.org/) + [Autoprefixer](https://github.com/postcss/autoprefixer) |
| **Icons** | [Lucide React](https://lucide.dev/) |
| **Auth & backend** | [Supabase](https://supabase.com/) — Auth (Google OAuth, PKCE), Postgres, Row Level Security, Storage |
| **Client SDK** | [`@supabase/supabase-js`](https://github.com/supabase/supabase-js) |
| **Document text** | [`mammoth`](https://github.com/mwilliamson/mammoth.js) (`.docx` → HTML/text for inspection) |
| **AI (optional)** | [Google Gemini](https://ai.google.dev/) via REST (`generativelanguage.googleapis.com`) or your own **`VITE_GEMINI_EVAL_URL`** proxy |
| **Lint / types** | ESLint 9, `typescript-eslint`, `tsc --noEmit` |
| **Deploy** | [Vercel](https://vercel.com/)–oriented (`vercel.json`, SPA rewrites); see [`DEPLOY.md`](DEPLOY.md) |

**Dev-only tooling:** [`sharp`](https://sharp.pixelplumbing.com/) is used only for the `npm run mascot:strip-bg` script (PNG matte removal). It is not loaded in the browser bundle.

---

## Architecture (high level)

```mermaid
flowchart LR
  subgraph client [Browser SPA]
    UI[React pages + Layout]
    Auth[AuthContext + Supabase Auth]
    Store[Supabase client + Storage uploads]
    AI[Gemini eval + AIDocumentEvaluationReport]
  end
  subgraph supa [Supabase]
    PG[(Postgres + RLS)]
    ST[Storage bucket]
    SA[Auth / OAuth]
  end
  subgraph google [Optional]
    GEM[Gemini API or custom eval URL]
    FORM[Google Forms Rate Us]
  end
  UI --> Auth
  UI --> Store
  UI --> AI
  Auth --> SA
  Store --> PG
  Store --> ST
  AI --> GEM
  UI --> FORM
```

- **Single-page app (SPA)** — all routes render inside `Layout` after login; role (`student` | `teacher` | `admin`) gates which routes exist.
- **Environment variables** — any `VITE_*` value is inlined at **build time**; production hosts must set the same keys in their build environment (never rely on a committed `.env` in production).

---

## Features

| Area | Description |
|------|-------------|
| **Authentication** | Supabase Auth with **Google OAuth** (PKCE). Unauthenticated users are sent to `/login` with query string preserved for the OAuth code. |
| **Roles** | `student`, `teacher`, `admin`. Optional `VITE_ADMIN_EMAILS` / `VITE_TEACHER_EMAILS` (comma-separated) elevate by email; profiles live in `public.users`. |
| **Students** | Dashboard, **Submit work** (`/assignments`), **My Submissions**, tasks, boards, calendar, drive, sheets, analytics, team page, settings. |
| **Student UX** | Floating **Rate us** (opens your Google Form URL or in-app fallback), **Eva** onboarding tour (first visit + replay from **Tour**). |
| **Teachers** | Dashboard, **grading** (`/grading` — review queue), student submissions, documents, analytics, class list, instructions/inbox, settings; legacy paths redirect (see `src/App.tsx`). |
| **AI grading (optional)** | **Run AI Evaluator** on submissions: heuristic fallback if Gemini is unavailable; with Gemini — structured JSON including rubric, executive summary, language fixes, verified highlights, **per-page before/after**, **document overview & scoring**, **visual & diagram evaluation**; multimodal attachments (PDF, images, audio, video) via `inlineData` when configured. |
| **Persistence** | AI draft extras can be stored in `ai_draft_summary` (parseable JSON tail) for student-facing reports after publish. |

---

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- A **Supabase** project: Auth (Google provider), Postgres + RLS, Storage bucket for submissions (see `docs/`)
- (Optional) **Google Gemini** API key (dev only in browser) or a **server-side eval proxy**
- (Optional) **Google Form** URL for the student **Rate us** survey

---

## Quick start

1. **Clone and install**

   ```bash
   git clone <your-repo-url>
   cd Smart_Document_Evalutator
   npm install
   ```

2. **Environment**

   ```bash
   cp .env.example .env   # Windows: copy .env.example .env
   ```

   Set at least **`VITE_SUPABASE_URL`** and **`VITE_SUPABASE_ANON_KEY`**. All variables are documented in [`.env.example`](.env.example).

3. **Validate env**

   ```bash
   npm run verify:env
   ```

4. **Run the dev server**

   ```bash
   npm run dev
   ```

   Default: **http://localhost:5173** (see `vite.config.ts`). Add this origin (and `http://localhost:5173/**`) under Supabase **Authentication → URL Configuration** so Google sign-in works locally.

5. **(Optional) Gemini smoke test**

   ```bash
   npm run verify:gemini
   ```

---

## Environment variables (summary)

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Publishable anon key (RLS must protect data) |
| `VITE_ADMIN_EMAILS` | No | Comma-separated emails → `admin` role |
| `VITE_TEACHER_EMAILS` | No | Comma-separated emails → `teacher` role |
| `VITE_STUDENT_EMAIL_DOMAINS` | No | Restrict which domains resolve as students |
| `VITE_SUBMISSION_STORAGE_BUCKET` | No | Storage bucket for uploads (default `student-submissions`) |
| `VITE_STUDENT_RATE_US_URL` | No | Override URL for the student **Rate us** button (defaults to your form if set in code) |
| `VITE_GEMINI_EVAL_URL` | No | **Preferred in production** — POST proxy that returns the same JSON shape as Gemini |
| `VITE_GEMINI_API_KEY` | No | **Dev only** — key is visible in the built JS bundle |
| `VITE_GEMINI_MODEL` | No | Model id (e.g. `gemini-2.5-flash`); see `geminiDocumentEvaluation.ts` for fallbacks |
| `DATABASE_URL` | No | **Local only** — for `npm run db:apply` / `db:fix-rls`; never commit |

---

## NPM scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` / `npm start` | Vite dev server (port **5173**) |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Serve `dist/` locally |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check (`tsconfig.app.json`) |
| `npm run verify:env` | Validate `.env` shape for Supabase |
| `npm run verify:gemini` | Optional Gemini connectivity test |
| `npm run db:apply` | Apply SQL schema (needs `DATABASE_URL`) |
| `npm run db:fix-rls` | Apply users RLS recursion fix SQL |
| `npm run supabase:setup` | Interactive Supabase setup helper |
| `npm run supabase:fix-rls` | Interactive RLS fix helper |
| `npm run mascot:strip-bg` | Regenerate `public/mascot/eva-welcome-nobg.png` from `eva-welcome.png` (uses **sharp**) |

---

## Database & storage

SQL and docs live under [`docs/`](docs/). Useful entry points:

| File | Purpose |
|------|---------|
| [`docs/supabase-setup-all-in-one.sql`](docs/supabase-setup-all-in-one.sql) | Consolidated bootstrap |
| [`docs/supabase-bootstrap-public-users.sql`](docs/supabase-bootstrap-public-users.sql) | `public.users` and related |
| [`docs/supabase-storage-student-submissions.sql`](docs/supabase-storage-student-submissions.sql) | Bucket + policies for student uploads |
| [`docs/supabase-fix-users-rls-recursion.sql`](docs/supabase-fix-users-rls-recursion.sql) | Fix recursive RLS on `users` if sign-in profile loads fail |
| [`docs/SoftwareUsabilitySurvey-StudentRateUs.md`](docs/SoftwareUsabilitySurvey-StudentRateUs.md) | Software usability survey copy + Google Form wiring |
| [`docs/SRS-Smart-Document-Evaluator.md`](docs/SRS-Smart-Document-Evaluator.md) | Product / requirements notes |

**Apply SQL from a trusted machine** (requires `DATABASE_URL` in `.env` — never commit it):

```bash
npm run db:apply
npm run db:fix-rls
```

---

## Google Forms (survey + script)

- **Survey content & wiring:** [`docs/SoftwareUsabilitySurvey-StudentRateUs.md`](docs/SoftwareUsabilitySurvey-StudentRateUs.md)
- **Apps Script to auto-create the form in your Google account:** [`scripts/google-forms/create-rate-us-form.gs`](scripts/google-forms/create-rate-us-form.gs) — paste into [script.google.com](https://script.google.com), run `createSmartDocsValidatorSurvey`, copy the published URL into `VITE_STUDENT_RATE_US_URL` if you do not bake a default into the app.

---

## Deployment

- **Do not commit `.env`.** Hosted builds need the same `VITE_*` variables in the host’s environment; they are baked into the client at build time.
- Step-by-step (Vercel, SPA rewrites, OAuth URLs): **[`DEPLOY.md`](DEPLOY.md)**.
- This repo includes [`vercel.json`](vercel.json) for a Vite SPA.
- [`CNAME`](CNAME) in the repo documents a custom domain target (`www.smartformevaluator.com`); adjust for your own DNS.

---

## Project layout

| Path | Role |
|------|------|
| `src/App.tsx` | Router, auth gate, teacher vs student routes |
| `src/components/Layout.tsx` | Shell: sidebar, mobile header, student-only **Rate us** + **Eva** tour |
| `src/context/AuthContext.tsx` | Session, profile, OAuth, student email policy |
| `src/lib/supabase.ts` | Supabase browser client |
| `src/lib/geminiDocumentEvaluation.ts` | Gemini / proxy evaluation, parsing, persisted AI draft extras |
| `src/lib/geminiAttachments.ts` | Build multimodal `inlineData` parts for Gemini (PDF, images, etc.) |
| `src/lib/teacherSubmissionLoad.ts` | Teacher queue / submission types and helpers |
| `src/components/AIDocumentEvaluationReport.tsx` | Student + teacher UI for AI rubric, overview, diagrams, per-page rewrites |
| `src/pages/teacher/` | Teacher screens (grading, roster, analytics, …) |
| `src/pages/student/` | Student screens |
| `src/components/student/StudentRateUsButton.tsx` | Rate us pill + optional Google Form |
| `src/components/student/StudentOnboardingTour.tsx` | Eva mascot onboarding |
| `public/mascot/` | Mascot PNG assets |
| `scripts/` | Env checks, DB apply, Gemini test, mascot matte removal, Google Forms script |

---

## Security notes

- The **anon key** is safe in the browser only with correct **RLS** on all tables and storage policies. Never expose the **service role** key or `DATABASE_URL` in the client.
- **Gemini:** for any public deployment, use **`VITE_GEMINI_EVAL_URL`** and keep API keys on a server you control. Browser `VITE_GEMINI_API_KEY` is for local development only.
- Student uploads should use a **dedicated bucket** with policies scoped to the authenticated user (see storage SQL in `docs/`).

---

## Ignored local folders

The following are listed in [`.gitignore`](.gitignore) so they are not committed:

- **`node_modules/`**, **`dist/`**, **`.env`**, editor junk
- **`.bolt/`**, **`.claude/`** — IDE / template scaffolding (not part of the app)

---

## License

Private / unlicensed unless you add a `LICENSE` file. Update this section when you publish the project publicly.
