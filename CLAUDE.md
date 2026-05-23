# Cartographer's Atlas — CLAUDE.md

This file is the orientation doc for Claude Code working in this repo. Read it first. Deeper history and the full feature catalog live in `atlas_handoff.md`.

---

## What this is

A geography quiz web app with a parchment-and-compass aesthetic, built as a **single HTML file** (`public/index.html`) with embedded CSS and vanilla JavaScript. No build step, no frameworks, no bundlers. External dependencies are loaded from CDNs (D3 v7, topojson, world-atlas, us-atlas).

Players test their knowledge of world countries, US states, and US state capitals across several quiz modes. The app tracks personal records in localStorage, supports a Wordle-style daily challenge, and ships emoji-grid share results.

Owner: Nathan Kolk. Solo project, family-first orientation (designed in part so his kids can play).

---

## Current status (as of May 22, 2026)

**Live at:** `https://atlas.nathankolk.com` (and `https://atlas-game.pages.dev`)

**Hosting:** Cloudflare Pages, project name `atlas-game`. Custom subdomain configured via CNAME at Squarespace DNS (nameservers stayed at Squarespace; only the `atlas` subdomain is delegated to Cloudflare).

**Backend:** Cloudflare Pages Function at `functions/api/records.js` exposes `GET`/`POST /api/records?token=...`. KV namespace `RECORDS_KV` is bound in `wrangler.toml`. The Function is deployed alongside the static site.

**Phase 1 status (cross-device record sync):**
- Backend Worker code: **done and deployed**
- KV namespace: **provisioned and bound**
- Client-side sync UI (username creation, token generation, sync code flow, API calls): **not yet wired into the HTML**
- localStorage records work fully offline today; sync layer mirrors them when added

**Phase 2 (live multiplayer mode):** tabled until Phase 1 ships. Requires Workers Paid ($5/mo). Don't push toward it.

---

## Repo layout

```
Atlas Game/
├── public/
│   └── index.html              # The game. ~159kb. Source of truth for the frontend.
├── functions/
│   └── api/
│       └── records.js          # Pages Function. Auto-routes to /api/records.
├── wrangler.toml               # Cloudflare config. KV binding lives here.
├── atlas_handoff.md            # Full feature catalog, project history, technical reference.
├── CLAUDE.md                   # This file.
└── .wrangler/                  # Local dev state (gitignore this if/when git is added).
```

There's no `src/`, no build output, no `node_modules/` at the project root. The HTML file IS the build artifact.

---

## How to work in this repo

### Editing the game

Edit `public/index.html` directly. Single file, ~3000 lines. Match the existing style:

- `'use strict'` at the top of the script block
- `//` for inline comments, `/* ===== Section Name ===== */` blocks for major dividers
- One-line description comment above non-obvious functions
- CSS uses custom properties (`--ink`, `--parchment`, `--gold`, `--sepia`, `--moss`, etc.) — don't hardcode colors
- No semicolons missing, no random formatting changes — match indentation/spacing of surrounding code

Before declaring an edit done, syntax-check the JS:
```bash
# Extract the <script> block and run node --check on it.
# Cheap insurance against accidentally breaking the file.
```

### Deploying

**Two paths:**

1. **Manual via Wrangler** (current workflow):
   ```bash
   cd "/Users/nathan.kolk/Documents/Claude/Projects/Atlas Game"
   wrangler pages deploy public --branch=main
   ```
   The `--branch=main` flag is **required** — Cloudflare's Production branch setting on this project is `main`. Without it, the deploy lands as Preview and the production URL doesn't update.

2. **GitHub auto-deploy** (not yet set up, but recommended next):
   Once a GitHub repo is connected to the Pages project, every push to `main` auto-deploys. This eliminates the wrong-directory class of bugs (see Gotchas).

### Local dev

```bash
cd "/Users/nathan.kolk/Documents/Claude/Projects/Atlas Game"
wrangler pages dev public
```

This runs the static site + Functions locally with a real KV namespace mock. Test the `/api/records` endpoint with curl:
```bash
curl 'http://localhost:8788/api/records?token=00000000000000000000000000000001'
curl -X POST 'http://localhost:8788/api/records?token=00000000000000000000000000000001' \
  -H 'Content-Type: application/json' \
  -d '{"hello":"world"}'
```

The token must be 32 hex chars. Anything else returns `400 invalid_token`.

---

## Gotchas (we learned these the hard way)

- **`cd` into the project before running `wrangler pages deploy`.** Wrangler resolves `public` relative to your current directory. Running it from `~` will pick up macOS's `~/Public/` system folder and deploy macOS metadata files (`.localized`, `Drop Box/`) instead of the game. Always `pwd` before deploying.

- **`--branch=main` is mandatory on deploys.** Production branch on the Pages project is set to `main`. Forget the flag and the deploy goes to Preview, which doesn't serve the production URL.

