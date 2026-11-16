export const meta = {
  name: 'atlas-globe-engine',
  description: 'Build, extend, review and harden the WebGL globe engine as a standalone module',
  phases: [
    { title: 'Core', detail: 'vector globe, interaction, picking, overlay, Canvas2D fallback' },
    { title: 'Imagery', detail: 'satellite tiles reprojected in the sphere shader' },
    { title: 'Review', detail: 'two independent reviewers: correctness and visual/perf' },
    { title: 'Harden', detail: 'fix confirmed findings, rerun everything' },
  ],
}

const S = '/tmp/claude-0/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/scratchpad'
const COMMON = `Read ${S}/BRIEF.md first, then ${S}/work/globe/SPEC.md (in both, $S means ${S}). ` +
  `Work only inside ${S}/work/globe/ and ${S}/shots/globe/. Do NOT edit anything under /home/user/atlas-game. ` +
  `INTERRUPTIONS: this work can be cut off at any moment by a usage limit, and a fresh engineer with no memory ` +
  `is then given this same brief. So first read ${S}/work/globe/PROGRESS.md if it exists and look at the files ` +
  `already on disk, and continue from there instead of starting over (check claims rather than trusting them). ` +
  `Keep PROGRESS.md current as you work: after each finished item rewrite it with what is done and verified, ` +
  `what is in progress, what remains, and anything a successor must know. Keep globe.js loadable and the test ` +
  `file runnable at every save. ` +
  `Add your own section to PROGRESS.md for your stage; leave earlier stages' sections in place. ` +
  `ECONOMY: the usage allowance for this work is tight. Spend it on building and checking, not on re-reading: ` +
  `read globe.js once, then work with Grep and ranged Reads; send long command output to a file and grep it; ` +
  `the full test file takes about 4 minutes, so run single groups (the filter argument) while iterating and ` +
  `the whole file at the end. `

const REPORT = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    testsPassing: { type: 'integer' },
    testsFailing: { type: 'integer' },
    failingDetails: { type: 'string' },
    deviationsFromSpec: { type: 'string' },
    knownIssues: { type: 'string' },
  },
  required: ['summary', 'files', 'testsPassing', 'testsFailing', 'deviationsFromSpec', 'knownIssues'],
}

phase('Core')
// The core was finished by the second engineer before a usage limit cut the run short; the orchestrator
// ran the full test file afterwards (244 passed, 0 failed), so the stage is recorded here instead of re-run.
const core = {
  summary: 'The core of the engine is complete: WebGL vector globe (fills triangulated per polygon in a gnomonic ' +
    'tangent plane, style texture, mitred border quads, sphere shader with graticule and limb), drag / wheel / ' +
    'pinch / inertia, flyTo and fitTo, CPU picking, the 2D overlay with its draw helpers, anchors with ' +
    'anchorRadiusDeg, the Canvas2D fallback (also used after a shader failure or a context lost for 4 s), and ' +
    'the spec Addendum A1-A10 except A5 (imagery). PROGRESS.md in the work folder is the full log: what was ' +
    'changed, the checks behind each change, deviations and known limits. Read it.',
  files: ['globe.js', 'test-globe.js', 'site/index.html', 'site/test.html', 'SPEC.md', 'PROGRESS.md'],
  testsPassing: 244,
  testsFailing: 0,
  failingDetails: '',
  deviationsFromSpec: 'See "Known deviations from SPEC" in PROGRESS.md (gnomonic triangulation, non-instanced ' +
    'mitred border quads, stencil for translucent fills, Canvas2D precision, a few API additions). ' +
    'setImagery is a stub that reports failed and supportsImagery() returns false: that is your job. The slot ' +
    'for the imagery lookup is surfaceColor(geo, r2) in SPHERE_FS; the stubs sit together near the end of create().',
  knownIssues: 'See "Known issues / limits" in PROGRESS.md: Canvas2D fallback speed on the 50m world (about 49 ms ' +
    'per moving frame), border geometry memory (112 bytes per segment on CPU and GPU), anchors up to 10 ms for ' +
    'the largest polygons.',
}

phase('Imagery')
const imagery = await agent(
  COMMON +
  `The core globe engine already exists in ${S}/work/globe/ (globe.js, the demo site, test-globe.js). ` +
  `Previous engineer's report: ${JSON.stringify(core)}\n\n` +
  `Your job: implement the Imagery section of the spec (setImagery, base mosaic + detail window textures, the ` +
  `shader lookup, status reporting, LRU, antimeridian-crossing windows, polar clamp), wire it into the demo ` +
  `(a toggle), and extend test-globe.js with the imagery checks from the spec (pixel sampling against the mock ` +
  `tiles at several views and zooms, including a view across the antimeridian, a high-latitude view, ×20 and ×60 ` +
  `zoom; the 'failed' status with the harness option tiles:'fail'; that rotating keeps showing base imagery ` +
  `with no blank frames; that the detail window sharpens after settle — the mock tiles print their z/x/y key, so ` +
  `a screenshot shows which zoom level is on screen). Read globe.js fully before changing it; keep its style. ` +
  `Also fix any core defect you run into, and say so. In satellite use the fills are transparent or tinted and ` +
  `borders are light: check that case in a screenshot (set styles to rgba fills, light borders) — borders must sit ` +
  `exactly on the mock tiles' coastlines at every zoom. Run the complete test file at the end and report honestly.`,
  { label: 'globe:imagery', phase: 'Imagery', schema: REPORT })

