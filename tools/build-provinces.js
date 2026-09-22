#!/usr/bin/env node
// Builds public/data/provinces-<country>.json (TopoJSON) from Natural
// Earth's 10m admin_1 states/provinces dataset.
//
// This is one-time data prep, not part of the app runtime — the game just
// fetches the generated files. Re-run it only when adding a country or
// changing names/groupings below.
//
// Usage:
//   curl -L -o /tmp/ne_admin1.geojson \
//     https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson
//   node tools/build-provinces.js /tmp/ne_admin1.geojson
//
// Requires npx (ships with npm). mapshaper is fetched on first run — it
// does the topology-aware simplification (shared borders between provinces
// get simplified once, so neighbors never drift apart into gaps/overlaps).

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const OUT_DIR = path.join(__dirname, '..', 'public', 'data');

/* ===== Russia: display names + round groups =====
 * Natural Earth's own names are dated transliterations ("Maga Buryatdan"
 * for Magadan, "Chita" for Zabaykalsky Krai) and its `region` field puts
 * the North Caucasus under Volga, so every federal subject is mapped by
 * adm1_code here. Groups split the 83 subjects into three bite-size rounds
 * along federal-district lines:
 *   west  = Central + Northwestern districts        (29)
 *   south = Southern + North Caucasian + Volga      (27)
 *   east  = Ural + Siberian + Far Eastern           (27)
 * Crimea (RUS-283) and Sevastopol (RUS-5482) are dropped: the game follows
 * internationally recognized borders there. RUS+99? is an unnamed Arctic
 * islet with no admin identity.
 */
