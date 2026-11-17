p = '/home/user/atlas-game/public/index.html'
s = open(p, encoding='utf8').read()


def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:80])
    s = s.replace(old, new)


rep("""  // The world map rounds are played on: Natural Earth at 1:50m, where
  // coastlines and the smallest countries still look right zoomed in
  const WORLD_URL = '/data/countries-50m.json';
""", """  // The world map rounds are played on: Natural Earth at 1:50m, where
  // coastlines and the smallest countries still look right zoomed in
  const WORLD_URL = '/data/countries-50m.json';
  // The same world at 1:110m, a seventh of the size: what the globe shows
  // while the detailed map is on its way (see showOpeningGlobe)
  const WORLD_SKETCH_URL = '/data/countries-110m.json';
""")

rep("""  // Fetch the world map and index its countries by key and canonical name
  async function loadWorldFeatures() {
""", """  // The coarse world map as { features, borders }: scenery only, never played on
  async function loadWorldSketch() {
    const res = await fetch(WORLD_SKETCH_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const topology = await res.json();
    const countries = topology.objects.countries;
    return {
      features: topojson.feature(topology, countries).features.filter(f => featureName(f)),
      borders: topojson.mesh(topology, countries)
    };
  }

  // Fetch the world map and index its countries by key and canonical name
  async function loadWorldFeatures() {
""")

rep("""  async function init() {
    try {
      state.worldLoading = loadWorldFeatures();
      await state.worldLoading;

      refreshView();
      initGlobe();
      openLinkedLevel();
""", """  async function init() {
    const link = linkedLevel();
    try {
      state.worldLoading = loadWorldFeatures();
      // A level link leads straight to the map, so the globe goes up at
      // once (not for a Daily Five already played: that link ends on Home)
      if (link && link.arg && !(link.arg === 'daily-five' && getDailyAttempt(todayUtcKey()))) showOpeningGlobe();
      await state.worldLoading;

      refreshView();
      initGlobe();
      openLinkedLevel(link);
""")

rep("""    } catch (err) {
      console.error(err);
      state.worldFailed = true;
      refreshView();
    }
  }
""", """    } catch (err) {
      console.error(err);
      state.worldFailed = true;
      if (document.getElementById('game-screen').classList.contains('is-opening')) {
        hideLoadingOverlay();
        switchScreen('menu');
      }
      refreshView();
    }
  }

  // Puts the globe on screen, alone, with the coarse world map, while the
  // detailed map a linked level is played on loads. The round's own start
  // takes over from there (setGameChrome brings the rest of the screen in).
  function showOpeningGlobe() {
    loadWorldSketch().then(sketch => {
      if (state.allFeatures.length || state.worldFailed) return;    // the detailed map got here first
      map.sketch = sketch;
      initGlobe();
      map.globe.resetStyles('world', 'land');
      map.globe.setView({ lon: WORLD_VIEW.lon, lat: WORLD_VIEW.lat, k: 1 });
      document.getElementById('game-screen').classList.add('is-opening');
      switchScreen('game');
      showLoadingOverlay('Loading the map');
    }).catch(() => { /* the detailed map will do */ });
  }
""")

a = s.index("""  function openLinkedLevel() {""")
b = s.index("""  async function startGame(regionOrMode, opts) {""")
end = s.index("\n  }\n", a) + 5
tail = s[end:b]
s = s[:a] + """  function linkedLevel() {
    let params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { return null; }
    const slug = (params.get('play') || '').toLowerCase();
    if (!slug) return null;
    const startArg = linkSlugs()[slug];
    const level = startArg ? levelForStartArg(startArg) : null;
    if (!startArg || (level && !level.available)) {
      return { refused: level ? level.title + ' isn’t ready to play yet.' : 'That link doesn’t lead to a level.' };
    }
    return { arg: startArg, opts: params.get('learn') === '1' && PROVINCE_ROUNDS[startArg] ? { learn: true } : null };
  }

  // Acts on what linkedLevel() found: starts the round, or says why not
  function openLinkedLevel(link) {
    if (!link) return;
    if (link.refused) {
      setAddressBar(baseUrl());
      showNotice(link.refused);
      return;
    }
    startGame(link.arg, link.opts);
  }
""" + tail + s[b:]

rep("""  function refuseLevel(level) {
    switchScreen('menu');""", """  function refuseLevel(level) {
    hideLoadingOverlay();
    switchScreen('menu');""")

rep("""  function initGlobe() {
    if (map.globe) return;
""", """  function initGlobe() {
    if (map.globe) { syncMapLayers(); return; }
""")
rep("""    const layers = [{ id: 'world', features: state.allFeatures, key: featureKey, borders: state.worldBorders, style: 'dim' }];
""", """    // Until the detailed world is in, the coarse one stands in for it
    const world = state.allFeatures.length ? { features: state.allFeatures, borders: state.worldBorders } : map.sketch;
    const layers = [{ id: 'world', features: world.features, key: featureKey, borders: world.borders, style: 'dim' }];
""")
rep("""  .globe-host { position: absolute; left: 0; right: 0; top: 0; bottom: 0; }
""", """  .globe-host { position: absolute; left: 0; right: 0; top: 0; bottom: 0; }
  /* A level link's first moments: the globe alone, while its map loads */
  #game-screen.is-opening > :not(.stage) { visibility: hidden; }
""")
rep("""    provinces: null,       // the province store whose map is the 'prov' layer
""", """    provinces: null,       // the province store whose map is the 'prov' layer
    sketch: null,          // the coarse world map, shown until the detailed one is in (see showOpeningGlobe)
""")
open(p, 'w', encoding='utf8').write(s)
print('patched')