phase('Review')
const FINDINGS = {
  type: 'object',
  properties: {
    verdict: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          title: { type: 'string' },
          evidence: { type: 'string' },
          suggestedFix: { type: 'string' },
        },
        required: ['severity', 'title', 'evidence', 'suggestedFix'],
      },
    },
  },
  required: ['verdict', 'findings'],
}
const reviews = (await parallel([
  () => agent(
    COMMON +
    `You are reviewing the finished globe engine (globe.js) for CORRECTNESS and ROBUSTNESS. You did not write it. ` +
    `Do not edit globe.js; write your own probe scripts under ${S}/work/globe/review-a/. ` +
    `Read the whole file. Then try to break it: every API in the spec with awkward inputs (empty layers, a layer ` +
    `swapped mid-flight, styles set before layers are ready, keys that don't exist, fitTo on a single tiny island, ` +
    `on Russia, on the whole world, on a FeatureCollection spanning the antimeridian; flyTo interrupted by a drag; ` +
    `resize to 0×0 and back; attachTo another host; pause/resume; destroy then create again; rapid setLayers calls ` +
    `racing each other; WebGL context loss via WEBGL_lose_context; forceCanvas2D). Check picking against ` +
    `d3.geoContains for 2,000 random points on each data set (world 50m, US states, each province file) and at ` +
    `the limb. Check click-vs-drag, pinch, wheel on a trackpad-style event stream, double-tap. Check for per-frame ` +
    `allocations and for frames drawn while idle. Check memory: buffers/textures freed on layer swap and destroy. ` +
    `Check that it depends only on d3-array + d3-geo + earcut globals (load the demo with only those and confirm). ` +
    `Report only defects you reproduced, each with the exact reproduction and observed vs expected.`,
    { label: 'review:correctness', phase: 'Review', schema: FINDINGS }),
  () => agent(
    COMMON +
    `You are reviewing the finished globe engine (globe.js) for VISUAL QUALITY and PERFORMANCE. You did not write it. ` +
    `Do not edit globe.js; write your own probe scripts under ${S}/work/globe/review-b/ and save screenshots under ` +
    `${S}/shots/globe/review-b/ — and look at every one. Capture: whole world at k=1; limb crossing Russia, ` +
    `Antarctica from the side and from below; ×8 on Europe, ×40 on the Caribbean, ×80 on Luxembourg; US states; ` +
    `China provinces; the same with imagery on (transparent fills, light borders) and with semi-transparent ` +
    `tinted fills (alpha 0.3 and 0.65); DPR 1, 2 and a 390×844 phone viewport; a dark page background and a ` +
    `parchment one. Look for: gaps between land and the limb, cracks or seams between triangles, double-blended ` +
    `overlaps, jagged or uneven borders, borders drawn on the far side, a halo that looks cheap or bands, shading ` +
    `that fights the flat cartographic style, imagery seams at the window edge or the antimeridian, imagery/border ` +
    `misalignment, blurry output on DPR 2, anything that looks unprofessional. Zoom the screenshots (crop regions ` +
    `with a script) where needed. Performance: scripted 240-frame rotation and a zoom sweep on the 50m world — ` +
    `report JS ms per frame (performance.now around the engine's frame function), allocations per frame ` +
    `(performance.memory deltas or a heap sampling profile via CDP), draw calls, vertex counts, buffer and ` +
    `texture memory, build time per data set. Flag anything that would hurt a mid-range phone. ` +
    `Report concrete, reproducible problems, each with the screenshot path or measurement as evidence.`,
    { label: 'review:visual-perf', phase: 'Review', schema: FINDINGS }),
])).filter(Boolean)

const allFindings = reviews.flatMap(r => r.findings || [])
log(`Review: ${allFindings.length} findings (${allFindings.filter(f => f.severity === 'blocker').length} blockers, ${allFindings.filter(f => f.severity === 'major').length} major)`)

phase('Harden')
const hardened = await agent(
  COMMON +
  `You are the engineer responsible for making the globe engine release-quality. Two independent reviewers ` +
  `examined globe.js; their findings are below. For each finding: reproduce it yourself first (the reviewers' ` +
  `probe scripts are in ${S}/work/globe/review-a/ and review-b/, their screenshots in ${S}/shots/globe/review-b/). ` +
  `Fix every one you can reproduce, in order of severity; if a finding is wrong, say why in your report instead ` +
  `of changing code. Add a regression check to test-globe.js for each fix that can be checked automatically. ` +
  `Then rerun the whole test file and retake the key screenshots and look at them. Keep the code clean — fixes ` +
  `should read as if they had been there from the start. Finish by listing what changed and what remains.\n\n` +
  `Imagery engineer's report: ${JSON.stringify(imagery)}\n\nFINDINGS:\n${JSON.stringify(allFindings, null, 1)}`,
  { label: 'globe:harden', phase: 'Harden', schema: REPORT })

return { core, imagery, reviews, hardened }
