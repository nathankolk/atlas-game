# smoke.js progress (kept current; a fresh agent resumes from here)

Status: smoke.js is on disk with all 13 checks written and runnable. First full run on app-copy:
9 PASS, 1 SKIP (mastery: hook has none), FAIL stale-timer (bug B4), FAIL bad-links (bug D7),
pin was failing on a suite data error (fixed: PIN_CITIES / US_CAPITALS now pasted from the app).

Run: `NODE_PATH=/opt/node-tools/node_modules node smoke.js --root=<this folder>/app-copy`
(or `--patch-hook` against the repo while it has no hook). Full desktop run ~135 s.

## Supporting files (all in this folder)
- `make-test-copy.js` — builds a servable copy of public/ with the `window.__atlas` hook added
  (`--mastery` also pastes mastery.js and wires a stand-in integration, to exercise the mastery check).
- `baseline-public/` — `git archive HEAD public` (commit 1c74e1d, before the integration stages touched it).
- `app-copy/` — baseline + hook. `app-copy-mastery/` — baseline + hook + stand-in mastery wiring.
- `scratch/` — throwaway exploration/profiling scripts (prof5.js shows the GPU-compositing stall).

## Findings so far
- The harness's Chromium flags (GPU compositing on SwiftShader) stall the browser 5-15 s after each
  screen switch over the SVG map (screenshot 13 s, browser.close 13-16 s). smoke.js adds
  `--disable-gpu-compositing` by wrapping chromium.launch (WebGL still works); `--stock-gpu` turns that off.
- At 1x every World country can be hit by a real click on desktop; on the phone size Luxembourg needs zoom.
- No Pin city sits under a map control at 1280x800 or 390x844. Mouse wheel zoom works in phone emulation.
- Continent sizes today: Africa 53, Asia 47, Europe 38, North America 23, South America 13, Oceania 6 (B1).

## Checks written
all 13: boot, continent-perfect, wrong-and-skip, world, us-modes, provinces-learn, pin, daily,
difficulty-satellite, persistence, mastery, stale-timer, bad-links

## Checks verified against the app
- Desktop, app-copy and app-copy-mastery: 11 PASS (mastery PASS on the mastery copy, SKIP on app-copy);
  stale-timer FAIL (bug B4) and bad-links FAIL (bug D7) as expected.
- Adapter stress test (`scratch/stress-adapter.js [--mobile] [slugs]`, needs app-copy): every item of
  world, europe, oceania, us-state, northeast-cities and all six province rounds is hit by a real
  click (desktop) / tap (phone) with 0 wrong targets and 0 synthetic clicks.
- Phone: Chromium's touch adjustment hands taps to nearby smaller elements, so on touch the adapter
  does a "trial tap" (events swallowed before the page sees them) to learn which element a tap
  reaches, and zooms in when it is not the wanted one. Flags to disable touch adjustment had no effect.

## Remaining
- full run with --mobile after the trial-tap change; full desktop run again
- run with --shots and look at the screenshots
- negative tests: prove each check can fail (mutated copies of the app)
- run against the live repo once its hook lands; final report
