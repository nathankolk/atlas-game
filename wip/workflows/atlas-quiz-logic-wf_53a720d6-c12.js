export const meta = {
  name: 'atlas-quiz-logic',
  description: 'Build and adversarially test the quiz logic module (typed answers, capitals, flags) outside the repo',
  phases: [
    { title: 'Build', detail: 'quiz.js + tests + flag check' },
    { title: 'Attack', detail: 'two independent reviewers try to break it' },
    { title: 'Harden', detail: 'fix confirmed problems' },
  ],
}
const S = '/tmp/claude-0/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/scratchpad'

phase('Build')
const build = await agent(`
Read ${S}/BRIEF.md (context and the test harness), then ${S}/work/quiz/SPEC.md, and build exactly what the
spec asks for in ${S}/work/quiz/. Read the data files it names in full first. Do not edit anything under
/home/user/atlas-game. Run your tests and the flag check, look at the contact sheet, and iterate until
everything passes for real. Return: the files, the test results (numbers), every departure from the spec
with the reason, and any problem you found in the DATA (ambiguous spellings, capitals that break the choice
rules, flags with no glyph).`, { label: 'quiz:build', phase: 'Build' })

phase('Attack')
const FINDINGS = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: { type: 'object', properties: {
      title: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
      evidence: { type: 'string', description: 'A script or exact input that demonstrates it, and the output' },
      suggestedFix: { type: 'string' } }, required: ['title', 'severity', 'evidence'] } },
    checked: { type: 'string' },
  },
  required: ['findings', 'checked'],
}
const base = `
A quiz logic module for a geography game was just built: ${S}/work/quiz/quiz.js with tests in
${S}/work/quiz/test-quiz.js, to the specification ${S}/work/quiz/SPEC.md, over the data in
${S}/work/data/world-facts.js (read its header and ${S}/work/data/notes.md). Your job is to BREAK it: write
your own scripts (in ${S}/work/quiz/attack-<yourlens>/, never edit quiz.js or its tests) and report only
problems you have demonstrated with a runnable input. The builder reported:
${String(build).slice(0, 5000)}
`
const reviews = await parallel([
  () => agent(base + `
YOUR LENS: typed-answer matching. Hunt for inputs a real player would type that are wrongly accepted for a
different country, wrongly rejected, or accepted ambiguously: every pair of confusable names (Niger/Nigeria,
Guinea / Guinea-Bissau / Equatorial Guinea / Papua New Guinea, the two Congos, Dominica / Dominican
Republic, Austria/Australia, Iran/Iraq, Slovakia/Slovenia, Gambia/Zambia, Mali/Malawi/Malta, Sudan / South
Sudan, the Koreas, Georgia, Samoa, Ireland/Iceland, Latvia/Lithuania, Libya/Liberia, Mauritius/Mauritania,
Switzerland/Swaziland/Eswatini, Paraguay/Uruguay, India/Indonesia, Chad/Chile/China, Oman/Omsk-like short
names …), common misspellings and phonetic spellings a child would write, other-language names, keyboard
slips, pasted text with odd whitespace or Unicode look-alikes, right-to-left marks, emoji, very long input,
prototype-polluting keys ("__proto__", "constructor"), and the restrictTo option. Check the fold function
against real-world spellings (Côte d'Ivoire, São Tomé and Príncipe, Türkiye, Curaçao-style letters, "St
Kitts & Nevis", "The Gambia"). Measure the per-call cost on 250 entries. Also judge the POLICY: is accepting
1-edit and 2-edit near matches under the stated uniqueness rule safe on this data? Show the worst accepted
near-misses.`, { label: 'attack:typed', phase: 'Attack', schema: FINDINGS }),
  () => agent(base + `
YOUR LENS: capitals, flags and level building. Brute-force capitalChoices over every country, several pools
(its continent, the world, tiny pools of 1-3 countries, pools containing unknown names) and thousands of
seeds: any rule violation, duplicate, missing answer, non-uniform answer position, infinite loop or crash is
a finding. Check capitalPrompt's "trivial" flag against every country by hand-built expectation. Check
isCapital with alternates, accents and odd spacing. Check levels(): every askable country appears exactly
once per kind per region, keys are stable and unique, exclusions are right. Flags: run the flag check
through the harness yourself (${S}/BRIEF.md), verify flagEmoji for every ISO code in the data, verify the
missing-glyph list by rendering (compare each flag's pixels to the fallback-letter rendering), test
flagSupport when the font request is blocked and when the font is slow, and confirm the font file's licence
text is what the spec says (read the package's LICENSE and README).`, { label: 'attack:capitals-flags', phase: 'Attack', schema: FINDINGS }),
])
const all = reviews.filter(Boolean).flatMap(r => r.findings)
log('Quiz attack findings: ' + all.length)

phase('Harden')
const harden = await agent(`
Read ${S}/BRIEF.md and ${S}/work/quiz/SPEC.md. The module ${S}/work/quiz/quiz.js was attacked by two
reviewers. For each finding below, run their evidence; if it is real, fix quiz.js (or the data usage rule)
at the root and add a regression check to test-quiz.js; if it is not real, say why. Where a finding is about
policy (what should count as a near match), choose the safer behaviour for a learning app used by children:
never credit an answer to the wrong country; prefer rejecting an ambiguous near-miss. Do not edit anything
under /home/user/atlas-game or ${S}/work/data/world-facts.js (report data problems instead). Finish with all
tests passing and update NOTES.md so it describes the module as it now is.

Findings (JSON):
${JSON.stringify(all, null, 1)}

Return: per finding fixed / not real / deferred with evidence; final test numbers; the final API; anything
the UI integration must know (including which countries are excluded from which kinds of level and why).`,
  { label: 'quiz:harden', phase: 'Harden' })

return { build: String(build).slice(0, 6000), findings: all, harden: String(harden).slice(0, 8000) }
