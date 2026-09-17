# Blacktop Blitz — submission notes

Build: `dist/blacktop-blitz-crazygames.zip` (66 KB, `index.html` at archive root)
Playable: https://bt6313.github.io/Blacktop-Blitz/
Repo: https://github.com/BT6313/Blacktop-Blitz

---

## Title
Blacktop Blitz

## Tagline / short description
Dodge traffic at speed — then unlock the trucks that stop dodging and start crushing.

## Description
You are one car in four lanes of oncoming traffic, and the road only gets faster.
Weave between cars, grab coins, and chain five in a row to double your multiplier.
Hit anything and it's over.

Then you earn the Monster Truck, and the game changes. It flattens ordinary cars
instead of dying to them — but a semi still ends your run. Earn the Snowplow and
you'll crush semis too, with one exception: meet one head-on and you're finished.

Every run banks coins toward eleven unlockable vehicles, from the starter Speedster
to the trucks that rewrite the rules. Chase a personal best, or just see how long
you can survive when the road stops being survivable.

## Instructions
- Arrow keys or A / D to change lanes
- SPACE for nitro
- P to pause
- On touch: tap the left or right side of the screen to move, tap both for nitro
- Collect 5 coins in a row for a COMBO x2
- Look for the FREE TRY on the Monster Truck and Snowplow in the Garage

## Cover images
`covers/cover-landscape-1920x1080.png`, `covers/cover-portrait-800x1200.png`, `covers/cover-square-800x800.png`

## Suggested tags
driving, car, arcade, endless, traffic, skill, casual, 1 player, mobile, truck

## Category
Driving / Arcade

---

## Checklist
- [x] Fully self-contained, no external requests (except the SDK itself)
- [x] 66 KB zipped, 8 files — far under the 50 MB / 1500 file limits
- [x] CrazyGames SDK v3 integrated and initialised
- [x] `gameplayStart` / `gameplayStop` on start, death, pause, resume, quit
- [x] Midgame ads via SDK, audio muted and game paused for the ad's duration
- [x] Ad failures (adblock, unfilled, cooldown, Basic Launch) degrade silently
- [x] Progress saved via the SDK data API, localStorage as fallback
- [x] No external ads, no own IAP
- [x] Works with the SDK absent (verified live on GitHub Pages)
- [x] Avoids browser-reserved keys as the only binding (P added alongside Escape)
- [x] Portrait, touch-first, keyboard supported
- [x] Cover art (covers/ — 1920x1080, 800x1200, 800x800)
- [x] Tested on a real phone: menu buttons, garage scrolling, purchases
- [x] Confirm snowplow coin pickup on device
- [ ] Sitelock (deliberately deferred until the serving domains are known)

## Portal differences worth remembering
- CrazyGames: you call the SDK, it calls back. Ads fire on death. Has a
  cross-device save API (data module) and a mute switch you must honour.
- GameDistribution: it pushes SDK_GAME_PAUSE/SDK_GAME_START at you. Ads must
  come from user input outside gameplay, so the interstitial is queued at
  death and spent on PLAY AGAIN. No save API - localStorage only.

## Rejections
- **CrazyGames** (2026-09-16): boilerplate rejection, "overall quality does
  not yet meet expectations" - no specifics. Read as a curation/fit call,
  not a technical failure (nothing in QA was flagged).
- **GameDistribution** (2026-09-17): explicit "not a quality issue... could
  fit more naturally with other game portals" - a portfolio-fit rejection,
  not a defect report.
- Both letters converge on the same underlying gap rather than two different
  problems: nothing visibly distinguishes this from any other lane-dodger
  in a screenshot, because 8 of 11 cars were pure recolors. That's what the
  traits pass below directly answers.

## Car traits pass (done 2026-09-17)
Each of the six previously-cosmetic cars now has one real mechanical hook,
implemented as `perk` objects on CARS entries in game.js, read through a
single `activePerk(type)` helper so each system only asks for what it needs:

| car | cost | perk | verified |
|---|---|---|---|
| ECO | 220 | speed ramps up at 0.6x the normal rate | speed after 10s: 428 vs 500 baseline, exact |
| PURSUIT | 500 | coin pickup radius x1.4 (1.96x area) | pickup box area ratio 1.96, exact (1.4^2) |
| FIRETRUCK | 1000 | absorbs one hit per run before dying | forced-collision test: survives hit 1, dies on hit 2 |
| RACER | 2000 | nitro drains at 0.65x, regens at 1.6x | drain/regen both confirmed slower/faster than baseline |
| PHANTOM | 3500 | max speed cap x1.18, score rate x1.15 | cap 1062 vs 900, score ratio 1.15, both exact |
| TAXI PRO | 5000 | +25% coins per pickup, fractional carry so it can't drift over a long run | 4 pickups -> 5 coins banked, exact |

MONSTER and SNOWPLOW keep their existing crush abilities (unaffected - those
already had a real perk, they just aren't expressed through the `perk` field).
The three starter cars (SPEEDSTER/CRUISER/CLASSIC) intentionally carry none.

Garage cards reuse the existing `.car-ability` description slot, so all 8
non-starter cars now show a real reason to own them, not just a cost.

## Known follow-ups
- Coin store is not possible on CrazyGames/GameDistribution: CrazyGames IAP
  is invite-only via their Xsolla account, and own-payment flows are
  forbidden on both. The route for that is a Google Play wrapper using
  Play Billing.
- Dev hooks (?coins / ?unlock / ?reset) are hostname-gated to localhost and
  *.github.io, inert on any published host.

## Next steps (agreed 2026-09-17)
1. Push the traits-pass build to **itch.io** first - zero curation, live same
   day, gets real player data (session length, whether crush vehicles get
   touched) instead of another guess.
2. Try the more permissive portals next: **GameMonetize**, **Y8**.
3. Hold CrazyGames and GameDistribution for a later resubmission, once
   itch.io shows the traits pass actually changes how the game plays -
   don't resend to either on a hunch with no new evidence.
