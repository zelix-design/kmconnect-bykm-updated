# Host `/apply` on a separate domain

The app now supports serving **only the public admission form** on dedicated
domain(s) — e.g. `apply.kmfoundation.online`, `admissions.example.com`. When
the browser hits a configured hostname, the React shell skips auth + the main
router and renders `<PublicApplication />` directly for every path.

## One-time setup (no code changes needed)

### 1. Vercel — add the new domain
On the Vercel project dashboard for the frontend → **Settings → Domains** →
add the new domain (e.g. `apply.kmfoundation.online`). Point its DNS at
Vercel as instructed (typically a CNAME to `cname.vercel-dns.com`).

> No new project is required — the same build is reused.

### 2. Vercel — set the env var
Still on Vercel → **Settings → Environment Variables**, add to *all*
environments (Production, Preview, Development):

| Name | Value | Notes |
| --- | --- | --- |
| `REACT_APP_PUBLIC_APPLY_HOSTS` | `apply.kmfoundation.online` | Comma-separate to add more, e.g. `apply.kmfoundation.online,admissions.example.com`. Lower-case. No protocol, no path. |

Trigger a redeploy (any push to the deployed branch, or click *Redeploy*
on the latest deployment).

### 3. Backend — no change required
CORS is already wide-open (`allow_origin_regex=".*"`), so requests from the
new domain are accepted by `REACT_APP_BACKEND_URL`. The form posts to the
same backend you already use.

## What users see on the new domain

* `https://apply.kmfoundation.online/` → admission form
* `https://apply.kmfoundation.online/<anything>` → admission form (404 routes are absorbed)
* `https://apply.kmfoundation.online/?ref=<client_id>` → admission form pre-tagged with the referring sub-agent (existing behavior)

The login, dashboard, and admin pages are **not reachable** on that
hostname — anyone who tries gets the form instead. The full admin app
remains available only on your original domain.

## How to verify it works

```
curl -s https://<new-domain>/ | grep "Student Application"
# → should match
curl -s https://<original-domain>/login | grep "Sign in"
# → should still match (admin app unaffected)
```

## Rollback

Remove `REACT_APP_PUBLIC_APPLY_HOSTS` from Vercel env (or remove the
hostname from the comma list) and redeploy — the new domain will start
serving the full admin app again, unchanged from before.
