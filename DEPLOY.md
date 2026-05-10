# Deploy so other people can use this app

“Public” means **hosted on the internet** (e.g. Vercel, Netlify). Visitors **do not** create a `.env` file; they open your URL.

**Do not commit `.env` to Git.** It is listed in `.gitignore`. Putting real keys in a public repo lets anyone abuse your Supabase project.

## 1. Put the same values in your host’s environment (not in Git)

Use the same variables as your local `.env`, but set them in the hosting dashboard:

| Variable | Notes |
|----------|--------|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Publishable / anon key (same page) |
| `VITE_ADMIN_EMAILS` | Optional, comma-separated |
| `VITE_TEACHER_EMAILS` | Optional |
| `VITE_SUBMISSION_STORAGE_BUCKET` | Optional; default `student-submissions` |

Redeploy after changing env vars (`VITE_*` are baked in at **build** time).

## 2. Vercel — step-by-step

### Before you start

- Code lives in a **GitHub** (or GitLab / Bitbucket) repository.
- `.env` is **not** pushed to Git (confirm `.gitignore` contains `.env`).
- Have your Supabase **Project URL** and **anon / publishable key** handy (same values as local `.env`).

### A. Push your project to GitHub

1. Create a new repo on GitHub (empty or with a README).
2. On your PC, in the project folder:

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

   If `git add .` tries to add `.env`, stop and fix `.gitignore` before committing.

### Vercel shows `404 NOT_FOUND` on `/login` or `/assignments`

That means the CDN did not find `index.html` for that path — almost always **wrong Output Directory** or the SPA rewrite not applied.

1. **Vercel → Project → Settings → General → Build & Development**
   - **Framework Preset:** Vite (or “Other” with build `npm run build`, output **`dist`**).
   - **Root Directory:** `.` (repo root with `package.json`).
   - **Build Command:** `npm run build`
   - **Output Directory:** **`dist`** (required for Vite — not `public`, not `.`).
2. Save, then **Deployments → Redeploy** the latest commit.

The repo’s `vercel.json` sets `outputDirectory` and SPA rewrites so every route serves `dist/index.html`.

### B. Create a Vercel account and import the repo

1. Open [vercel.com](https://vercel.com) and sign in (GitHub login is easiest).
2. **Add New… → Project**.
3. **Import** your GitHub repository (authorize Vercel if asked).
4. Vercel usually detects **Vite**. Confirm:

   - **Framework Preset**: Vite (or “Other” with the settings below)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install` (default)

5. **Do not click Deploy yet** — add env vars first (next section).

### C. Environment variables (critical)

1. In the import screen, expand **Environment Variables**.
2. Add each row (same names and values as your local `.env`):

   | Name | Value |
   |------|--------|
   | `VITE_SUPABASE_URL` | `https://xxxxx.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | your publishable key |
   | `VITE_ADMIN_EMAILS` | optional, comma-separated |
   | `VITE_TEACHER_EMAILS` | optional |
   | `VITE_SUBMISSION_STORAGE_BUCKET` | optional, e.g. `student-submissions` |

3. Leave **Environment** as Production (and add the same keys for **Preview** if you want preview deployments to work).
4. Click **Deploy**.

First deploy takes a minute or two. When it finishes, Vercel gives you a URL like `https://something.vercel.app`. Open it — the app should load.

### D. After deploy — Supabase URLs

Google OAuth will fail until Supabase knows your live URL.

1. Supabase → **Authentication** → **URL Configuration**.
2. **Site URL**: `https://your-project.vercel.app` (your real Vercel URL).
3. **Redirect URLs**: add:

   - `https://your-project.vercel.app/**`
   - `http://localhost:5173/**` (keep local dev)

Save.

### E. Google Cloud (only if you use “Sign in with Google”)

1. [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials** → your OAuth 2.0 Client.
2. **Authorized JavaScript origins**: add `https://your-project.vercel.app`.
3. **Authorized redirect URIs**: keep **Supabase’s** callback only:

   `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`

   Do **not** replace this with your Vercel URL.

### F. Changing env vars later

Vercel → your project → **Settings** → **Environment Variables**. Edit or add variables, then **Deployments** → … on latest → **Redeploy** (env changes require a new build for `VITE_*`).

### G. SPA routing

This repo includes `vercel.json` so routes like `/assignments` load your React app instead of 404.

---

### Short version

1. Push repo to GitHub (no `.env` in Git).
2. Vercel → New Project → Import → Build: `npm run build`, Output: `dist`.
3. Add all `VITE_*` variables → Deploy.
4. Supabase Auth URLs + Google OAuth origins as above.
5. Share your `https://….vercel.app` link.

## 3. Netlify (example)

1. New site from Git → build `npm run build`, publish directory `dist`.
2. Site settings → Environment variables → add the same `VITE_*` keys.
3. `public/_redirects` is copied into `dist` for SPA fallback.

## 4. Supabase (required for Google login on your live URL)

In **Supabase → Authentication → URL Configuration**:

- **Site URL**: your production site, e.g. `https://your-app.vercel.app`
- **Redirect URLs**: include  
  `https://your-app.vercel.app/**`  
  and keep local dev, e.g. `http://localhost:5173/**`

## 5. Google OAuth (if you use Google sign-in)

In **Google Cloud Console → OAuth client**:

- **Authorized JavaScript origins**: add `https://your-app.vercel.app`
- **Authorized redirect URIs**: keep Supabase’s callback,  
  `https://<your-project-ref>.supabase.co/auth/v1/callback`  
  (not your Vercel URL)

After deployment, share **only the website URL** with students and teachers—not your `.env` file.

---

## Import done — do these three things or login will not work

1. **Vercel → your project → Settings → Environment Variables**  
   Add **`VITE_SUPABASE_URL`** and **`VITE_SUPABASE_ANON_KEY`** (exact same strings as your local `.env`). Enable for **Production** (and Preview if you use it).

2. **Deployments →** open the latest deployment → **⋯ → Redeploy**  
   (Required so the new variables are baked into the JS bundle.)

3. **Supabase → Authentication → URL Configuration**  
   Set **Site URL** to `https://YOUR-PROJECT.vercel.app` and add **both** of these under Redirect URLs (Google OAuth returns with `?code=` on `/login`):  
   `https://YOUR-PROJECT.vercel.app/**`  
   `https://YOUR-PROJECT.vercel.app/login`  
   Also keep `http://localhost:5173/**` for local dev.

If you open the live site and see an amber box about “Vercel needs Supabase keys,” step 1–2 was skipped or Redeploy was missed.
