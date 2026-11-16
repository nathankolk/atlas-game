# World facts data — specification

The game needs, for every country it quizzes, the capital and the ISO 3166-1 alpha-2 code (for flag emoji),
plus accepted spellings for a typed-answer mode. Accuracy matters more than anything else here: the owner
will not forgive a wrong capital. When in doubt, look it up (WebSearch/WebFetch are available via ToolSearch).

The country list is the game's own: every name in the `CONTINENTS` constant in
`/home/user/atlas-game/public/index.html` (around line 2692; ~197 names). Use those strings exactly as keys.

## Output: `$S/work/data/world-facts.js`
```js
// Capital, ISO 3166-1 alpha-2 code, and (optional) other capitals a quiz should accept.
const WORLD_FACTS = {
  'France': ['Paris', 'FR'],
  'Bolivia': ['Sucre', 'BO', ['La Paz']],
  ...
};
// Extra spellings accepted when the player types a country's name (lower-case, no diacritics needed —
// the matcher folds case and accents). Only real alternative names, not misspellings.
const COUNTRY_TYPED_ALIASES = {
  'United States of America': ['usa', 'us', 'united states', 'america'],
  ...
};
```
Rules:
- Primary capital = the one a mainstream geography quiz expects (constitutional/official capital where a
  country has several; note the seat of government as an alternate). List alternates only where a second
  city is genuinely a capital (Bolivia, South Africa, Netherlands?, Sri Lanka, Malaysia, Eswatini, Benin,
  Côte d'Ivoire, Tanzania, Burundi, Chile?, Montenegro?, …) — decide each on the facts, don't pad.
- Use the common English name of the city, with diacritics where standard (e.g. 'Yaoundé', 'Brasília').
- Recent changes to get right as of November 2026: Kazakhstan (Astana), Burundi (Gitega), Indonesia
  (Jakarta vs Nusantara — check the legal status), Equatorial Guinea (Malabo vs Ciudad de la Paz — check),
  Myanmar, Sri Lanka, Palau, Kiribati (South Tarawa), Nauru (no official capital — Yaren is the de facto one).
- Territories/partially recognised states that appear in the game's list (check the list: e.g. Kosovo,
  Taiwan, Palestine, Western Sahara, Greenland…) get their usual capital and code (Kosovo: 'XK').
- Every key in the game's list must be present; no extra keys. ISO codes upper-case.

Also write `$S/work/data/notes.md`: one line per judgement call or changed capital with the source consulted.