- **Production deployment ≠ deployment exists.** Pages classifies each deploy as Preview or Production at deploy time based on the branch flag. Changing the Production branch setting in the dashboard does NOT retroactively reclassify old deploys — they stay Preview forever. Always check the Environment column in the Deployments tab.

- **Cloudflare's "Nothing is here yet" page** means the project exists but has no Production deployment. Custom domain failures usually trace back to this, not to DNS.

- **DNS for `atlas.nathankolk.com`** is a CNAME at Squarespace pointing to `atlas-game.pages.dev`. The root domain stays on Squarespace nameservers — we did NOT delegate the whole domain to Cloudflare. This is the cleaner setup because Nathan has email records (Resend DKIM, AWS SES MX/SPF) on `nathankolk.com` that would break if nameservers swapped without migration.

- **localStorage is the source of truth.** When the sync layer is built, the API will mirror localStorage, not replace it. The game must keep working fully offline.

---

## Things explicitly NOT to do

- **Don't add hint buttons or hover tooltips.** Both were built and removed. User found them unhelpful (and tooltips lingered on mobile).
- **Don't add public/global leaderboards.** Considered and scratched. Daily mode handles the social need without the moderation burden.
- **Don't suggest paid Cloudflare tier without flagging cost.** Workers Paid ($5/mo) is acceptable to discuss for Phase 2 (live mode) but always lead with the price. Phase 1 stays free-tier.
- **Don't regenerate OG image, favicons, or other visual assets** unless asked. They exist (`og-image.png`, `favicon-32.png`, `favicon.png`, `favicon-180.png`) and look the way Nathan wants.
- **Don't break the parchment/sepia/Cormorant Garamond aesthetic.** Visual polish matters to this user. Match palette and typography.
- **Don't push toward Phase 2 (live mode) until Phase 1 ships and is stable.**
- **Don't rebuild from scratch.** Always extend the existing HTML file.

---

## How to communicate with this user

- **Explain the *why*, not just the *what*.** Nathan wants to learn the toolchain, not just run commands. First time a tool is introduced, briefly explain its role in the chain. Don't repeat the explanation later.
- **Be direct about tradeoffs.** Frank takes over reassurance. If a feature is overkill, say so. If something will be hard, say so. If a tool costs money, lead with that.
- **Recommend, don't lay out five options.** When there's a clear right answer for his situation, say "I recommend X because Y." He'll push back if he disagrees.
- **Keep responses focused.** He's a builder iterating fast — long preambles slow him down. Lead with the answer or action.
- **One question at a time.** When real design tradeoffs come up, ask a single well-framed multiple-choice question. Don't bundle three ambiguous decisions into one prompt.
- **Build incrementally.** Land one thing cleanly, test it, then stack the next. If he asks for three features, suggest doing one first.

---

## Toolchain installed on this machine

- macOS, login `nathan.kolk`. Paths: `/Users/nathan.kolk/...`
- Homebrew
- Node + npm (installed via `brew install node`)
- Wrangler (installed globally via `npm install -g wrangler`)
- `wrangler login` already done — auth token persists in `~/.wrangler/`
- Cloudflare account: yes (also owns Full Stock Amenities project at fullstockamenities.com)
- Git: probably installed (comes with macOS), but **the project is not yet a git repo**. Adding GitHub auto-deploy is the next infrastructure step.

---

## Quick reference: game internals

For full detail see `atlas_handoff.md`. Highlights:

**Game modes** are registered in a `GAME_MODES = { ... }` object in the JS. Adding a new mode means: (1) entry in the registry, (2) handling in `startGame()` for queue building, (3) prompt logic in `nextCountry()`, (4) menu card in `renderMainMenu()`.

**Records** live in `localStorage["atlas-records"]` keyed by `gameMode|region|difficulty`. Each entry tracks bestScore, bestTime (clean sweeps only), bestAccuracy, gamesPlayed, lastPlayed.

**Daily Five** is deterministic: date string → FNV-1a hash → Mulberry32 PRNG → 5 countries with a difficulty ramp (Tier 1 easy → Tier 3 hard, hand-curated tier lists in the source). Daily epoch is `2026-04-26` = Day 1. Attempts live in `localStorage["atlas-daily-attempts"]`, trimmed to last 30 days.

**Sync API** (`functions/api/records.js`):
- `GET /api/records?token=<32 hex>` → returns stored JSON blob, or `"null"`
- `POST /api/records?token=<32 hex>` → overwrites blob, returns `{ ok: true }`
- Token IS the credential. No accounts, no passwords. Same model as Signal device linking.
- 64KB body limit (records blob is tiny — this is generous).

---

## When in doubt

Ask Nathan. He prefers one well-framed question over watching you guess wrong and waste a cycle.
