  /* =========================================================
   * MAP (the globe a round is played on)
   *
   * One globe lives in #globe-host for the whole visit. Each map file is
   * a layer, built once; a round shows the layers it needs and paints
   * them. Whatever a round puts on the map is kept here as plain data
   * (marks, the place being revealed, outlines), so the picture can be
   * painted again at any time: after a change of theme or map style,
   * when a layer's features are swapped, or for "View on the map".
   * ========================================================= */

  const map = {
    globe: null,
    layer: 'world',        // the layer the round in play is answered on
    eligible: new Set(),   // keys of the features this round can ask for
    marks: new Map(),      // feature key -> 'found' | 'second' | 'missed', for the rest of the round
    shown: new Map(),      // feature key -> a style that overrides its mark for a moment
    outlines: [],          // { feature, kind, until }: shapes drawn over the map
    reveal: null,          // { lonlat, start }: rings pulsing where a missed answer is
    home: null,            // the view the round opened on
    clear: null,           // what the HUD leaves free, in the host's px: { left, right, top, bottom }
    ink: {},               // the map's colours for what is drawn over it
    round: 0               // state.roundId of the round the map was last made ready for
  };

  // Where a continent's round opens: [west, east, south, north]. A fit to
  // the countries themselves would follow their far-flung territories
  // (Europe's reach from the Caribbean to the Bering Strait).
  const CONTINENT_FRAMES = {
    'Africa': [-20, 53, -36, 38],
    'Asia': [26, 146, -11, 55],
    'Europe': [-25, 45, 34, 72],
    'North America': [-170, -52, 7, 72],
    'South America': [-82, -34, -56, 13],
    'Oceania': [112, 180, -48, 0]
  };
  const WORLD_VIEW = { lon: 15, lat: 20 };   // where a whole-world round opens

  // True for the modes drawn on the globe; the rest still use the SVG map
  function playedOnGlobe(mode) {
    return mode === 'world-country' || mode === 'daily-five';
  }

  // A CSS colour as [r, g, b, a]: r, g and b 0–255, a 0–1
  function cssRgba(value) {
    const ctx = cssRgba.ctx || (cssRgba.ctx = document.createElement('canvas').getContext('2d'));
    ctx.fillStyle = '#000';
    ctx.fillStyle = value;
    const s = ctx.fillStyle;      // '#rrggbb' when opaque, 'rgba(r, g, b, a)' otherwise
    if (s.charAt(0) === '#') return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 1];
    const m = s.match(/[\d.]+/g).map(Number);
    return [m[0], m[1], m[2], m.length > 3 ? m[3] : 1];
  }

  function rgbaCss(c) {
    return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + c[3] + ')';
  }

  // `share` of colour a over colour b, see-through parts counted as such
  function mixRgba(a, b, share) {
    const wa = a[3] * share, wb = b[3] * (1 - share), alpha = wa + wb;
    if (!alpha) return [0, 0, 0, 0];
    return [0, 1, 2].map(i => (a[i] * wa + b[i] * wb) / alpha).concat(alpha);
  }

  // Creates the globe and gives it the world. Called once, when the world map is in.
  function initGlobe() {
    if (map.globe) return;
    const host = document.getElementById('globe-host');
    const g = map.globe = Globe.create(host, { dblClickZoom: false });
    applyMapLook();
    g.setLayers([{
      id: 'world', features: state.allFeatures, key: featureKey, borders: state.worldBorders,
      interactive: true, style: 'dim'
    }]);
    applyMapLook();     // the layer's borders take their colour once it exists
    g.addOverlay(drawMapOverlay);
    g.on('click', onMapClick);
    g.on('hover', hit => {
      // A hand over what can be picked; in Uncharted that would give the shapes away
      const pick = !!hit && hit.layerId === map.layer && state.difficulty !== 'uncharted' && canPick(hit.key);
      host.style.setProperty('--globe-cursor', pick ? 'pointer' : '');
    });
    if (!document.getElementById('game-screen').classList.contains('active')) g.pause();
  }

  // Reads the map's colour tokens as they stand (theme, imagery, Uncharted)
  // and hands them to the globe: fill styles, borders, sea and sky
  function applyMapLook() {
    const g = map.globe;
    if (!g) return;
    const stage = document.getElementById('map-wrap');
    const cs = getComputedStyle(stage);
    const token = name => cssRgba(cs.getPropertyValue(name).trim());
    const imagery = stage.classList.contains('sat-on');
    const land = token('--g-land'), select = token('--g-select');
    // Over imagery a flash or a tint lets the ground show through
    const veil = c => imagery ? [c[0], c[1], c[2], c[3] * 0.55] : c;
    const styles = {
      land: land,
      dim: imagery ? token('--g-shade') : mixRgba(land, token('--g-ocean-2'), 0.5),
      hover: token('--g-near'),
      found: token('--g-found'), second: token('--g-second'), missed: token('--g-missed'),
      good: veil(token('--m2')), bad: veil(token('--g-wrong')), reveal: veil(select),
      hidden: [0, 0, 0, 0]
    };
    Object.keys(styles).forEach(name => { styles[name] = rgbaCss(styles[name]); });
    g.defineStyles(styles);
    g.setTheme({
      ocean: rgbaCss(token('--g-ocean-2')), oceanEdge: rgbaCss(token('--g-ocean-3')),
      graticule: rgbaCss(token('--g-grat')), atmosphere: rgbaCss(token('--g-atmo')), limb: rgbaCss(token('--g-limb'))
    });
    g.setGraticule(!imagery);
    g.updateLayer('world', {
      borderColor: rgbaCss(token('--g-border')),
      borderWidth: parseFloat(cs.getPropertyValue('--g-line')) || 0.6,
      bordersVisible: state.difficulty !== 'uncharted'
    });
    map.ink = {
      label: rgbaCss(token('--g-label')), halo: rgbaCss(token('--g-halo')),
      select: rgbaCss(select), border: rgbaCss(token('--g-border'))
    };
  }

  // The style a feature of the round's layer should be showing now
  function featureStyle(key) {
    return map.shown.get(key) || map.marks.get(key) || (map.eligible.has(key) ? 'land' : 'dim');
  }

  function paintFeature(key) {
    map.globe.setStyle(map.layer, key, featureStyle(key));
  }

  // Paints the round's layer from what the round has put on the map
  function paintMap() {
    const styles = {};
    activeFeatures().forEach(f => {
      const key = featureKey(f);
      styles[key] = featureStyle(key);
    });
    map.globe.setStyles(map.layer, styles);
  }

  // True when a tap on this feature would count as an answer
  function canPick(key) {
    return !state.interactionLocked && !!state.current && map.eligible.has(key) && !map.marks.has(key);
  }

  // Sets the globe up for the round about to start: what can be picked, and a clean picture
  function setupMap() {
    map.layer = 'world';
    map.eligible = new Set(state.eligibleFeatures.map(featureKey));
    map.marks.clear();
    map.shown.clear();
    map.outlines = [];
    map.reveal = null;
    paintMap();
    map.globe.setHoverStyle(map.layer, 'hover', canPick);
  }

  // Sizes the globe's host so that its middle, where the globe sits, is the
  // middle of what the HUD leaves clear: the host covers the stage and
  // reaches past its top or bottom edge by the difference.
  function placeGlobeHost() {
    const stage = document.getElementById('map-wrap');
    const host = document.getElementById('globe-host');
    const width = stage.clientWidth, height = stage.clientHeight;
    const clear = stageClearArea(width, height);
    const below = Math.round(clear.top + clear.bottom - height);   // how far the clear middle sits under the stage's
    const top = Math.min(0, below);
    host.style.top = top + 'px';
    host.style.bottom = Math.min(0, -below) + 'px';
    map.globe.resize();
    map.clear = { left: clear.left, right: clear.right, top: clear.top - top, bottom: clear.bottom - top };
  }

  // Points along the edges of a longitude/latitude box, for fitting a view to it
  function boxOutline(box) {
    const west = box[0], east = box[1], south = box[2], north = box[3];
    const points = [];
    for (let i = 0; i <= 12; i++) {
      const lon = west + (east - west) * i / 12, lat = south + (north - south) * i / 12;
      points.push([lon, south], [lon, north], [west, lat], [east, lat]);
    }
    return { type: 'MultiPoint', coordinates: points };
  }

  // What the round's opening view should hold, as GeoJSON; null for the whole globe
  function roundFrame() {
    const box = CONTINENT_FRAMES[state.currentContinent];
    return state.gameMode === 'world-country' && box ? boxOutline(box) : null;
  }

  // The round's opening view: its frame fitted into what the HUD leaves
  // clear, or the whole globe. Also sets how far the round can zoom.
  function frameMap() {
    const g = map.globe;
    placeGlobeHost();
    const halfW = (map.clear.right - map.clear.left) / 2, halfH = (map.clear.bottom - map.clear.top) / 2;
    const base = g.radiusPx() / g.getView().k;      // the globe's radius at zoom 1
    // The whole globe may sit a little under the prompt card and the
    // actions: what it loses there is polar sea
    const whole = Math.min(halfW - 8, halfH * 1.15) / base;
    let view = { lon: WORLD_VIEW.lon, lat: WORLD_VIEW.lat, k: whole };
    const frame = roundFrame();
    if (frame) {
      g.setOptions({ minZoom: Math.min(1, whole), maxZoom: 80 });
      g.fitTo(frame, { padding: 0 });
      const fitted = g.getView();
      // How far the frame reaches from the centre of that view, in globe radii
      const centreX = stageWidthOf(g) / 2, centreY = stageHeightOf(g) / 2, radius = g.radiusPx();
      let reachX = 0.01, reachY = 0.01;
      const p = { x: 0, y: 0, visible: false, z: 0 };
      frame.coordinates.forEach(lonlat => {
        g.project(lonlat, p);
        reachX = Math.max(reachX, Math.abs(p.x - centreX) / radius);
        reachY = Math.max(reachY, Math.abs(p.y - centreY) / radius);
      });
      const k = Math.min((halfW - 12) / reachX, (halfH - 12) / reachY) / base;
      view = { lon: fitted.lon, lat: fitted.lat, k: Math.max(k, whole) };
    }
    // Room to zoom in on the smallest places, and out to the whole globe
    g.setOptions({ minZoom: Math.min(1, whole), maxZoom: Math.max(80, 60 * view.k) });
    g.setView(view);
    g.setHome(view);
    map.home = g.getView();
    map.round = state.roundId;
  }

  // True while the globe still shows the round's opening view
  function mapAtHome() {
    const v = map.globe.getView(), h = map.home;
    return !!h && Math.abs(v.lon - h.lon) < 1e-6 && Math.abs(v.lat - h.lat) < 1e-6 && Math.abs(v.k - h.k) < 1e-6;
  }

  // Turns the globe to a place the player needs to see when it is out of
  // sight, under the HUD, or too small to make out. Takes a feature of the
  // round's layer or a [lon, lat].
  function bringIntoView(target) {
    const g = map.globe;
    const view = g.getView();
    let lonlat = target, k = view.k;
    if (!Array.isArray(target)) {
      const key = featureKey(target);
      const info = g.featureInfo(map.layer, key);
      if (!info) return;
      lonlat = g.anchor(map.layer, key) || info.centroid;
      const size = 2 * g.radiusPx() * Math.sin(Math.min(info.radiusDeg, 90) * Math.PI / 180);
      if (size < 10) k = view.k * 24 / Math.max(size, 0.01);
    }
    const p = g.project(lonlat);
    const c = map.clear, edge = 36;
    const inSight = p.z > 0.35 && p.x >= c.left + edge && p.x <= c.right - edge &&
      p.y >= c.top + edge && p.y <= c.bottom - edge;
    if (inSight && k === view.k) return;
    g.flyTo({ lon: lonlat[0], lat: lonlat[1], k: k }, { duration: reducedMotion() ? 0 : 550 });
  }

  // A tap or click on the globe that was not a drag
  function onMapClick(e) {
    const screen = document.getElementById('game-screen');
    if (!state.onGlobe || !screen.classList.contains('active') || screen.classList.contains('review-mode')) return;
    if (state.interactionLocked || !state.current) return;
    // A finger is less exact than a mouse: tiny places take a tap from further off
    const touch = !!e.originalEvent && e.originalEvent.pointerType !== 'mouse';
    const hit = map.globe.featureAt(e.x, e.y, {
      tolerance: touch ? 20 : 12,
      eligible: (layerId, key) => layerId === map.layer && map.eligible.has(key)
    });
    // Land that is not part of the round and places already answered take no answers
    if (!hit || hit.layerId !== map.layer || !map.eligible.has(hit.key) || map.marks.has(hit.key)) return;
    answerFeature(hit.key);
  }

  // Everything drawn over the globe, bottom to top
  function drawMapOverlay(ctx, o) {
    const g = map.globe;
    const still = reducedMotion();
    map.outlines = map.outlines.filter(line => line.until > o.time);
    map.outlines.forEach(line => {
      if (line.kind === 'reveal') {
        // The missed answer: a heavy outline with a glow, breathing
        ctx.globalAlpha = still ? 1 : 0.8 + 0.2 * Math.cos((line.until - o.time) / 1200 * 2 * Math.PI);
        ctx.shadowColor = map.ink.select;
        ctx.shadowBlur = 10;
        g.draw.outline(ctx, line.feature, { stroke: map.ink.label, width: 2.5 });
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      } else {
        // An answer's flash where the map has no borders to show its shape
        g.draw.outline(ctx, line.feature, { stroke: map.ink.border, width: 1.6 });
      }
    });
    drawRevealRings(ctx, o.time, still);
  }

  // Two rings spreading from a missed answer, round a dot that marks the spot
  function drawRevealRings(ctx, now, still) {
    const r = map.reveal;
    if (!r) return;
    const age = now - r.start;
    if (age > 2700) { map.reveal = null; return; }
    const p = map.globe.project(r.lonlat);
    if (!p.visible) return;
    const fade = age > 2400 ? 1 - (age - 2400) / 300 : 1;
    ctx.lineWidth = 3;
    [0, 450].forEach((delay, i) => {
      if (age < delay) return;
      const t = still ? 0.45 : ((age - delay) % 1400) / 1400;
      const spread = 1 - Math.pow(1 - t, 3);
      ctx.globalAlpha = fade * 0.95 * (still ? 0.6 : 1 - spread);
      ctx.strokeStyle = i ? map.ink.select : map.ink.label;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6 + (still ? 14 + 14 * i : 36 * spread), 0, 2 * Math.PI);
      ctx.stroke();
    });
    ctx.globalAlpha = fade;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
    ctx.fillStyle = map.ink.label;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = map.ink.select;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

