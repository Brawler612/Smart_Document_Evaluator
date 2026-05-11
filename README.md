# Smart Document Evaluator

A web application for **course document workflows**: students sign in, see assignments, upload submissions to Supabase Storage, and track their work; teachers use a **grading / review queue**, class roster tools, analytics, and optional **AI-assisted rubric inspection** (Google Gemini) to refine scores and narrative feedback.

Built with **Vite**, **React 18**, **TypeScript**, **Tailwind CSS**, **React Router 7**, and **Supabase** (Auth, Postgres, Row Level Security, Storage).

---

## Features

| Area | What it does |
|------|----------------|
| **Authentication** | Supabase Auth with Google OAuth (PKCE). Session-aware routing; unauthenticated users go to `/login`. |
| **Roles** | `student`, `teacher`, and `admin`. Optional env lists (`VITE_ADMIN_EMAILS`, `VITE_TEACHER_EMAILS`) can elevate accounts by email; profiles live in `public.users`. |
| **Students** | Assignments, **My Submissions** (uploads tied to the configured storage bucket), settings. |
| **Teachers** | Dashboard, **grading / review queue**, student submissions view, documents, analytics/reports, class list, instructions, settings; several legacy paths redirect to the current routes (see `App.tsx`). |
| **AI inspection (optional)** | “Run AI Inspection” uses a heuristic rubric draft, then optionally **Gemini** to adjust scores, per-criterion comments, and an executive summary. Prefer a backend proxy (`VITE_GEMINI_EVAL_URL`); browser-only `VITE_GEMINI_API_KEY` is for development only. |

---

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- A **Supabase** project with Auth (Google provider) and the schema/storage described in `docs/`
- (Optional) **Google Gemini** API access or your own evaluation HTTP endpoint

---

## Quick start

1. **Clone and install**

   ```bash
   git clone <your-repo-url>
   cd Smart_Document_Evalutator
   npm install
   ```

2. **Environment**

   Copy `.env.example` to `.env` and set at least:

   - `VITE_SUPABASE_URL` — `https://<project-ref>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` — anon / publishable key from Supabase → Project Settings → API

   Optional variables (admin/teacher email lists, student email domain allowlist, submission bucket name, Gemini) are documented inline in [`.env.example`](.env.example).

3. **Validate local env**

   ```bash
   npm run verify:env
   ```

4. **Run the dev server**

   ```bash
   npm run dev
   ```

   Open the URL Vite prints (typically `http://localhost:5173`). Add the same origin to Supabase **Authentication → URL Configuration** (redirect URLs) if Google sign-in should work locally.

---

## Database and storage

SQL migrations and one-shot setup scripts live under [`docs/`](docs/). Highlights:

- [`docs/supabase-setup-all-in-one.sql`](docs/supabase-setup-all-in-one.sql) — consolidated bootstrap (use when you want a single file to apply).
- [`docs/supabase-bootstrap-public-users.sql`](docs/supabase-bootstrap-public-users.sql) — `public.users` and related pieces.
- [`docs/supabase-storage-student-submissions.sql`](docs/supabase-storage-student-submissions.sql) — bucket/policy for student uploads (align with `VITE_SUBMISSION_STORAGE_BUCKET`, default `student-submissions`).
- [`docs/supabase-fix-users-rls-recursion.sql`](docs/supabase-fix-users-rls-recursion.sql) — fix for recursive RLS on `users` if profile loads fail at sign-in.

**Applying SQL from your machine** (optional; requires `DATABASE_URL`, never commit it):

```bash
npm run db:apply          # default schema path used by the script
npm run db:fix-rls        # users RLS fix only
```

Interactive helpers: `npm run supabase:setup`, `npm run supabase:fix-rls`.

---

## NPM scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` / `npm start` | Vite dev server |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript `--noEmit` |
| `npm run verify:env` | Sanity-check `.env` (Supabase URL/key shape) |

---

## Deployment

**Do not commit `.env`.** Hosted builds need the same `VITE_*` variables set in the host’s environment UI; they are inlined at build time.

Step-by-step hosting (including Vercel, SPA rewrites, and OAuth redirect URLs) is in **[`DEPLOY.md`](DEPLOY.md)**. This repo includes [`vercel.json`](vercel.json) tuned for a Vite SPA on Vercel.

---

## Project layout (short)

| Path | Role |
|------|------|
| `src/App.tsx` | Router, auth gate, teacher vs student routes |
| `src/context/AuthContext.tsx` | Session, profile, OAuth, student email policy |
| `src/lib/supabase.ts` | Supabase client |
| `src/lib/geminiDocumentEvaluation.ts` | Optional Gemini / proxy evaluation |
| `src/components/AIDocumentEvaluationReport.tsx` | UI for AI-assisted rubric output |
| `src/pages/teacher/` · `src/pages/student/` | Role-specific screens |

---

## Security notes

- The **anon key** is safe for the browser only with correct **RLS** policies; treat service-role keys and `DATABASE_URL` as secrets.
- **Gemini**: use `VITE_GEMINI_EVAL_URL` and keep API keys on a server you control for any public deployment.

---

## License

Private / unlicensed unless you add a `LICENSE` file. Adjust this section when you publish the project.
