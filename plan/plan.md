# Dashboard Entrance Animations

Bring the dashboard to life on load: stat tiles glide in one after another, the numbers count up from zero, and the charts draw themselves in. The motion style is taken from the reference video; the app keeps its own crimson/amber theme and existing layout.

## Who it's for
The people who open the dashboard every day — Super Admins, Office Admins, and Staff — who want the numbers to feel alive and give a quick "the page is ready, here's what changed" moment.

## Core features and experience
- **Staggered reveal**: the top stat tiles and the main cards fade and slide up in sequence (one shortly after the next) instead of all snapping in at once.
- **Counting numbers**: the key figures on the dashboard (totals, balances, counts) tick up from zero to their real value over about a second, so the eye lands on them.
- **Charts animating in**: bars grow up from the baseline, lines draw left to right, and the donut/progress rings sweep around to fill.
- **Gentle hover feel**: cards and buttons keep a subtle lift on hover so the dashboard feels responsive (this already exists and will be kept consistent).
- **Respects "reduce motion"**: anyone whose device is set to minimize animation sees the final numbers and charts instantly with no movement — nothing is ever hidden behind an animation.

## User flow
1. User opens the dashboard.
2. Tiles and cards cascade in over roughly half a second; numbers count up; charts draw themselves.
3. User changes the academic year or the date-range/period filter → the affected numbers re-count and charts re-animate to the new values, confirming the data refreshed.
4. On later visits within the same session the motion still plays on load (see Assumptions for the alternative).

## UI/UX feel
Clean, modern, and fast — motion that is noticeable but never makes the user wait. Timing is quick (short delays between tiles, ~1–1.5s count-up, smooth chart draw). The look and colours of the dashboard do not change; only how its contents arrive on screen. Matches the "subtle and professional" end of the reference, not a flashy social-media treatment.

## Implementation phases

### Phase 1 — MVP (built now)
- Staggered entrance for the dashboard's stat tiles and primary cards.
- Count-up animation on the dashboard's headline numbers.
- Chart draw-in (bars grow, lines draw, rings sweep) for the charts already on the dashboard.
- Re-trigger on academic-year and period/date-range changes.
- Full "reduce motion" fallback.

### Phase 2 — later
- Extend the same entrance + count-up + chart motion to the other stat-heavy pages (e.g. Students, Leads, and the Office dashboards).
- "Reveal on scroll" so lower sections animate in as they come into view on long pages.

### Phase 3 — later
- App-wide polish: smooth scale-in for dialogs/modals, shimmer placeholder loaders while data is fetching, and animated tooltips on charts.

## Assumptions
- Phase 1 targets the **main Dashboard page only**; other pages come in Phase 2.
- Motion plays **every time the page loads and whenever the year or period filter changes** (not limited to once per session).
- Intensity is **subtle and professional**, adapted to a finance app, rather than the bolder social-reel style.
- The reference video's **green colour scheme is not adopted** — the app's current crimson/amber theme, layout, and content stay exactly as they are; only the entrance motion is added.
- No new numbers, cards, charts, or data are introduced; this applies motion to what the dashboard already shows.
- Count-up applies to **whole numeric figures** (amounts and counts); very long text or dates are not animated.
