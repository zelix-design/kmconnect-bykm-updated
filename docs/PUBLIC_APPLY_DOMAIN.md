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

### 2. Vercel — set the env var(s)
Still on Vercel → **Settings → Environment Variables**, add to *all*
environments (Production, Preview, Development):

| Name | Value | What it does |
| --- | --- | --- |
| `REACT_APP_PUBLIC_APPLY_HOSTS` | `apply.kmfoundation.online` | Comma-separate to add more, e.g. `apply.kmfoundation.online,admissions.example.com`. Lower-case. No protocol, no path. **Tells the React app: when served from this hostname, render ONLY the apply form (skip auth + admin pages).** |
| `REACT_APP_APPLY_PUBLIC_URL` | `https://apply.kmfoundation.online` | Optional but recommended. The full canonical URL the admin app should use whenever it builds an apply link (Copy Referral, FAB redirect for Sub-agent role, Quick Entry redirect, etc.). When this is unset, the admin app falls back to its own origin's `/apply` path — useful for local dev. |

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

Remove `REACT_APP_PUBLIC_APPLY_HOSTS` and/or `REACT_APP_APPLY_PUBLIC_URL`
from Vercel env (or remove the hostname from the comma list) and redeploy
— the new domain will start serving the full admin app again, and the
admin app's internal links will fall back to same-origin `/apply`.

## What changed in the codebase

The shared helper lives at `/app/frontend/src/lib/applyUrl.js`. All
in-app references to `/apply` go through it:

| File | What it does |
| --- | --- |
| `App.js` | Mounts `PublicApplyOnly` shell when `window.location.hostname` matches `REACT_APP_PUBLIC_APPLY_HOSTS`. |
| `pages/ClientDetail.jsx` | "Copy referral link" button uses `buildApplyUrl(ref)`. |
| `pages/Dashboard.jsx` | Linked-user dashboard "Copy referral" uses `buildApplyUrl(client_id)`. |
| `pages/QuickEntry.jsx` | Linked-user redirect uses `navigateToApply(nav, client_id, {replace:true})`. |
| `pages/Students.jsx` | "Enrol" + `?new=1` redirects use `navigateToApply(...)`. |
| `components/BottomNav.jsx` | Center "+" FAB for linked user uses `navigateToApply(...)`. |

`navigateToApply` decides automatically between an in-app `nav(path)` (same
origin) and a full `window.location.assign` (cross origin) so transitions
to the public domain do a real page load — required because the admin
session isn't valid on the public host.
