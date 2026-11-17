# Quiz module — progress (for a fresh agent picking this up)

Brief: `$S/BRIEF.md`; spec: `SPEC.md` in this folder. Data read in full: `../data/world-facts.js`,
`../data/notes.md`, `../data/game-countries.json`.

Files here: `quiz.js` (the module), `test-quiz.js` (node test-quiz.js [--quick]; full run takes minutes,
log to a file), `load-data.js` (shared data loader), `flag-check.js` + `flag-page.html` (harness; writes
`flags-missing.json`, `flags-report.json`, `$S/shots/quiz/flags.png`), `flag-twins.js` (which flags look alike).

## Done and verified (17 Nov)
- quiz.js complete: fold, distance, entries, matcher (+restrictTo, decoys, partial), capitalOf, isCapital,
  capitalOwners, capitalPrompt, capitalChoices, rng, flagEmoji, hasFlag, flagPrompt, flagDraws,
  flagSupport (Promise), levels, slug. ASCII only, banner first line, END marker last line.
- flag-check.js run: support 'font'; with a 404 font or no @font-face 'native' (sandbox has Noto Color Emoji).
  183 of 185 draw from the font; flags-missing.json = [Somaliland, Northern Cyprus]. Contact sheet LOOKED AT:
  Syria's glyph is the pre-2025 flag -> `FLAG_STALE = ['SY']`, hasFlag false. Chad/Romania differ only in
  shade of blue -> `flagPrompt().accept` lists both.
- test-quiz.js --quick: all matcher/capital/levels checks pass after fixes (see NOTES for numbers once the
  full run is in).

## Design decisions already taken (do not relitigate without a reason)
- `fold`: NFKD, lower-case, strip marks + invisible format chars, special letters (sharp s, ae, o-slash...),
  `&` -> and, dashes/slashes/underscores/any whitespace -> space, other punctuation removed, `st`/`st.`
  as a whole word -> saint, leading `the ` dropped (repeatedly, so fold is idempotent).
- matcher: exact Map lookup; near = spec rule to the letter (true Damerau-Levenshtein, 1 edit for spellings
  >= 6, 2 edits for >= 10, no other entry within k+1) PLUS guards that only ever turn a match into null:
  (a) prefix guard ("dominican" must not become Dominica);
  (b) decoys: real places that are not answers (Prussia, South America, Malta...) match nothing and block a
      near match when the input is at least as close to the decoy as to the candidate;
  (c) compass swaps of every spelling (north/south/east/west) are generated as decoys.
- The literal +1 margin costs kindness (gambia/zambia/iceland/ireland accept no typo; "rusia" blocked by
  rsa/usa). Kept as specified; reported, not changed.
- `restrictTo`: entries outside the set still block near matches; exact outside -> `{ name, outside: true }`.
- exact results carry `partial: true` when the input also starts another entry's spelling (Niger/Nigeria).
- `flagSupport` returns a Promise — spec departure, documented in NOTES.md.

## In progress
- full `node test-quiz.js > test-full.log` run and reading its judged lists

## Remaining
- NOTES.md (API as built, departures, what the UI must do, data problems, numbers from the full run)
- final PROGRESS.md update
