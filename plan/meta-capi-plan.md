# Meta Conversions API — Send Lead Events

(Separate feature. The Academic Year Rollover plan in plan.md stays as-is and is unaffected.)

## Goal
When a new lead is created in the CRM, FinFlow automatically sends a "Lead" event to Meta's
Conversions API so Facebook/Instagram ad delivery can optimise on your real leads. Email and
phone are hashed before sending — Meta never receives raw contact details.

## What happens, in plain terms
- A lead gets created in the CRM (manual entry, public form, or CSV upload).
- FinFlow immediately builds a "Lead" event: hashed email, hashed phone, a timestamp, and the
  identifiers below, and posts it to Meta.
- The send happens in the background, so creating a lead is never slowed down or blocked if
  Meta is slow or unreachable. Failed sends are recorded and can be retried.

## Settings screen (Super Admin)
A new "Meta Conversions API" settings area where you paste:
- Pixel / Dataset ID
- Access Token (stored securely, never shown back on screen or sent to the browser again —
  it only ever displays as "configured")
- Test Event Code (optional, for verifying before going live)
- An on/off switch for the whole integration

Where to get these: Meta Events Manager → Data sources → your dataset → Settings / Conversions
API (generate token) and the Test Events tab (test code).

## Tracking what was sent
Each lead keeps a small delivery record: sent / failed / not-configured, the time, and Meta's
response reference. This prevents the same lead being counted twice and lets you see and retry
failures. A manual "resend to Meta" action is available per lead for corrections.

## Testing before going live
Using the Test Event Code, we fire a sample lead and confirm it shows up in Meta's Test Events
tab (email-only, phone-only, and both). Once verified, the test code is cleared so real leads
flow into measurement. Real leads are never used while testing.

## Decisions already made
- Trigger: on new lead created.
- Sends automatically (not a manual-only export).
- Credentials are pasted later via a settings screen; nothing is needed now to build it.
- Super Admin manages the settings.

## One decision worth your call — which "lead identifier" we send
Meta's `lead_id` field is specifically the ID of a lead that came from a **Meta Lead Ads form**.
It only helps matching if your leads actually originate from Facebook/Instagram lead forms.

- Option A (assumed default): your leads are mostly captured in the CRM / your own forms, not
  Meta Lead Ads. We match purely on hashed email + phone and attach your CRM's own lead ID as a
  reference (not labelled as a Meta lead id). Simplest, works for all leads.
- Option B: your leads come from Meta Lead Ads and you store Meta's real lead id on each lead.
  We send that as Meta's `lead_id` for the strongest matching. Requires that Meta lead id to be
  present on the lead record.
- Option C: a mix — send Meta's lead id when present, otherwise fall back to email/phone
  matching.

If you don't specify, I'll build **Option A**.

## Open assumptions (flag if wrong)
- One Meta dataset for the whole organisation (not a different Pixel per office).
- The event fires for every new lead regardless of office/campaign (a per-campaign or
  per-office on/off filter can be added later if you want it).
- Phone numbers need a country code to match well; leads without a usable email or phone are
  skipped (and marked as such) rather than sent empty.
