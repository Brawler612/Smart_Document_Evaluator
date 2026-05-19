# Google Sheets grade sync setup

**Sync to Google Sheets** on **Grades** works two ways:

1. **Browser (recommended for class projects)** — uses **your** Google login; no service account.
2. **Server (Vercel)** — uses a service account JSON (optional).

---

## Quick setup (browser — ~5 minutes)

### 1. Create or open a Google Sheet

Copy the ID from the URL:

`https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`

### 2. Add to `.env` (project root)

```env
VITE_GOOGLE_SHEET_ID=THIS_PART
VITE_GOOGLE_OAUTH_CLIENT_ID=xxxx.apps.googleusercontent.com
VITE_GOOGLE_SHEETS_URL=https://docs.google.com/spreadsheets/d/THIS_PART/edit
```

**Client ID:** Supabase Dashboard → **Authentication** → **Providers** → **Google** → use the same **Client ID** as in Google Cloud (Web application).

### 3. Google Cloud

1. Same project as your OAuth client → **APIs & Services** → enable **Google Sheets API**.
2. OAuth consent screen → add scope `.../auth/spreadsheets` if asked.

### 4. Restart dev server

```bash
npm run dev
```

### 5. First sync (one-time Google permission)

1. Sign in as **teacher/admin** with Google (so Sheets scope is granted).
2. Open **Grades** → click **Sync to Google Sheets** once.
3. Approve Google access if prompted.

### 6. Automatic sync (default)

After setup, grades **push to your sheet automatically** when you:

- **Publish** a grade from the grading modal
- Open or refresh the **Grades** queue (debounced ~3s)
- Delete submissions or request resubmission (queue updates)

You will see a green **Auto-synced N row(s)** banner on success. The manual **Sync to Google Sheets** button still works anytime.

To turn off auto-sync: `VITE_GOOGLE_SHEETS_AUTO_SYNC=false` in `.env` / Vercel, then redeploy.

The spreadsheet must be owned by or **shared with Editor** access to the Google account you use to sync.

---

## Optional: server sync (Vercel)

Set on Vercel (not `VITE_`):

| Variable |
|----------|
| `GOOGLE_SHEET_ID` |
| `GOOGLE_SERVICE_ACCOUNT_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` |
| `VITE_SUPABASE_URL` |

Share the sheet with the service account `client_email` as **Editor**.

---

## Sign-in scopes

New Google sign-ins request Sheets access. If sync says permission denied, **sign out and sign in again** with Google so the new scopes apply.

---

## “Access blocked” / Error 403 when signing in (including trafalgardreii@gmail.com)

**This is not fixed in app code.** Google blocks anyone who is not on the OAuth **Test users** list.

1. [Google Cloud Console](https://console.cloud.google.com/) → same project as Supabase → Google → **Client ID**
2. **Google Auth Platform** → **Audience** → **Test users** → **Add users**
3. Add at least:
   - `trafalgardreii@gmail.com`
   - `dinaponash26@gmail.com`
   - Every student Gmail (copy from `docs/google-oauth-test-users.txt`)
4. **Save**, wait ~1 minute, then sign in again.

Sign-in now uses only `openid email profile` (no Sheets scope at login). Students are less likely to hit verification blocks. Instructor grade export still requests Sheets on the **Grades** page when syncing.

---

## “Access blocked: SmartForm has not completed the Google verification process” (Error 403)

Your Google Cloud app is in **Testing** mode. Only emails listed as **Test users** can sign in or grant Sheets access.

### Fix (about 2 minutes)

1. Open [Google Cloud Console](https://console.cloud.google.com/) → select the **same project** as your Supabase Google OAuth client.
2. **APIs & Services** → **OAuth consent screen**.
3. Under **Test users** → **Add users**.
4. Add every Gmail that will sync grades, for example:
   - `dinaponash26@gmail.com`
   - Any other teacher/admin accounts
5. **Save**.
6. In your app: **sign out** → **Sign in with Google** again → **Grades** → **Sync to Google Sheets**.

Also confirm **Google Sheets API** is enabled (**APIs & Services** → **Library** → search “Google Sheets API” → Enable).

### If you need many users later

Either keep adding test users, or complete [Google verification](https://support.google.com/cloud/answer/9110914) for production (not required for a small class if test users are enough).

### Alternative: no Google sign-in for sync (service account)

Use server sync on Vercel (see **Optional: server sync** above). Share the sheet with the service account email as **Editor**. Sync runs from `/api/sync-grades` without opening the OAuth consent screen.
