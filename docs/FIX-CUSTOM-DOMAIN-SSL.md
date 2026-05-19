# Fix `ERR_SSL_UNRECOGNIZED_NAME_ALERT` on smartformevaluator.com

> **Google can’t find your site** until this DNS fix is done. After the domain works, follow [`GOOGLE-SEARCH-AND-DOMAIN.md`](GOOGLE-SEARCH-AND-DOMAIN.md) for Search Console and sitemap.

## What’s wrong

`https://www.smartformevaluator.com` does **not** reach your Vercel app today.

Public DNS still uses **GoDaddy** nameservers:

- `ns77.domaincontrol.com`
- `ns78.domaincontrol.com`

Those hosts serve a parking page (`/lander`), which triggers Chrome’s **`ERR_SSL_UNRECOGNIZED_NAME_ALERT`**.

Your **working** deployment is:

**https://smart-document-evalutator.vercel.app**

(Vercel `Server` header confirmed; app loads.)

---

## Fix (one-time at GoDaddy)

1. Open **Vercel** → your project → **Settings** → **Domains**.
2. Confirm both are listed:
   - `smartformevaluator.com`
   - `www.smartformevaluator.com`
3. Vercel shows two nameservers (usually):
   - `ns1.vercel-dns.com`
   - `ns2.vercel-dns.com`
4. In **GoDaddy** → **My Products** → **smartformevaluator.com** → **DNS** → **Nameservers** → **Change**.
5. Choose **“I’ll use my own nameservers”** and paste **only** the two Vercel nameservers → **Save**.
6. Wait **15–60 minutes** (sometimes up to 24h).
7. Verify:

   ```bash
   nslookup -type=NS smartformevaluator.com
   ```

   You should see `ns1.vercel-dns.com` / `ns2.vercel-dns.com`, **not** `domaincontrol.com`.

8. Open **https://www.smartformevaluator.com** again — SSL should be issued automatically by Vercel (green check on Domains).

---

## Until DNS propagates

Use the Vercel URL for demos and OAuth testing:

**https://smart-document-evalutator.vercel.app**

In **Supabase → Authentication → URL Configuration**, keep:

- **Site URL:** `https://smart-document-evalutator.vercel.app` (or your custom domain after DNS works)
- **Redirect URLs:** include both the Vercel URL and the custom domain `/**` entries

---

## Do not

- Point the domain only with an **A record** at GoDaddy while nameservers stay on GoDaddy — that keeps the parking/SSL mismatch.
- Mix GoDaddy website builder / forwarding with Vercel for the same hostname.
