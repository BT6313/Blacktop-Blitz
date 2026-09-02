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

## Known follow-ups (post-submission)
- Car traits pass: 8 of 11 cars are cosmetic-only, so the garage grind pays
  out in nothing. One distinct trait each (ECO gentler ramp, PURSUIT wider
  pickup, FIRETRUCK one free hit, RACER bigger nitro, PHANTOM higher top
  speed, TAXI PRO +25% coins) turns the progression into a reason to play.
- Coin store is not possible on these portals: CrazyGames IAP is invite-only
  via their Xsolla account, and own-payment flows are forbidden. The route
  for that is a Google Play wrapper build using Play Billing.
- Dev hooks (?coins / ?unlock / ?reset) are hostname-gated to localhost and
  *.github.io, inert on any published host.