const RUSSIA = {
  // Central
  'RUS-2343': ['Smolensk Oblast', 'west'],
  'RUS-2342': ['Bryansk Oblast', 'west'],
  'RUS-2362': ['Kursk Oblast', 'west'],
  'RUS-2370': ['Belgorod Oblast', 'west'],
  'RUS-2377': ['Voronezh Oblast', 'west'],
  'RUS-2363': ['Lipetsk Oblast', 'west'],
  'RUS-2375': ['Tambov Oblast', 'west'],
  'RUS-2366': ['Oryol Oblast', 'west'],
  'RUS-2361': ['Kaluga Oblast', 'west'],
  'RUS-2356': ['Kostroma Oblast', 'west'],
  'RUS-2360': ['Yaroslavl Oblast', 'west'],
  'RUS-2376': ['Vladimir Oblast', 'west'],
  'RUS-2374': ['Ryazan Oblast', 'west'],
  'RUS-2355': ['Ivanovo Oblast', 'west'],
  'RUS-2368': ['Tula Oblast', 'west'],
  'RUS-2358': ['Tver Oblast', 'west'],
  'RUS-2364': ['Moscow Oblast', 'west'],
  'RUS-2365': ['Moscow', 'west'],
  // Northwestern
  'RUS-2335': ['Pskov Oblast', 'west'],
  'RUS-2333': ['Murmansk Oblast', 'west'],
  'RUS-2353': ['Karelia', 'west'],
  'RUS-2336': ['Leningrad Oblast', 'west'],
  'RUS-2324': ['Kaliningrad Oblast', 'west'],
  'RUS-2381': ['Nenets Okrug', 'west'],
  'RUS-2337': ['Saint Petersburg', 'west'],
  'RUS-2354': ['Arkhangelsk Oblast', 'west'],
  'RUS-2359': ['Vologda Oblast', 'west'],
  'RUS-2334': ['Novgorod Oblast', 'west'],
  'RUS-2383': ['Komi Republic', 'west'],
  // Southern
  'RUS-2371': ['Krasnodar Krai', 'south'],
  'RUS-2367': ['Rostov Oblast', 'south'],
  'RUS-2388': ['Astrakhan Oblast', 'south'],
  'RUS-2369': ['Volgograd Oblast', 'south'],
  'RUS-2390': ['Kalmykia', 'south'],
  'RUS-2279': ['Adygea', 'south'],
  // North Caucasian
  'RUS-2280': ['Karachay-Cherkessia', 'south'],
  'RUS-2304': ['Kabardino-Balkaria', 'south'],
  'RUS-2305': ['North Ossetia', 'south'],
  'RUS-2303': ['Ingushetia', 'south'],
  'RUS-2416': ['Chechnya', 'south'],
  'RUS-2417': ['Dagestan', 'south'],
  'RUS-2306': ['Stavropol Krai', 'south'],
  // Volga
  'RUS-2391': ['Orenburg Oblast', 'south'],
  'RUS-2393': ['Saratov Oblast', 'south'],
  'RUS-2378': ['Bashkortostan', 'south'],
  'RUS-2394': ['Tatarstan', 'south'],
  'RUS-2395': ['Ulyanovsk Oblast', 'south'],
  'RUS-2373': ['Penza Oblast', 'south'],
  'RUS-2372': ['Mordovia', 'south'],
  'RUS-2357': ['Nizhny Novgorod Oblast', 'south'],
  'RUS-2389': ['Chuvashia', 'south'],
  'RUS-2385': ['Mari El', 'south'],
  'RUS-2384': ['Kirov Oblast', 'south'],
  'RUS-2387': ['Udmurtia', 'south'],
  'RUS-3200': ['Perm Krai', 'south'],
  'RUS-2392': ['Samara Oblast', 'south'],
  // Ural
  'RUS-2398': ['Tyumen Oblast', 'east'],
  'RUS-2380': ['Kurgan Oblast', 'east'],
  'RUS-2379': ['Chelyabinsk Oblast', 'east'],
  'RUS-2382': ['Yamalo-Nenets Okrug', 'east'],
  'RUS-2386': ['Sverdlovsk Oblast', 'east'],
  'RUS-2396': ['Khanty-Mansi Okrug', 'east'],
  // Siberian
  'RUS-2400': ['Altai Republic', 'east'],
  'RUS-2605': ['Tuva', 'east'],
  'RUS-2397': ['Omsk Oblast', 'east'],
  'RUS-2403': ['Novosibirsk Oblast', 'east'],
  'RUS-2399': ['Altai Krai', 'east'],
  'RUS-2603': ['Krasnoyarsk Krai', 'east'],
  'RUS-2167': ['Tomsk Oblast', 'east'],
  'RUS-2401': ['Kemerovo Oblast', 'east'],
  'RUS-2602': ['Irkutsk Oblast', 'east'],
  'RUS-2402': ['Khakassia', 'east'],
  // Far Eastern
  'RUS-2606': ['Buryatia', 'east'],
  'RUS-2610': ['Zabaykalsky Krai', 'east'],
  'RUS-2609': ['Amur Oblast', 'east'],
  'RUS-2613': ['Jewish Autonomous Oblast', 'east'],
  'RUS-2614': ['Khabarovsk Krai', 'east'],
  'RUS-2611': ['Primorsky Krai', 'east'],
  'RUS-2615': ['Magadan Oblast', 'east'],
  'RUS-2616': ['Sakhalin Oblast', 'east'],
  'RUS-2321': ['Chukotka', 'east'],
  'RUS-2612': ['Sakha (Yakutia)', 'east'],
  'RUS-3468': ['Kamchatka Krai', 'east']
};
const RUSSIA_DROPPED = new Set(['RUS-283', 'RUS-5482', 'RUS+99?']);

/* ===== Per-country build config =====
 * sources:      Natural Earth adm0_a3 codes to pull features from
 * expected:     feature count after merge — the build fails if it's off
 * interval:     simplification tolerance in meters (bigger = coarser)
 * islandMinArea: drop detached islands smaller than this (null = keep all)
 */
const COUNTRIES = {
  canada: {
    sources: ['CAN'],
    expected: 13,
    interval: 1200,
    islandMinArea: '150km2',
    rename: { 'Québec': 'Quebec' }
  },
  china: {
    // Hong Kong and Macau are separate adm0 units in Natural Earth; they're
    // pulled in here as China's two SARs. Hong Kong's 18 districts are
    // dissolved into one feature by name. Taiwan stays out (the game already
    // treats it as its own country in world mode).
    sources: ['CHN', 'HKG', 'MAC'],
    expected: 33,
    interval: 600,
    // Macau is ~30 km² and detached from the mainland in NE — keep the bar low
    islandMinArea: '2km2',
    drop: ['Paracel Islands'],
    rename: { 'Inner Mongol': 'Inner Mongolia', 'Xizang': 'Tibet' },
    wholeUnit: { HKG: ['CHN-HKG', 'Hong Kong'], MAC: ['CHN-MAC', 'Macau'] }
  },
  india: {
    sources: ['IND'],
    expected: 36,
    interval: 400,
    // Lakshadweep is nothing but tiny islands — an area filter would erase it
    islandMinArea: null,
    rename: { 'Andaman and Nicobar': 'Andaman and Nicobar Islands' }
  },
  russia: {
    sources: ['RUS'],
    expected: 83,
    interval: 1200,
    islandMinArea: '150km2',
    byCode: RUSSIA,
    dropCodes: RUSSIA_DROPPED
  }
};

