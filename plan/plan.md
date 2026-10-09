# Dashboards That Move With Purpose

Borrow the motion language of the Farider dashboard reference and bring it to every dashboard in the app: charts that react to the cursor, cards that lift on hover, sections that glide in and out, a live heartbeat on "today" numbers, and a sliding highlight on the menu. The look stays exactly as it is now — the app's crimson/amber theme, layout, and content do not change; only how things respond and transition does.

## Who it's for
The people who live in these dashboards every day — Super Admins, Office Admins, and Staff — who want the numbers and charts to feel responsive and alive, so each hover and tab switch gives a quick, confident "the app heard me" moment.

## Core features and experience
- **Interactive charts**: hovering a bar, line point, or donut slice gently highlights it (the rest dims slightly) and a smooth tooltip glides to the cursor showing that figure. Moving across the chart animates the highlight from one point to the next, so reading the data feels fluid rather than static.
- **Richer card & button hover**: dashboard cards lift a touch with a soft shadow/glow and their icon reacts on hover; buttons and clickable tiles get a subtle, springy press feel. Consistent across all dashboards.
- **Smooth section transitions**: switching the dashboard tile/tab (or sub-view) slides the outgoing content out and eases the incoming content in, instead of a hard swap — a short, quick crossfade-and-slide.
- **Live "today" pulse**: figures that represent the current moment (for example today's spend / real-time counts) carry a soft pulsing dot so it's clear they are live and refreshing, not a frozen snapshot.
- **Animated sidebar**: the active menu item is marked by a highlight that slides smoothly from the old item to the new one as the user moves between pages, with a light hover cue on the others.
- **Respects "reduce motion"**: anyone whose device is set to minimize animation sees the final state instantly — highlights, tooltips, and transitions resolve with no movement, and nothing is ever hidden behind an animation.

## User flow
1. User opens any dashboard (main, Office, Staff, or CRM). Content is already present; cards and buttons now respond to hover with a gentle lift.
2. User moves the cursor over a chart → the nearest bar/point/slice highlights and a tooltip glides in with the value; sliding across moves the highlight smoothly.
3. User switches a tile/tab → the current view slides out and the new one eases in.
4. User glances at a "today" figure → a soft pulse signals it is live.
5. User clicks a different item in the sidebar → the active highlight slides to it as the page changes.

## UI/UX feel
Subtle, premium, and fast — motion that is noticeable but never makes the user wait (short, ~150–300ms interactions; smooth chart highlight tracking). It reads as the "purposeful, professional" end of the reference, not a flashy social-reel treatment. The reference's dark + lime-green palette is explicitly not adopted; the app keeps its crimson/amber identity, and colours, layout, and content stay as they are.

## Implementation phases

### Phase 1 — MVP (built now)
Across all four dashboards (main Super Admin, Office, Staff, and CRM analytics):
- Interactive charts: hover highlight + dim-the-rest + smooth cursor-following tooltip, with the highlight animating between points.
- Richer, consistent card and button/tile hover (lift, soft glow, icon reaction, springy press).
- Smooth slide-and-fade transition when switching tiles/tabs/sub-views.
- Live pulse indicator on "today"/real-time figures.
- Animated sliding active-highlight in the sidebar, with hover cues.
- Full reduce-motion fallback for all of the above.

### Phase 2 — later
- Deeper chart interactivity: tapping a legend animates that series in/out; scrubbing a timeline; animated, friendly empty-states when a chart has no data.
- Richer sidebar: section expand/collapse motion and a subtle indicator for unread/attention items.

### Phase 3 — later
- App-wide polish beyond dashboards: smooth page/route transitions throughout the app, shimmer skeleton loaders while data is fetching, and animated toasts/dialogs.

## Assumptions
- Keep the current crimson/amber theme; colours, layout, and content are unchanged — only motion/interaction is added. The reference's green scheme is not used.
- Applies to all four dashboards (main, Office, Staff, CRM) as requested.
- Charts animate and react using the data already shown; no new metrics, cards, or charts are introduced.
- Hover effects are the primary desktop experience; on touch devices they degrade gracefully (tap/select still works, no "stuck" hover states), and chart tooltips appear on tap.
- Motion intensity is subtle and professional, tuned for a finance app rather than the bolder reference style.
- The "today/live" pulse is purely a visual cue on existing figures; it does not change how often data refreshes.
- The animated sidebar keeps the existing menu structure and items; only the active/hover indication becomes animated.
- All new motion honours the device "reduce motion" setting by resolving instantly with no movement.
