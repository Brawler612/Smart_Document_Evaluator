# Fix Vercel “Invalid Configuration” on smartformevaluator.com

Your Vercel dashboard shows **Invalid Configuration** because **GoDaddy DNS still points to parking**, not Vercel.

Current public DNS (wrong):

| Host | Points to |
|------|-----------|
| `smartformevaluator.com` | `15.197.148.33`, `3.33.130.190` (GoDaddy parking) |
| `www` | Same as apex (alias) |

Vercel needs:

| Type | Name | Value |
|------|------|--------|
| **A** | `@` | `76.76.21.21` |
| **CNAME** | `www` | `cname.vercel-dns.com` |

(Copy exact values from **Vercel → Domains → smartformevaluator.com → DNS Records** if they differ.)

---

## Fix at GoDaddy (keep GoDaddy nameservers)

1. Sign in to **GoDaddy** → **My Products** → **smartformevaluator.com** → **DNS** → **DNS Records** (not Website Builder, not Forwarding).

2. **Delete or edit** records that conflict:
   - Any **A** record for **@** pointing to `15.197.148.33`, `3.33.130.190`, or other non-Vercel IPs.
   - **Forwarding** for this domain (Domain → Forwarding → remove).
   - **CNAME** `www` → `@` or to GoDaddy parking — delete it.

3. **Add** (or update) these records:

   | Type | Name | Data / Value | TTL |
   |------|------|----------------|-----|
   | A | `@` | `76.76.21.21` | 600 seconds (or 1 hour) |
   | CNAME | `www` | `cname.vercel-dns.com` | 600 seconds |

4. **Save**. Wait **15–60 minutes** (up to 24h).

5. In **Vercel → Domains**, click **Refresh** next to each domain until both show **Valid Configuration**.

6. Test:

   ```powershell
   nslookup smartformevaluator.com
   nslookup www.smartformevaluator.com
   ```

   Apex should show `76.76.21.21`. `www` should show Vercel (often resolves via `cname.vercel-dns.com`).

7. Open **https://www.smartformevaluator.com** — login page with a valid padlock.

---

## Alternative: use Vercel nameservers (optional)

If you prefer Vercel to manage all DNS:

1. **Vercel → Domains** → copy nameservers (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`).
2. **GoDaddy → Nameservers** → **I'll use my own nameservers** → paste Vercel’s two → Save.
3. Remove manual A/CNAME at GoDaddy (Vercel adds them automatically).

---

## After the domain works

- **Supabase → Authentication → URL Configuration**
  - Site URL: `https://www.smartformevaluator.com`
  - Redirect URLs: `https://www.smartformevaluator.com/**`, `https://smartformevaluator.com/**`
- **Vercel env (Production):** `SMARTDOCS_APP_URL=https://www.smartformevaluator.com`
- Google Search: [`GOOGLE-SEARCH-AND-DOMAIN.md`](GOOGLE-SEARCH-AND-DOMAIN.md)

---

## Stuck on `/lander` or blank dark page?

That URL is **GoDaddy parking**, not this app. Your browser may have **cached** that redirect.

1. **GoDaddy → Domain → Forwarding** → must be **Off** / deleted.
2. **Chrome:** Settings → Privacy → Clear browsing data → Cached images and files (or try **Incognito**).
3. Open **`https://www.smartformevaluator.com/login`** (not `/lander`).
4. **PowerShell (Admin):** `ipconfig /flushdns`
5. Set PC DNS to **8.8.8.8** (Google) in Windows network adapter settings.
6. Until cache clears, share **`https://smartformevaluator.vercel.app`**.

After the next Vercel deploy, `/lander` redirects to `/login` at the edge.

## Do not

- Leave **both** GoDaddy Website Builder / Forwarding **and** Vercel A records active.
- Add the Vercel A record but keep old A records for `@` (only one apex A should remain: `76.76.21.21`).

---

## Working URL until DNS propagates

**https://smartformevaluator.vercel.app** (or your project’s `*.vercel.app` URL from the Vercel dashboard)
