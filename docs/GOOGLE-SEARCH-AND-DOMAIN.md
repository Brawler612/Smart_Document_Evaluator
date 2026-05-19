# Make smartformevaluator.com findable on Google

Google cannot index your site until the domain serves your **Vercel** app (not GoDaddy parking).

## Step 1 — Point DNS to Vercel (required)

At **GoDaddy → DNS Records** (while nameservers stay on GoDaddy):

| Type | Name | Value |
|------|------|--------|
| A | `@` | `76.76.21.21` |
| CNAME | `www` | `cname.vercel-dns.com` |

Remove old **A** records for `@` pointing to GoDaddy parking IPs and any **domain forwarding**.

Then **Vercel → Domains → Refresh** until both hostnames show **Valid Configuration**.

Full steps: [`FIX-CUSTOM-DOMAIN-SSL.md`](FIX-CUSTOM-DOMAIN-SSL.md).

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
