# Make smartformevaluator.com findable on Google

Google cannot index your site until the domain serves your **Vercel** app (not GoDaddy parking).

## Step 1 — Point DNS to Vercel (required)

1. **Vercel** → your project → **Settings** → **Domains** → add:
   - `smartformevaluator.com`
   - `www.smartformevaluator.com`
2. Copy the two nameservers Vercel shows (usually `ns1.vercel-dns.com` and `ns2.vercel-dns.com`).
3. **GoDaddy** → **smartformevaluator.com** → **DNS** → **Nameservers** → **Change** → **I'll use my own nameservers** → paste Vercel’s two nameservers → **Save**.
4. Wait 15–60 minutes (up to 24h). Verify:

   ```powershell
   nslookup -type=NS smartformevaluator.com
   ```

   You should see `vercel-dns.com`, **not** `domaincontrol.com`.

5. Open **https://www.smartformevaluator.com** — it should load your login page with a valid padlock (no SSL error).

See also: [`FIX-CUSTOM-DOMAIN-SSL.md`](FIX-CUSTOM-DOMAIN-SSL.md).

Until DNS works, use **https://smart-document-evalutator.vercel.app** (you can still add this URL in Search Console).

---

## Step 2 — Redeploy (SEO files)

This repo includes:

- `public/robots.txt` — allows crawlers, links to sitemap
- `public/sitemap.xml` — home + login URLs
- `index.html` — title, description, canonical URL, Open Graph tags

Push to GitHub so Vercel redeploys, or click **Redeploy** in Vercel.

After deploy, check:

- https://www.smartformevaluator.com/robots.txt
- https://www.smartformevaluator.com/sitemap.xml

---

## Step 3 — Google Search Console

1. Go to [Google Search Console](https://search.google.com/search-console).
2. **Add property** → **URL prefix** → `https://www.smartformevaluator.com`
3. Verify ownership (easiest: **HTML tag** — add the meta tag Vercel/Google gives you into `index.html` `<head>`, redeploy, then click Verify).
4. **Sitemaps** → submit: `https://www.smartformevaluator.com/sitemap.xml`
5. **URL inspection** → enter `https://www.smartformevaluator.com/login` → **Request indexing**.

Indexing is not instant; new sites often take **a few days to a few weeks**. Only the **login** page is public; teacher/student dashboards require sign-in and will not appear in search results (that is normal).

---

## Step 4 — Supabase OAuth (after DNS works)

**Supabase** → **Authentication** → **URL Configuration**:

- **Site URL:** `https://www.smartformevaluator.com`
- **Redirect URLs:** include  
  `https://www.smartformevaluator.com/**`  
  `https://smartformevaluator.com/**`

**Vercel** env (Production):

- `SMARTDOCS_APP_URL` = `https://www.smartformevaluator.com`

---

## Troubleshooting

| Symptom | Cause | Fix |
|--------|--------|-----|
| SSL error / blank GoDaddy page | Nameservers still on GoDaddy | Step 1 |
| Site works but not on Google | DNS fixed recently; no Search Console | Steps 2–3 |
| Only Vercel URL in results | Custom domain not live | Step 1 |
| `robots.txt` 404 | Old deploy | Redeploy from latest `main` |
