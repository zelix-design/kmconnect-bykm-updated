# Deploying FinFlow to a Webuzo VPS

A repeatable setup to run the existing FinFlow app (React frontend, FastAPI backend, MongoDB) on a single VPS managed by the Webuzo control panel, served over one domain with HTTPS.
The work produces a written step-by-step guide plus ready-to-use configuration files added to the project; the actual install runs on the user's own server.

## Who it's for
The FinFlow owner/admin who wants to self-host on their own VPS instead of the managed preview — keeping full control of the data and the server.

## Core features and experience
- MongoDB running on the same VPS via Webuzo's built-in MongoDB, with a dedicated database and user, authentication on, and the database reachable only from the server itself.
- The FastAPI backend running as an always-on service that restarts automatically after a crash or a server reboot.
- The React frontend built into static files and served by the web server.
- A reverse proxy that serves the frontend, forwards `/api` requests to the backend, and handles HTTPS.
- One domain, with the API living under `/api` on that same domain.
- A free Let's Encrypt HTTPS certificate.
- Production environment templates (with no real secrets committed) and a single build command to produce the frontend and prepare the backend.

## User flow (operator steps, high level)
1. Point the domain at the VPS, install Webuzo, then install MongoDB, Node, and Python from Webuzo.
2. Create the MongoDB database and user; fill in the backend settings (database connection, database name, and any integration keys).
3. Build the frontend against the production domain and place the static files in the web root.
4. Start the backend service and enable the reverse proxy; issue the HTTPS certificate.
5. Open the domain, create the first admin account, and verify the main flows (login, dashboard, students, leads, transactions).

## UI/UX feel
No change to how the app looks or behaves — this is an operations/hosting setup. The deliverables (guide and config files) are plain, copy‑paste friendly, and ordered so each step can be checked off.

## Implementation phases

### Phase 1 — MVP (built now)
Deliverables added to the project:
- A step-by-step Webuzo deployment guide (install, MongoDB, env, build, service, reverse proxy, SSL, firewall, first-admin, verification, and update/redeploy steps).
- A reverse-proxy configuration for serving the frontend and forwarding `/api` to the backend.
- An always-on backend service definition (auto-start, auto-restart).
- Production environment templates for the frontend and backend (placeholders only — no secrets).
- A one-command build script for the frontend/backend.
- Notes for running MongoDB on the VPS, enabling HTTPS, basic firewall rules, and creating the first admin.

Note: installation and commands run on the user's VPS; this agent cannot access that server, so the user follows the guide. Deployment to the existing managed Emergent environment is a separate option and is not part of this plan.

### Phase 2 — Later
Hardening and convenience: scheduled MongoDB backups with a restore procedure, log rotation, a scheduled-tasks runner for any recurring jobs, a smoother redeploy script, and basic uptime/health monitoring.

### Phase 3 — Later
Optional container packaging (Docker/Compose) of the whole stack for one-command bring-up, and an optional automated build/ship step on code push.

## Assumptions
- Database runs on the same VPS via Webuzo's MongoDB, with authentication enabled and bound to localhost.
- The backend is kept alive by an always-on service behind a reverse proxy (not the Webuzo Passenger/Application Manager path).
- The app is served on one domain with the API under `/api`, using a free Let's Encrypt certificate, assuming a domain is pointed at the VPS. If no domain is ready, the same setup works over the server IP and HTTPS is added later.
- Delivery includes the written guide plus ready-to-use config files and a build script committed to the project.
- Existing third-party integrations (WhatsApp, Resend, Web Push, Google) continue to work through backend settings; their keys are the user's to supply and are never committed.
- No application feature changes are part of this hosting work.
- The two recently requested Students screen edits (sorting/filtering by enrolled college and course, and a reference dropdown) are unrelated to hosting and are tracked separately, to be applied after this plan is approved.
