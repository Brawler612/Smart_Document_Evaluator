# Fix Google “Error 400: invalid_request” (Supabase sign-in)

This error is almost always **Google Cloud OAuth client settings**, not app code.

## 1. Use the correct Google Cloud project

Your Web client ID should be:

`161527856816-gkt48694m8honhi0ov1vttpfp5hj3gei.apps.googleusercontent.com`

1. [Supabase](https://supabase.com/dashboard/project/nmuvwvccvjlmuwzrfrtx) → **Authentication** → **Providers** → **Google** → paste that **Client ID** and the matching **Client secret** from Google Cloud.
2. In [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials**, open that OAuth 2.0 **Web client** (names must match exactly).
3. `.env` → `VITE_GOOGLE_OAUTH_CLIENT_ID` should use the same value (for Google Sheets sync on Grades).

## 2. Authorized redirect URIs (required)

On that Web client, under **Authorized redirect URIs**, add **exactly**:

```
https://nmuvwvccvjlmuwzrfrtx.supabase.co/auth/v1/callback
```

Do **not** put `http://localhost:5173/login` here — Google redirects to **Supabase first**, then Supabase sends the browser back to your app.

Click **Save**.

## 3. Authorized JavaScript origins

On the same client, under **Authorized JavaScript origins**, add:

```
http://localhost:5173
http://localhost:5174
http://localhost:5175
```

(Add your production URL too when you deploy.)

## 4. Supabase URL configuration

Supabase → **Authentication** → **URL Configuration**:

| Field | Value |
|--------|--------|
| **Site URL** | `http://localhost:5173` |
| **Redirect URLs** | `http://localhost:5173/login` |

Add extra ports if you use them: `http://localhost:5174/login`, `http://localhost:5175/login`.

## 5. Test users (while app is in Testing)

Google Auth Platform → **Audience** → **Test users** → add every Gmail that signs in, e.g. `trafalgardreii@gmail.com`.

## 6. Local dev: one port only

Run a single dev server and open:

```
http://localhost:5173/login
```

If Vite says port 5173 is in use, stop other terminals running `npm run dev`, then start again.

## 7. Try sign-in again

Use **Continue with Google** on `/login`. If it still fails, open **error details** on Google’s page and check for `redirect_uri_mismatch` — that means step 2 is still wrong or unsaved.
