export const meta = {
  name: 'atlas-logic-and-data',
  description: 'Mastery/spaced-repetition module with tests and review; verified world capitals data',
  phases: [
    { title: 'Build', detail: 'mastery module; world facts draft' },
    { title: 'Verify', detail: 'independent review of the module; blind re-derivation of the facts' },
    { title: 'Reconcile', detail: 'fix findings; settle disputed facts with sources' },
  ],
}

const S = '/tmp/claude-0/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/scratchpad'
const BASE = `Read ${S}/BRIEF.md first (in it $S means ${S}). Do NOT edit anything under /home/user/atlas-game. `

const REPORT = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    openQuestions: { type: 'string' },
  },
  required: ['summary', 'files', 'openQuestions'],
}

const mastery = async () => {
  const built = await agent(
    BASE + `Then read ${S}/work/mastery/SPEC.md and build the module and its tests exactly as specified, in ` +
    `${S}/work/mastery/. Before designing, read how the game stores things today so the module fits in: the ` +
    `PERSONAL RECORDS, FOCUS LISTS, PIN STORE and SYNC sections of /home/user/atlas-game/public/index.html ` +
    `(grep for "atlas-records", "atlas-focus", "atlas-pin", "syncBuildPayload", "syncApplyRemote"). ` +
    `Run the tests with node and report honestly. If you believe the spec is wrong somewhere, implement what you ` +
    `think is right and say so under openQuestions.`,
    { label: 'mastery:build', phase: 'Build', schema: REPORT })
  const review = await agent(
    BASE + `Review ${S}/work/mastery/mastery.js against ${S}/work/mastery/SPEC.md. You did not write it. ` +
    `Read it line by line, then attack it with your own node script (${S}/work/mastery/review-test.js): property ` +
    `tests with random outcome sequences against an independently written reference model of the scheduling ` +
    `rules; local-midnight and DST boundaries (set TZ=America/Chicago and TZ=Pacific/Auckland via process.env.TZ ` +
    `before requiring); year boundaries; streak definitions; merge being commutative, idempotent and never losing ` +
    `progress; corrupt/partial stores (wrong types, truncated arrays, negative numbers, prototype-pollution keys ` +
    `like "__proto__" and "constructor" as item names — a country list won't contain them but a synced blob might); ` +
    `storage that throws; a 1,100-item store's size. Then FIX every real defect directly in mastery.js (keep its ` +
    `style), add the cases to test-mastery.js, and rerun both test files. Report what you found and fixed.`,
    { label: 'mastery:review', phase: 'Verify', schema: REPORT })
  return { built, review }
}

const FACTS = {
  type: 'object',
  properties: {
    path: { type: 'string' },
    countryCount: { type: 'integer' },
    judgementCalls: { type: 'string' },
  },
  required: ['path', 'countryCount', 'judgementCalls'],
}

const facts = async () => {
  const draft = await agent(
    BASE + `Then read ${S}/work/data/SPEC.md and produce world-facts.js and notes.md as specified. ` +
    `Extract the game's country list programmatically (a node script that evals the CONTINENTS literal out of ` +
    `index.html) so no name is mistyped or missed, and write a checker script ${S}/work/data/check.js that ` +
    `verifies: every game country has an entry, no extra keys, ISO codes are 2 upper-case letters and unique, ` +
    `capitals are non-empty strings. Use WebSearch (load it with ToolSearch) for every capital you are not ` +
    `certain about and for every "recent change" case in the spec; record the source in notes.md.`,
    { label: 'facts:draft', phase: 'Build', schema: FACTS })
  const blind = await agent(
    BASE + `Independent verification task. Do NOT open ${S}/work/data/world-facts.js or notes.md yet. ` +
    `Extract the country list from the CONTINENTS constant in /home/user/atlas-game/public/index.html (around ` +
    `line 2692) with a node script, and from your own knowledge write ${S}/work/data/blind.json: ` +
    `{ "<country>": { "capital": "...", "iso2": "..", "alt": ["other genuine capitals"], "confidence": "high|medium|low" } } ` +
    `for every country in the list. Only AFTER that file is complete, write and run a node script that diffs your ` +
    `blind.json against world-facts.js (load it by evaluating the file) and lists every disagreement in capital, ` +
    `ISO code, or alternates, plus every entry either of you marked less than certain. Resolve each disagreement ` +
    `and each uncertain entry by looking it up with WebSearch/WebFetch (load via ToolSearch) — official government ` +
    `sources, the CIA World Factbook, or Wikipedia's "List of national capitals" — and write ` +
    `${S}/work/data/disputes.md with: country, draft value, your value, the verified answer, the source URL. ` +
    `Also check COUNTRY_TYPED_ALIASES for anything wrong or ambiguous (an alias that matches two countries, e.g. ` +
    `"congo", "guinea", "korea", "sudan" must not be accepted for either). ` +
    `Do not edit world-facts.js yourself.`,
    { label: 'facts:blind-verify', phase: 'Verify', schema: REPORT })
  const final = await agent(
    BASE + `Finalise the world facts data. Read ${S}/work/data/SPEC.md, world-facts.js, notes.md, and the ` +
    `independent verifier's disputes.md (verifier's summary: ${JSON.stringify(blind)}). For each disputed item, ` +
    `check the cited source yourself (WebSearch/WebFetch via ToolSearch) and apply the verified answer to ` +
    `world-facts.js; where the two sources of truth still conflict, pick the answer a mainstream geography quiz ` +
    `expects, keep the other as an alternate, and log it in notes.md. Fix alias problems. Run check.js. ` +
    `Finally add to check.js (and run) a test that no typed alias, after lower-casing and stripping diacritics and ` +
    `punctuation, equals another country's canonical name or alias. Report the final count and every judgement call.`,
    { label: 'facts:final', phase: 'Reconcile', schema: FACTS })
  return { draft, blind, final }
}

const [m, f] = await parallel([mastery, facts])
return { mastery: m, facts: f }
