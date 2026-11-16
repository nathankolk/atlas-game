// Builds localStorage seeds for screenshots and checks:
//   seed-rich.json  a regular player: mastery, records, focus lists, daily week, pin history, a Learn ladder
//   seed-old.json   a player from before mastery existed: records, focus, daily and pin stores only
// Names come from the running app, so the seeds always match the game's own item names.
'use strict';
const path = require('path');
const fs = require('fs');
const S = path.resolve(__dirname, '../../..');
const { launch } = require(path.join(S, 'harness/atlas-harness.js'));
(async () => {
  const h = await launch({ width: 1280, height: 800 });
  await h.page.goto(h.url);
  await h.page.waitForFunction(() => window.__atlas && window.__atlas.state.allFeatures.length > 0);
  const out = await h.page.evaluate(async () => {
    const A = window.__atlas;
    await Promise.all(A.LEVELS.filter(l => l.available).map(l => l.load()));
    let seedN = 12345;
    const rnd = () => { seedN = (seedN * 1664525 + 1013904223) >>> 0; return seedN / 4294967296; };
    const today = A.mastery.today();
    const names = {};
    A.LEVELS.forEach(l => { names[l.key] = l.names(); });

    // ---- mastery: share = fraction seen; of the seen, a spread over the boxes, some due
    const items = {};
    const fill = (skill, list, share, dueShare) => {
      items[skill] = items[skill] || {};
      list.forEach(name => {
        if (rnd() > share) return;
        const r = rnd();
        const box = r < 0.5 ? 5 : r < 0.62 ? 4 : r < 0.78 ? 3 : r < 0.9 ? 2 : 1;
        const interval = [0, 1, 3, 7, 16, 35][box];
        const due = rnd() < dueShare;
        const last = due ? today - interval - Math.floor(rnd() * 3) : today - Math.floor(rnd() * Math.max(1, interval - 1));
        const first = box + Math.floor(rnd() * 3), second = box < 4 ? 1 + Math.floor(rnd() * 2) : 0, missed = box < 3 ? 1 + Math.floor(rnd() * 2) : 0;
        items[skill][name] = [last, box, first, box, second, missed];
      });
    };
    fill('country', names.world, 0.92, 0.07);
    fill('us-state', names['us-state'], 1, 0.08);
    fill('us-capital', names['us-state'], 0.9, 0.1);
    fill('us-city', names['northeast-cities'], 0.6, 0.1);
    fill('province:canada', names['canada-provinces'], 1, 0);
    fill('province:china', names['china-provinces'], 0.8, 0.12);
    fill('province:india', names['india-states'], 0.7, 0.15);
    fill('province:russia', names['russia-west'], 0.4, 0.2);
    fill('city-pin', names['pin-world'], 0.6, 0.1);
    // Canada: everything mastered
    Object.keys(items['province:canada']).forEach(n => { items['province:canada'][n] = [today - 3, 5, 7, 7]; });
    const days = {};
    let g = 0, q = 0, f = 0, sec = 0;
    for (let d = today - 60; d <= today; d++) {
      if (d < today - 11 && rnd() < 0.35) continue;   // a 12-day run ending today, patchier before
      const games = 1 + Math.floor(rnd() * 4), questions = games * (8 + Math.floor(rnd() * 30));
      const firstTry = Math.round(questions * (0.78 + rnd() * 0.16)), seconds = Math.round(questions * (5 + rnd() * 4));
      days[d] = [games, questions, firstTry, seconds];
      g += games; q += questions; f += firstTry; sec += seconds;
    }
    const mastery = { v: 2, items: items, days: days, life: [g, q, f, sec, Object.keys(days).length, 23, today, 12] };

    // ---- records, keyed exactly as the game keys them
    const date = (back) => new Date(Date.now() - back * 86400000).toISOString();
    const rec = (correct, total, time, games, back) => ({
      bestScore: { value: correct * 2 - 3 < 0 ? correct * 2 : correct * 2 - (correct === total ? 0 : 3), max: total * 2, date: date(back) },
      bestTime: correct === total ? { value: time, date: date(back) } : undefined,
      bestAccuracy: { pct: Math.round(correct / total * 100), correct: correct, total: total, date: date(back) },
      gamesPlayed: games, lastPlayed: date(back)
    });
    const N = k => names[k].length;
    const records = {
      'world-country|World|normal': rec(171, N('world'), 0, 9, 2),
      'world-country|Africa|normal': rec(49, N('africa'), 0, 14, 2),
      'world-country|Africa|hard': rec(47, N('africa'), 0, 6, 9),
      'world-country|Asia|normal': rec(43, N('asia'), 0, 7, 5),
      'world-country|Europe|normal': rec(N('europe'), N('europe'), 151, 11, 1),
      'world-country|Europe|hard': rec(N('europe'), N('europe'), 187, 4, 12),
      'world-country|Europe|uncharted': rec(31, N('europe'), 0, 2, 20),
      'world-country|North America|normal': rec(22, N('north-america'), 0, 5, 6),
      'world-country|South America|normal': rec(N('south-america'), N('south-america'), 49, 8, 3),
      'world-country|Oceania|normal': rec(6, N('oceania'), 0, 3, 8),
      'us-state|The United States|normal': rec(50, 50, 108, 12, 1),
      'us-capital-to-state|US Capitals → States|normal': rec(44, 50, 0, 4, 4),
      'us-state-to-capital|US States → Capitals|normal': rec(41, 50, 0, 3, 7),
      'us-city|Northeast|normal': rec(31, N('northeast-cities'), 0, 2, 10),
      'province|canada-provinces|normal': rec(13, 13, 38, 6, 3),
      'province|china-provinces|normal': rec(24, 33, 0, 3, 5),
      'province|india-states|normal': rec(21, 36, 0, 2, 11)
    };
    Object.keys(records).forEach(k => { if (!records[k].bestTime) delete records[k].bestTime; });

    const pick = (list, n) => list.slice().sort(() => rnd() - 0.5).slice(0, n);
    const focus = {
      'world-country|Africa': { names: pick(names.africa, 7), total: N('africa'), savedAt: Date.now() - 2 * 86400000 },
      'province|china-provinces': { names: pick(names['china-provinces'], 9), total: 33, savedAt: Date.now() - 5 * 86400000 },
      'us-capital-to-state|US Capitals → States': { names: pick(names['us-state'], 6), total: 50, savedAt: Date.now() - 4 * 86400000 }
    };

    // ---- daily: played today and most of the last week
    const key = back => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - back); return d.toISOString().slice(0, 10); };
    const seqs = [[2, 2, 1, 2, 0], [2, 2, 2, 2, 2], [2, 2, 2, 1, 2], [2, 2, 2, 2, 2], [2, 1, 2, 0, 1], [2, 2, 2, 2, 2], [2, 2, 2, 2, 1]];
    const daily = {};
    seqs.forEach((sequence, back) => {
      const score = sequence.reduce((a, b) => a + b, 0);
      daily[key(back)] = { correct: sequence.filter(p => p > 0).length, total: 5, score: score, sequence: sequence, puzzleNumber: 205 - back, difficulty: 'normal', hardMode: false, at: Date.now() - back * 86400000 };
    });
    const dailyUnplayed = Object.assign({}, daily);
    delete dailyUnplayed[key(0)];

    const pinGames = [];
    [['World', 1712, 198], ['Europe', 1904, 84], ['North America', 1836, 126], ['Asia', 1688, 212], ['Africa', 1512, 310]].forEach((row, i) => {
      for (let n = 0; n < 3; n++) pinGames.push({ at: Date.now() - (i + n * 3 + 1) * 86400000, region: row[0], diff: 'normal', score: row[1] - n * 60, max: 2000, avgKm: row[2] + n * 20 });
    });
    const pin = { games: pinGames.sort((a, b) => a.at - b.at), cities: {} };
    const learn = { 'russia-south': { order: names['russia-south'].slice(), level: 9, savedAt: Date.now() - 86400000 } };

    const str = o => JSON.stringify(o);
    return {
      rich: { 'atlas-mastery': str(mastery), 'atlas-records': str(records), 'atlas-focus': str(focus), 'atlas-daily-attempts': str(daily), 'atlas-pin': str(pin), 'atlas-learn': str(learn) },
      richUnplayed: { 'atlas-mastery': str(mastery), 'atlas-records': str(records), 'atlas-focus': str(focus), 'atlas-daily-attempts': str(dailyUnplayed), 'atlas-pin': str(pin), 'atlas-learn': str(learn) },
      old: { 'atlas-records': str(records), 'atlas-focus': str(focus), 'atlas-daily-attempts': str(dailyUnplayed), 'atlas-pin': str(pin), 'atlas-hard-mode': 'false' }
    };
  });
  fs.writeFileSync(path.join(__dirname, 'seed-rich.json'), JSON.stringify(out.rich));
  fs.writeFileSync(path.join(__dirname, 'seed-rich-unplayed.json'), JSON.stringify(out.richUnplayed));
  fs.writeFileSync(path.join(__dirname, 'seed-old.json'), JSON.stringify(out.old));
  console.log('seeds written; page errors:', h.errors.length);
  await h.close();
})().catch(e => { console.error(e); process.exit(1); });