// Turn one Natural Earth feature into { id, name, group? } or null (drop)
function prepFeature(f, cfg) {
  const p = f.properties;
  const a3 = p.adm0_a3;

  if (cfg.wholeUnit && cfg.wholeUnit[a3]) {
    const [id, name] = cfg.wholeUnit[a3];
    return { id, name };
  }
  if (cfg.byCode) {
    if (cfg.dropCodes && cfg.dropCodes.has(p.adm1_code)) return null;
    const entry = cfg.byCode[p.adm1_code];
    if (!entry) throw new Error('Unmapped feature ' + p.adm1_code + ' (' + p.name + ')');
    return { id: p.adm1_code, name: entry[0], group: entry[1] };
  }
  if (cfg.drop && cfg.drop.indexOf(p.name) !== -1) return null;
  const name = (cfg.rename && cfg.rename[p.name]) || p.name;
  if (!name) throw new Error('Feature with no name: ' + p.adm1_code);
  return { id: p.adm1_code, name };
}

function buildCountry(key, cfg, allFeatures, tmpDir) {
  const features = [];
  allFeatures.forEach(f => {
    if (cfg.sources.indexOf(f.properties.adm0_a3) === -1) return;
    const props = prepFeature(f, cfg);
    if (props) features.push({ type: 'Feature', properties: props, geometry: f.geometry });
  });

  const inPath = path.join(tmpDir, key + '.geojson');
  fs.writeFileSync(inPath, JSON.stringify({ type: 'FeatureCollection', features }));

  const outPath = path.join(OUT_DIR, 'provinces-' + key + '.json');
  const copyFields = cfg.byCode ? 'id,group' : 'id';
  const args = [
    '--yes', 'mapshaper@0.6', inPath,
    // fields= must be explicit: a bare "name" collides with mapshaper's own name= option
    '-dissolve', 'fields=name', 'copy-fields=' + copyFields,
    '-rename-layers', 'provinces'
  ];
  if (cfg.islandMinArea) args.push('-filter-islands', 'min-area=' + cfg.islandMinArea);
  args.push(
    '-simplify', 'interval=' + cfg.interval, 'keep-shapes',
    '-o', outPath, 'format=topojson', 'quantization=100000', 'id-field=id', 'force'
  );
  execFileSync('npx', args, { stdio: ['ignore', 'ignore', 'inherit'] });

  // Sanity-check the output: right count, unique names, no emptied geometry
  const topo = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  const geoms = topo.objects.provinces.geometries;
  const names = geoms.map(g => g.properties.name);
  const empty = geoms.filter(g => !g.type).map(g => g.properties.name);
  if (geoms.length !== cfg.expected) {
    throw new Error(key + ': expected ' + cfg.expected + ' features, got ' + geoms.length);
  }
  if (new Set(names).size !== names.length) throw new Error(key + ': duplicate names');
  if (empty.length) throw new Error(key + ': geometry lost for ' + empty.join(', '));

  const kb = (fs.statSync(outPath).size / 1024).toFixed(0);
  console.log(key.padEnd(8) + geoms.length + ' features, ' + kb + ' KB -> ' + path.relative(process.cwd(), outPath));
}

function main() {
  const src = process.argv[2];
  if (!src || !fs.existsSync(src)) {
    console.error('Usage: node tools/build-provinces.js <ne_10m_admin_1_states_provinces.geojson> [country ...]');
    process.exit(1);
  }
  const only = process.argv.slice(3);
  const allFeatures = JSON.parse(fs.readFileSync(src, 'utf8')).features;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-provinces-'));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  Object.keys(COUNTRIES).forEach(key => {
    if (only.length && only.indexOf(key) === -1) return;
    buildCountry(key, COUNTRIES[key], allFeatures, tmpDir);
  });
}

main();
