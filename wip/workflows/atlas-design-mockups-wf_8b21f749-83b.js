export const meta = {
  name: 'atlas-design-mockups',
  description: 'Three independent redesign mockups of the app (static HTML) with screenshots',
  phases: [{ title: 'Mock', detail: 'three distinct takes on the same brief' }],
}

const S = '/tmp/claude-0/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/scratchpad'
const TAKES = [
  { key: 'a', name: 'Editorial Atlas',
    angle: `"Editorial Atlas": light-first and typographic. Feels like a beautifully typeset modern atlas or a ` +
      `premium magazine app: generous whitespace, hairline rules, strong type hierarchy with Cormorant display ` +
      `numerals, cards that are quiet surfaces rather than boxes, gold used sparingly as the single accent. ` +
      `The dark theme is a calm ink-navy version of the same.` },
  { key: 'b', name: 'Night Chart',
    angle: `"Night Chart": globe-forward and immersive. The globe is the hero on Home and fills the game; UI ` +
      `floats over it as crisp translucent panels. Dark navy "night chart" is the showcase theme (gold accents, ` +
      `fine luminous lines), and the light parchment theme is its daytime twin. Feels like a high-end navigation ` +
      `instrument or a flight-tracker app — precise, sleek, a little cinematic.` },
  { key: 'c', name: 'Field Guide',
    angle: `"Field Guide": the most app-like and approachable. Clear sections with a colour accent per subject ` +
      `(world, United States, provinces, capitals & flags, cities), rounded cards with confident progress rings, ` +
      `bigger touch targets, obvious primary actions — a nine-year-old and an adult both find their way instantly — ` +
      `while still elegant and unmistakably cartographic (not cartoonish, no emoji-as-icons clutter).` },
]

const OUT = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    indexPath: { type: 'string' },
    screenshots: { type: 'array', items: { type: 'string' } },
    proudest: { type: 'string' },
    weakSpots: { type: 'string' },
  },
  required: ['summary', 'indexPath', 'screenshots', 'proudest', 'weakSpots'],
}

phase('Mock')
const results = await parallel(TAKES.map(t => () => agent(
  `Read ${S}/BRIEF.md and then ${S}/work/design/BRIEF.md (in both, $S means ${S}). Look at the current app's ` +
  `screenshots in ${S}/shots/baseline/ (d-01-menu-full.png, d-02-world.png, m-01-menu-full.png, m-02-world.png) ` +
  `to see where it is coming from, and skim the CSS tokens at the top of /home/user/atlas-game/public/index.html. ` +
  `You are a senior product designer who writes production CSS. Your letter is "${t.key}"; work only in ` +
  `${S}/work/design/${t.key}/ and ${S}/shots/design/${t.key}/. Do not edit the repo.\n\n` +
  `Your take on the brief is ${t.angle}\n\n` +
  `Two other designers are mocking different takes; yours should commit fully to its own. Design all seven screens. ` +
  `Take real care over hierarchy, spacing rhythm, alignment and the phone layout — then screenshot, look, and ` +
  `iterate at least twice per screen until it would hold up next to a shipping commercial app. Use realistic ` +
  `content (real country names, plausible numbers). For the globe placeholder, render something convincing: ` +
  `e.g. generate an orthographic land path with d3-geo in node from ${S}/vendor/node_modules/world-atlas/land-110m.json ` +
  `and inline it as SVG with a shaded sphere. Report honestly where your mockup is still weak.`,
  { label: `design:${t.key}`, phase: 'Mock', schema: OUT }
).then(r => r ? ({ ...r, key: t.key, name: t.name }) : null)))

return results.filter(Boolean)
