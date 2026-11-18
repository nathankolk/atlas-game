# Replaces the Explore stage's IN PROGRESS status in progress.md with the finished record
import io, sys
p = sys.argv[1]
t = io.open(p, encoding='utf-8').read()

def swap(old, new):
    global t
    assert t.count(old) == 1, (t.count(old), old[:60])
    t = t.replace(old, new)

swap("Status: IN PROGRESS (started 2026-11-17 16:40 UTC from 4bf934c, tree clean, nothing of this stage existed).",
     "Status: DONE. Built 2026-11-17 16:40–17:16 UTC from 4bf934c (commits 1628408, 8a4be64, e97df55, fd779a9, all pushed).\n"
     "The first agent was stopped during its last suite run; a second agent finished that run at 21:15 UTC and wrote the\n"
     "final state below. The second agent changed nothing in the repo: public/index.html is byte for byte fd779a9's.")
swap("### State at 18:25 UTC (commits 1628408 Learn, 8a4be64 + e97df55 + fd779a9 Explore; all pushed, tree clean)",
     "### What was built (commits 1628408 Learn; 8a4be64, e97df55, fd779a9 Explore)")
swap("DONE in public/index.html and verified by `explore/check-explore.js` (desktop 185+ and --mobile 185 on e97df55; the\n"
     "groups touched since were re-run):",
     "In public/index.html, verified by `explore/check-explore.js` (192 desktop, 192 phone on the final tree):")
swap("REMAINING: full suite chain on the final tree (`explore/run-suites.sh` -> `explore/suites.log`), fix what it\n"
     "finds (expected: check-shell / check-stats may count nav links or panels), final screenshots looked at, report.\n",
     "")
swap("  `explore/run-suites.sh` (every suite; writes explore/suites.log and explore/suites/*.log).\n",
     "  `explore/run-suites.sh` (every suite; writes explore/suites.log and explore/suites/*.log), `explore/run-rest.sh`\n"
     "  (the suites the stopped run had not finished; writes explore/rest.log and explore/suites-rest/*.log).\n"
     "\n"
     "### Final state of this stage\n"
     "Every suite passes on the final tree (public/index.html sha1 a3744e01…, the file of fd779a9; HEAD 1330e48 adds only\n"
     "wip/ snapshots). Two runs make up the record, both on that same file:\n"
     "- Run of 17:19–17:58 UTC (`explore/suites.log`), suites not touched since: stats 168 desktop / 170 phone, settings\n"
     "  93 / 93, globe 123 / 121, modes 163 / 170, smoke desktop 13.\n"
     "- Run of 20:44–21:15 UTC (`explore/rest.log`): shell 246 desktop / 242 phone, game 110 desktop / 115 phone, edges 37,\n"
     "  smoke phone 13, explore 192 / 192, logic: syntax ok, the five paste checks (mastery, globe, quiz, world facts, flag\n"
     "  font), t1 38, t2 46, t3 40, t4 67, t5 4, t6 7, t7 (records function) passed, v-b4-learn 10.\n"
     "Expectations that were out of date with an intended change, corrected in the suites (the app was not changed for\n"
     "any of them, and no check was weakened):\n"
     "- `shell/check-shell.js` (before: `check-shell.before-explore.js`): a new continent level's sheet offers Play and\n"
     "  Learn (was Play only); Africa with a focus list offers Play, Focus Practice and Learn.\n"
     "- `game/check-game.js` (phone HUD layout) and `globe-stage/check-edges.js`: `.mapctl` became ambiguous once Explore\n"
     "  had its own map controls; both now read `#game-screen .mapctl`.\n"
     "- `logic-tests/t3-links-b4-d6.js` (before: `t3-links-b4-d6.before-explore.js`): `?play=europe&learn=1` used to be the\n"
     "  case of a level without Learn; it now opens Europe's ladder, so the test asserts that, and uses\n"
     "  `?play=world&learn=1` for the level without one (a plain round of 184). It had timed out waiting for a question.\n"
     "Screenshots (`$S/shots/app/explore/`, 113 files, desktop and phone, both themes; taken by the first agent between\n"
     "16:47 and 17:17 UTC, so the desktop light colour, satellite and search shots predate e97df55 and fd779a9). The second\n"
     "agent opened twelve and found nothing to fix: Explore open (desktop light), France (desktop light: ten borders with\n"
     "Brazil and Suriname, Andorra and Monaco named below the chips), Barbados (phone light: \"No land borders.\"), Germany\n"
     "(phone dark), colour by Capital (desktop dark and light, legend counts), satellite coloured with Egypt selected\n"
     "(phone light, Esri credit showing), search results (phone light), the Stats chips (phone light), Learn study for\n"
     "Europe (desktop dark) and Africa (phone light), Learn quiz for Europe (phone dark).\n"
     "Neighbours: the suite's hand-checked table (26 countries with borders, 13 islands, and the full list of 28 with no\n"
     "land border) was read against an atlas again by the second agent; no disagreement.\n"
     "\n"
     "Not done / not verified:\n"
     "- Real Esri imagery, the live site, Safari, Firefox and real touch devices: not reachable here. Satellite in\n"
     "  Explore was only seen over the harness's stand-in tiles.\n"
     "- The place card as a live region was checked by its attributes in the suite, not with a screen reader.\n"
     "- Not every screenshot was opened by the second agent (12 of 113); the dark phone search and Stats-arrival shots do\n"
     "  not exist (the shoot script skips them), and the landscape-phone and 800x700 shots were not opened again.\n"
     "- Stats, settings, globe, modes and desktop smoke were not re-run after 17:58 UTC; they passed on the same file.\n"
     "- Learn study on a phone turns the globe to the newest name, so on a long ladder (Africa, level 22) earlier names\n"
     "  can be off screen until the player drags; this is how the province ladders already behaved.\n"
     "- `state.learn`'s comment in the state object still says \"province ladder\" (index.html, `learn: null`); it is\n"
     "  the Learn run for any level with a ladder. Left for the polish stage rather than change the file after the run.\n"
     "- atlas_handoff.md does not describe Explore or the wider Learn; CLAUDE.md does.\n")
io.open(p, 'w', encoding='utf-8').write(t)
print('written', len(t))
