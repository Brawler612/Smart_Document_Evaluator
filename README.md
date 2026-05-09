# Smart_Document_Evalutator

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-bxqgjzrh)

## Run locally

```bash
npm install
npm start
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Google Sign-In (end-to-end)

Google OAuth **does not work** until three layers are correct: your app `.env`, Google Cloud, and Supabase. Use this order:

### 1. App environment (required first)

1. Copy `.env.example` to `.env` in the project root (next to `package.json`).
2. In [Supabase](https://supabase.com/dashboard) → **Project Settings** → **API**, copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`
3. Save `.env` and **restart** the dev server (`Ctrl+C`, then `npm start`). Vite only reads env on startup.

Check your file:

```bash
npm run verify:env
```

### 2. Google Cloud (OAuth client)

1. [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **OAuth consent screen** (configure if needed).
2. **Credentials** → **Create credentials** → **OAuth client ID** → **Web application**.
3. Under **Authorized redirect URIs**, add **exactly** the Supabase callback (not localhost here):

   `https://<YOUR_PROJECT_REF>.supabase.co/auth/v1/callback`

   The value is shown in Supabase → **Authentication** → **Providers** → **Google** (or in docs under Redirect URL).

4. Copy **Client ID** and **Client secret** into Supabase (next step).

### 3. Supabase (provider + redirect URLs)

1. **Authentication** → **Providers** → **Google** → enable, paste Client ID and Client secret from Google.
2. **Authentication** → **URL Configuration**:
   - **Site URL**: `http://localhost:5173` for local dev.
   - **Redirect URLs**: add your app return URLs, including:
     - `http://localhost:5173/login`
     - Production: `https://your-domain.example/login`

The app sends users back to `/login` after Google; that path must appear in **Redirect URLs**.

### 4. Database (if sign-in works but profile fails)

If you see “Could not load your account profile”, the `public.users` insert is likely blocked by RLS. Run the example policies in **`docs/supabase-rls-users.sql`** (adjust table/columns to match your schema).

---

## Risks and how this project mitigates them

| Risk | Mitigation |
|------|------------|
| Fake Supabase host / DNS error | App requires real `VITE_*` values for Google; placeholders never start OAuth. Run `npm run verify:env`. |
| Token or session leaked via bad redirect | OAuth `redirectTo` is built same-origin only (`src/lib/oauthRedirect.ts`). |
| Implicit OAuth flow weaknesses | Client uses **PKCE** and **detectSessionInUrl** (`src/lib/supabase.ts`). |
| Anyone with link signs in | UI restricts to `@cit.edu.ph` in `AuthContext`; tighten further with Supabase Auth Hooks or DB policies if needed. |
| Anon key in frontend | Expected for SPAs; protect data with **RLS**, not by hiding the anon key. |

---

## Scripts

| Command | Purpose |
|--------|---------|
| `npm start` | Dev server |
| `npm run verify:env` | Validate `.env` before debugging Google |
