# Quiz logic module — specification

A self-contained script `$S/work/quiz/quiz.js` defining a global `Quiz` (IIFE, `'use strict'`; it will be
pasted into the game's single script, so no imports, no DOM at load time). It holds the pure logic for three
new kinds of question the game is getting, so that logic can be tested hard before it meets the UI:

- **Name It** — a place is highlighted on the globe and the player types its name.
- **World capitals** — "Which capital belongs to Peru?" with four choices, and the reverse (a capital is
  named, the player taps the country).
- **Flags** — a flag is shown, the player taps the country.

Data it works with: `$S/work/data/world-facts.js` (`WORLD_FACTS = { country: [capital, ISO2, [alternates]] }`
and `COUNTRY_TYPED_ALIASES = { country: [spellings] }` — read that file's header comments and
`$S/work/data/notes.md`; the rules there are binding) and the game's `CONTINENTS` map
(`$S/work/data/game-countries.json` has the names by continent). The module takes data as arguments; it
never reads globals other than `Intl`/`String` built-ins.

## 1. Typed answers
```js
Quiz.fold(text) → string
```
Case-insensitive, accent-insensitive (NFD, strip combining marks; also ð/þ/ø/ł/ß/æ/œ and similar letters
that NFD does not decompose), `&` → `and`, `st`/`st.` at a word start → `saint`, apostrophes and
punctuation removed, hyphens and runs of whitespace → one space, a leading `the ` dropped, trimmed.

```js
const m = Quiz.matcher(entries, opts)   // entries: [{ name, aliases: [..] }]
m.match(text) → { name, exact: true|false, via: 'name'|'alias'|'near' } | null
```
- Whole-string matches only: never a prefix, never a substring.
- Exact (after folding) match on a name or alias wins.
- Otherwise a near match is accepted when the folded input is within a Damerau–Levenshtein distance of 1 of
  exactly one accepted spelling whose folded length is ≥ 6, or within 2 of exactly one whose folded length
  is ≥ 10 — AND no other entry has any accepted spelling within that same distance + 1 (so "nigera" is
  rejected: it is 1 from Nigeria and 1 from Niger; "austrlia" is accepted for Australia only if Austria is
  not within reach). Near matches return `exact: false` so the UI can show the right spelling.
- An input that folds to empty, or is longer than 60 characters, never matches.
- `opts.restrictTo` (array of names): only these entries can match; an input that exactly matches an entry
  OUTSIDE the restricted set returns `{ name, outside: true }` so the UI can say "that is a real place, but
  not this one" without counting it as a near-miss of something else.
- The matcher must be built once per level and be fast enough to run on every keystroke for 250 entries
  (target well under 1 ms per call; precompute folded spellings and length buckets).
- `Quiz.matcher` throws at build time if two different entries share a folded accepted spelling (a data bug).

## 2. Capitals
```js
Quiz.capitalOf(facts, country) → { capital, alternates: [..] }
Quiz.capitalChoices(facts, country, pool, rng, n = 4) → [capital strings], shuffled, containing the answer once
Quiz.isCapital(facts, country, text) → boolean   // folded comparison against the capital and alternates
```
Choice rules for `capitalChoices` (wrong options are other countries' first-listed capitals from `pool`, an
array of country names — normally the same continent, and the caller passes a wider pool when the continent
has fewer than n countries):
- never an alternate capital of the asked country;
- never a city whose folded name contains, or is contained in, the folded name of the answer or of another
  option already chosen (Nicosia / North Nicosia, Jerusalem / East Jerusalem, La Paz / Ciudad de la Paz,
  Guatemala City / Guatemala …);
- never two options with the same folded name (several countries could share a capital spelling);
- prefer plausible distractors: draw first from `pool`; fall back to all of `facts` only if the pool cannot
  supply n − 1 legal options; never fewer than n options unless the whole data set cannot supply them;
- deterministic for a given `rng` (a function returning [0,1)); expose `Quiz.rng(seed)` (Mulberry32) for
  tests. The answer's position must be uniformly distributed.
For the reverse mode (capital named → tap the country), `Quiz.capitalPrompt(facts, country)` returns the
first-listed capital; a country whose first-listed capital name equals its own country name after folding
(Djibouti, Luxembourg, Monaco, San Marino, Singapore-style cases, "Guatemala City" does not count) is flagged
`{ trivial: true }` so a level can leave it out of the reverse mode.

## 3. Flags
```js
Quiz.flagEmoji(iso2) → string        // two regional-indicator symbols; '' for codes outside A–Z pairs,
                                      // and '' for the private-use placeholders XS and XN
Quiz.hasFlag(facts, country) → boolean
Quiz.flagSupport(document) → 'font' | 'native' | 'none'   // browser-only; cached
```
Flags are drawn with a self-hosted colour font so they look the same everywhere (Windows has no flag emoji):
`$S/work/quiz/pkg/x/package/dist/TwemojiCountryFlags.woff2` (78 KB, from the npm package
`country-flag-emoji-polyfill`, MIT; Twemoji artwork CC-BY 4.0). The game will declare
```css
@font-face { font-family: 'Atlas Flags'; src: url('vendor/TwemojiCountryFlags.woff2') format('woff2');
             unicode-range: U+1F1E6-1F1FF; font-display: swap; }
```
and use `font-family: 'Atlas Flags', 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif`
on flag elements. `flagSupport` decides, after `document.fonts.load` for that family settles, whether flags
actually render as pictures: draw a known flag to a small canvas and check that it produced coloured pixels
and that its rendered width is about one glyph, not two letters. 'font' = the web font works, 'native' = it
did not load but the system draws flags, 'none' = neither (the game then hides the flag levels).
Also list which countries in `WORLD_FACTS` have NO glyph in the font (render each through the harness and
check) — the game must leave those out of flag levels. Write the list to `$S/work/quiz/flags-missing.json`.

## 4. Level helpers
```js
Quiz.levels(continents, facts) → [{ key, kind: 'capital'|'capital-reverse'|'flag'|'name', region, names: [..] }]
```
One level per continent plus "World" for each kind, with stable keys (`capitals-europe`,
`capitals-reverse-europe`, `flags-europe`, `name-europe`, `…-world`), leaving out per kind the countries that
cannot be asked (no flag glyph; trivial reverse capitals). Names keep the continent order of `continents`.

## Deliverables
- `quiz.js`
- `test-quiz.js` — a node script (no framework: assert, a seeded rng) that prints PASS/FAIL per check and exits
  non-zero on failure. It must include exhaustive checks over the real data, not only examples:
  every country and every alias matches itself exactly; every single-character deletion, insertion,
  substitution and adjacent transposition of every accepted spelling either matches the right country or
  matches nothing — never a different country (report how many are accepted vs rejected); the 2-edit rule
  likewise on a large sample; `capitalChoices` over every country × 200 seeds obeys every rule above and the
  answer's position is uniform (chi-square); `levels()` covers every country that can be asked exactly once
  per kind and region.
- `flag-check.js` — a harness script (see `$S/BRIEF.md`) that loads the font in headless Chromium, runs
  `flagSupport`, renders every flag and writes `flags-missing.json` plus one contact-sheet screenshot
  (`$S/shots/quiz/flags.png`) that you LOOK at.
- A short `NOTES.md`: API as built, any place you departed from this spec and why, and what the UI must do.

Code style: `'use strict'`, semicolons, 2-space indent, `//` comments, a one-line comment above non-obvious
functions; comments describe the code, not its history. Do not edit anything under `/home/user/atlas-game`.
