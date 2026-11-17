/* =========================================================
 * GLOBE ENGINE
 *
 * An orthographic globe drawn with WebGL (Canvas 2D when WebGL is
 * unavailable). It knows nothing about the game: callers hand it
 * GeoJSON layers and named styles, and it handles drawing, rotating,
 * zooming, picking and an overlay canvas for labels and markers.
 * Depends on the globals `d3` (d3-array + d3-geo) and `earcut`.
 *
 *   const globe = Globe.create(hostElement, { minZoom, maxZoom, dblClickZoom,
 *                                             theme, forceCanvas2D });
 *
 * Layers    setLayers([{ id, features, key, interactive, borders,
 *           borderColor, borderWidth, bordersVisible, visible, style }])
 *           and updateLayer(id, changes); both return a Promise that
 *           resolves once the layers are on screen. Geometry is built
 *           once per features array: a layer whose id and features array
 *           are unchanged keeps its triangles (and, if its borders object
 *           is unchanged too, everything). Features are Polygons or
 *           MultiPolygons, wound either way, and are not expected to
 *           change once handed over. Keys must be unique within a layer.
 * Styles    defineStyles({ name: cssColour }), setStyle, setStyles,
 *           resetStyles, flash, setHoverStyle
 * View      getView, setView, flyTo, fitTo, setHome, resetView, zoomBy,
 *           ensureVisible, spin, setOptions. A view is { lon, lat, k }:
 *           the place at the centre of the host and the zoom (1 = whole
 *           globe; maxZoom may be raised to 600).
 * Geometry  project([lon, lat]) → { x, y, visible, z }, invert(x, y),
 *           featureAt(x, y, opts) → { layerId, key, feature, exact },
 *           featureInfo(layerId, key), anchor(layerId, key),
 *           anchorRadiusDeg(layerId, key), radiusPx().
 *           Positions are CSS px from the host's top-left corner.
 * Events    on(name, fn) returns a function that removes the listener;
 *           a handler can also be assigned as globe.on<name>. Names:
 *           click, hover, move, view, settle, ready, progress, renderer.
 * Overlay   addOverlay((ctx, g) => ...) returns a function that removes
 *           it; invalidate(), animate(ms); draw.geoLine, draw.outline,
 *           draw.rings for use inside overlay callbacks.
 * Imagery   setImagery({ enabled, tileUrl(z, x, y), maxZoom, onStatus }) lays
 *           Web Mercator satellite tiles over the ocean (WebGL only: see
 *           supportsImagery). onStatus hears 'loading', 'ready' or
 *           'failed'. Give the layers transparent or tinted styles.
 * Other     setTheme, setGraticule, attachTo, resize, pause, resume,
 *           stats, destroy
 *
 * The cursor is `grab` / `grabbing`; override it with the CSS custom
 * properties --globe-cursor and --globe-cursor-dragging on the host.
 * ========================================================= */
const Globe = (function () {
  'use strict';

  /* ===== Constants ===== */

  const RAD = Math.PI / 180;
  const DEG = 180 / Math.PI;

  const MAX_DPR = 2;               // backing store never exceeds 2 device px per CSS px
  const BASE_RADIUS = 0.46;        // globe radius at k = 1, as a fraction of min(width, height)
  const HALO = 0.075;              // atmosphere halo width, as a fraction of the k = 1 radius
  const MAX_LAT = 85;              // the view centre never goes closer to a pole than this
  const ZOOM_LIMIT = 600;          // the highest maxZoom that float32 vertex maths keeps steady
  const EDGE_DEG = 2;              // no triangle edge or border segment spans more than this
  const EDGE_CHORD2 = Math.pow(2 * Math.sin(EDGE_DEG * RAD / 2), 2);
  const MAX_POLYGON_COS = Math.cos(87 * RAD);   // widest polygon the tangent-plane build accepts
  const STYLE_TEX_WIDTH = 256;     // style texture: one texel per feature, this many per row
  const GRATICULE_PX = 0.8;        // graticule line width, CSS px
  const LINE_DELTA = 0.04;         // border vertices store offsets to their neighbours as int16 fractions of this

  const BUILD_SLICE_MS = 8;        // geometry builds yield to the browser after this long
  const CONTEXT_WAIT_MS = 4000;    // a lost WebGL context is given up on after this long on a visible page
  const SETTLE_MS = 150;           // 'settle' fires this long after the view last changed
  const CLICK_SLOP_PX = 6;         // a press that moves less than this is a click, not a drag
  const DOUBLE_TAP_MS = 300;
  const INERTIA_TAU_MS = 350;      // time constant of the drag-release glide
  const ZOOM_TAU_MS = 90;          // time constant of the wheel / double-tap zoom ease
  const SMALL_FEATURE_PX = 14;     // features under this size on screen get a tap tolerance
  const SMALL_AREA_PX2 = 200;      // ...as do scattered features covering less than this area
  const ANCHOR_CAP = 5 * RAD;      // features wider than this are aimed at by anchor, not centroid
  const ANCHOR_PRECISION = 1 / 400;   // an anchor's clear radius is within this fraction of its polygon's
                                      // smaller dimension of the best there is

  const TILE_PX = 256;             // imagery tiles are this many px square
  const BASE_TILE_ZOOM = 2;        // tile zoom of the whole-world imagery mosaic (16 tiles)
  const WINDOW_TILES = 8;          // a detail mosaic is at most this many tiles on a side (2048 px)...
  const WINDOW_TILE_LIMIT = 40;    // ...and this many tiles in all
  const TILE_CACHE = 160;          // decoded tiles kept; the least recently used go first
  const IMAGERY_RETRY_MS = 10000;  // tiles that failed are not asked for again sooner than this
  const MERCATOR_LAT = 85.0511287798;     // where the Web Mercator square ends
  const TILE_LOADING = 0, TILE_READY = 1, TILE_FAILED = 2;

  const DEFAULT_THEME = {
    ocean: '#a7c0c9',
    oceanEdge: '#7a9ba6',
    graticule: 'rgba(31,42,58,0.10)',
    atmosphere: 'rgba(167,192,201,0.55)',
    limb: 'rgba(31,42,58,0.35)'
  };

  /* ===== Small helpers ===== */

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // Wraps a longitude into [-180, 180).
  function wrapLon(lon) {
    lon = (lon + 180) % 360;
    return (lon < 0 ? lon + 360 : lon) - 180;
  }

  // Web Mercator y of a latitude, in world heights: 0 at 85.0511°N, 1 at 85.0511°S.
  function mercatorY(lat) {
    const s = Math.sin(clamp(lat, -MERCATOR_LAT, MERCATOR_LAT) * RAD);
    return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  }

  // The smallest power of two that is at least n.
  function powerOfTwo(n) {
    let p = 1;
    while (p < n) p *= 2;
    return p;
  }

  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  // Parses any CSS colour into [r, g, b, a] (0–255, alpha 0–1) by letting a canvas normalise it.
  const parseColor = (function () {
    const cache = new Map();
    let ctx = null;
    return function (css) {
      let c = cache.get(css);
      if (c) return c;
      if (!ctx) ctx = document.createElement('canvas').getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillStyle = css;
      const s = ctx.fillStyle;      // '#rrggbb' when opaque, 'rgba(r, g, b, a)' otherwise
      if (s.charAt(0) === '#') {
        c = [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 1];
      } else {
        const m = s.match(/[\d.]+/g);
        c = [+m[0], +m[1], +m[2], m.length > 3 ? +m[3] : 1];
      }
      cache.set(css, c);
      return c;
    };
  })();

  function cssOf(c) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + c[3] + ')'; }

  // Returns a copy of a typed array with at least `need` slots (capacity doubles).
  function grown(arr, need) {
    let cap = arr.length;
    while (cap < need) cap *= 2;
    const out = new arr.constructor(cap);
    out.set(arr);
    return out;
  }

  // Calls fn(lon, lat) for every position in any GeoJSON object.
  function eachCoord(o, fn) {
    if (!o) return;
    if (o.type === 'FeatureCollection') o.features.forEach(f => eachCoord(f, fn));
    else if (o.type === 'Feature') eachCoord(o.geometry, fn);
    else if (o.type === 'GeometryCollection') o.geometries.forEach(g => eachCoord(g, fn));
    else if (o.coordinates) walkCoords(o.coordinates, fn);
  }
  function walkCoords(a, fn) {
    if (typeof a[0] === 'number') fn(a[0], a[1]);
    else for (let i = 0; i < a.length; i++) walkCoords(a[i], fn);
  }

  // Writes [lon, lat] as a unit vector (x toward 0°N 0°E, z toward the north pole) into out[0..2].
  function unitVector(lonlat, out) {
    const lam = lonlat[0] * RAD, phi = lonlat[1] * RAD, cp = Math.cos(phi);
    out[0] = cp * Math.cos(lam); out[1] = cp * Math.sin(lam); out[2] = Math.sin(phi);
    return out;
  }

  // Writes the point a fraction t along the great arc from unit vector a to unit vector b,
  // which are `angle` radians apart, into out[0..2].
  function slerp(a, b, angle, t, out) {
    const s = Math.sin(angle);
    let wa = 1 - t, wb = t;
    if (s > 1e-6) { wa = Math.sin((1 - t) * angle) / s; wb = Math.sin(t * angle) / s; }
    out[0] = wa * a[0] + wb * b[0]; out[1] = wa * a[1] + wb * b[1]; out[2] = wa * a[2] + wb * b[2];
    return out;
  }

  // Writes the rows of the geographic → view rotation for a view centred on (lon, lat) into
  // out[0..8]: X (screen right), Y (screen up), Z (toward the viewer). North stays up.
  function viewRows(lon, lat, out) {
    const sl = Math.sin(lon * RAD), cl = Math.cos(lon * RAD);
    const sp = Math.sin(lat * RAD), cp = Math.cos(lat * RAD);
    out[0] = -sl;      out[1] = cl;       out[2] = 0;
    out[3] = -sp * cl; out[4] = -sp * sl; out[5] = cp;
    out[6] = cp * cl;  out[7] = cp * sl;  out[8] = sp;
  }

  /* =========================================================
   * GEOMETRY BUILD
   *
   * Each polygon is projected onto the plane tangent at its own
   * centre (a gnomonic projection, in which great-circle edges are
   * straight lines), triangulated there with earcut, and the
   * triangles are then subdivided on the sphere until no edge is
   * longer than EDGE_DEG. Because the tangent plane is per polygon,
   * the antimeridian and the poles need no special handling.
   * ========================================================= */

  // Writes two unit vectors spanning the plane that touches the sphere at unit vector c into
  // out[0..5]: the first points east (near a pole, in some fixed direction), the second is
  // 90° anticlockwise of it as seen from outside the globe.
  function tangentAxes(cx, cy, cz, out) {
    let x = -cy, y = cx, z = 0;
    if (Math.abs(cz) >= 0.9) { x = 0; y = -cz; z = cy; }
    const len = Math.sqrt(x * x + y * y + z * z);
    x /= len; y /= len; z /= len;
    out[0] = x; out[1] = y; out[2] = z;
    out[3] = cy * z - cz * y; out[4] = cz * x - cx * z; out[5] = cx * y - cy * x;
  }
  const axes = new Float64Array(6);

  // The polygon being processed: ring points on the unit sphere, their tangent-plane
  // coordinates, and for each ring (outer ring first) the running vertex count at its end,
  // its index in the GeoJSON polygon, and its winding: twice its signed area in the tangent
  // plane, positive when it runs anticlockwise as seen from outside the globe.
  const poly = {
    xyz: new Float64Array(3 * 2048), uv: new Float64Array(2 * 2048), n: 0,
    ends: [], source: [], winding: [],
    cx: 0, cy: 0, cz: 0, e1x: 0, e1y: 0, e1z: 0, e2x: 0, e2y: 0, e2z: 0,
    cosR: 1,          // cosine of the angular radius of the cap around (cx, cy, cz) holding the polygon
    area: 0,          // spherical area, steradians
    sx: 0, sy: 0, sz: 0,   // area-weighted centroid direction (not normalised)
    tooWide: false
  };

  // Loads one GeoJSON polygon (an array of rings) into `poly`. Returns false when there is
  // nothing to draw: fewer than three distinct points, or (tooWide) wider than a hemisphere.
  function loadPolygon(rings) {
    let total = 0;
    for (let r = 0; r < rings.length; r++) total += rings[r].length;
    if (poly.xyz.length < total * 3) {
      poly.xyz = new Float64Array(total * 3);
      poly.uv = new Float64Array(total * 2);
    }
    const xyz = poly.xyz, uv = poly.uv, ends = poly.ends, source = poly.source, winding = poly.winding;
    ends.length = source.length = winding.length = 0;
    poly.tooWide = false;
    let n = 0;
    let minX = 2, minY = 2, minZ = 2, maxX = -2, maxY = -2, maxZ = -2;
    for (let r = 0; r < rings.length; r++) {
      const ring = rings[r], start = n;
      let px = 9, py = 9, pz = 9;
      for (let i = 0; i < ring.length; i++) {
        const lam = ring[i][0] * RAD, phi = ring[i][1] * RAD, cp = Math.cos(phi);
        const x = cp * Math.cos(lam), y = cp * Math.sin(lam), z = Math.sin(phi);
        const dx = x - px, dy = y - py, dz = z - pz;
        if (dx * dx + dy * dy + dz * dz < 1e-18) continue;      // repeated point
        xyz[n * 3] = x; xyz[n * 3 + 1] = y; xyz[n * 3 + 2] = z;
        n++;
        px = x; py = y; pz = z;
      }
      if (n - start > 1) {                                       // GeoJSON repeats the first point last
        const dx = xyz[start * 3] - px, dy = xyz[start * 3 + 1] - py, dz = xyz[start * 3 + 2] - pz;
        if (dx * dx + dy * dy + dz * dz < 1e-18) n--;
      }
      if (n - start < 3) { n = start; continue; }
      ends.push(n);
      source.push(r);
    }
    poly.n = n;
    if (!n) return false;

    for (let i = 0; i < n * 3; i += 3) {
      const x = xyz[i], y = xyz[i + 1], z = xyz[i + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }

    // Tangent point: the middle of the bounding box, pushed out to the sphere
    let cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
    const len = Math.sqrt(cx * cx + cy * cy + cz * cz);
    if (len < 1e-6) { poly.tooWide = true; return false; }
    cx /= len; cy /= len; cz /= len;
    tangentAxes(cx, cy, cz, axes);
    const e1x = axes[0], e1y = axes[1], e1z = axes[2], e2x = axes[3], e2y = axes[4], e2z = axes[5];

    // One pass over every ring edge a → b: tangent-plane coordinates, the bounding cap, the
    // ring's winding, and the edge's share of the polygon's spherical area and centroid (the
    // same sums d3.geoArea and d3.geoCentroid make, without recomputing the trigonometry).
    let cosR = 1, area = 0, sx = 0, sy = 0, sz = 0;
    for (let r = 0, start = 0; r < ends.length; start = ends[r++]) {
      let o = (ends[r] - 1) * 3;
      let ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2], da = ax * cx + ay * cy + az * cz;
      let au = (ax * e1x + ay * e1y + az * e1z) / da, av = (ax * e2x + ay * e2y + az * e2z) / da;
      let turn = 0;
      for (let i = start; i < ends[r]; i++) {
        o = i * 3;
        const bx = xyz[o], by = xyz[o + 1], bz = xyz[o + 2];
        const db = bx * cx + by * cy + bz * cz;
        if (db < cosR) cosR = db;
        const bu = uv[i * 2] = (bx * e1x + by * e1y + bz * e1z) / db;
        const bv = uv[i * 2 + 1] = (bx * e2x + by * e2y + bz * e2z) / db;
        turn += au * bv - bu * av;
        const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        const m = Math.sqrt(nx * nx + ny * ny + nz * nz), w = ax * bx + ay * by + az * bz;
        area += 2 * Math.atan2(cx * nx + cy * ny + cz * nz, 1 + da + db + w);
        if (m > 0) { const s = Math.atan2(m, w) / m; sx += nx * s; sy += ny * s; sz += nz * s; }
        ax = bx; ay = by; az = bz; da = db; au = bu; av = bv;
      }
      winding[r] = turn;
    }
    if (cosR < MAX_POLYGON_COS) { poly.tooWide = true; return false; }
    poly.cx = cx; poly.cy = cy; poly.cz = cz;
    poly.e1x = e1x; poly.e1y = e1y; poly.e1z = e1z;
    poly.e2x = e2x; poly.e2y = e2y; poly.e2z = e2z;
    poly.cosR = cosR;
    // Whichever way the rings are wound, the polygon is the side its centre is on
    const side = sx * cx + sy * cy + sz * cz < 0 ? -1 : 1;
    poly.sx = sx * side; poly.sy = sy * side; poly.sz = sz * side;
    poly.area = Math.abs(area);
    if (ends.length > 1) outerRingFirst();
    return true;
  }

  // earcut expects the outer ring first. GeoJSON usually has it there, but data stitched
  // across the antimeridian does not always (Antarctica), so move the largest ring to the front.
  function outerRingFirst() {
    const uv = poly.uv, ends = poly.ends, source = poly.source, winding = poly.winding;
    let outer = 0;
    for (let r = 1; r < ends.length; r++) if (Math.abs(winding[r]) > Math.abs(winding[outer])) outer = r;
    if (outer === 0) return;
    const n = poly.n, from = ends[outer - 1], to = ends[outer], count = to - from;
    const xyz = poly.xyz.slice(0, n * 3), uv0 = uv.slice(0, n * 2);
    poly.xyz.set(xyz.subarray(from * 3, to * 3), 0);
    poly.xyz.set(xyz.subarray(0, from * 3), count * 3);
    uv.set(uv0.subarray(from * 2, to * 2), 0);
    uv.set(uv0.subarray(0, from * 2), count * 2);
    for (let r = outer; r > 0; r--) ends[r] = ends[r - 1] + count;
    ends[0] = count;
    source.unshift(source.splice(outer, 1)[0]);
    winding.unshift(winding.splice(outer, 1)[0]);
  }

  // The rings of the polygon in `poly` as GeoJSON that d3 reads the same way whatever the
  // winding of the input: outer ring first and clockwise, holes anticlockwise. `rings` is the
  // polygon that was loaded; it is returned as it is when it already has that form.
  function ringsForD3(rings) {
    const source = poly.source, winding = poly.winding;
    const ok = r => (winding[r] < 0) === (r === 0);
    let asGiven = source.length === rings.length;
    for (let r = 0; asGiven && r < source.length; r++) asGiven = source[r] === r && ok(r);
    return asGiven ? rings : source.map((from, r) => ok(r) ? rings[from] : rings[from].slice().reverse());
  }

  // Distance from (x, y) to the nearest ring edge in `pts` (x, y pairs; `ends` as in `poly`),
  // negative when the point is outside. Rings count even–odd, so holes are respected.
  function distanceInside(x, y, pts, ends) {
    let inside = false, min2 = Infinity;
    for (let r = 0, start = 0; r < ends.length; start = ends[r++] * 2) {
      const end = ends[r] * 2;
      for (let i = start, j = end - 2; i < end; j = i, i += 2) {
        const ax = pts[i], ay = pts[i + 1], bx = pts[j], by = pts[j + 1];
        if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
        let dx = bx - ax, dy = by - ay;
        const len2 = dx * dx + dy * dy;
        const t = len2 > 0 ? clamp(((x - ax) * dx + (y - ay) * dy) / len2, 0, 1) : 0;
        dx = x - ax - dx * t; dy = y - ay - dy * t;
        const d2 = dx * dx + dy * dy;
        if (d2 < min2) min2 = d2;
      }
    }
    return (inside ? 1 : -1) * Math.sqrt(min2);
  }

  // The most-inside point of the polygon in `poly` (its pole of inaccessibility: the centre
  // of the largest circle that fits in it), as { lonlat: [lon, lat], radius: that circle's
  // angular radius in radians }. A grid search that keeps splitting the most promising cell,
  // as in Mapbox's polylabel.
  function insidePoint() {
    const n = poly.n, uv = poly.uv, ends = poly.ends;
    // Tangent-plane coordinates stretch distances away from the centre. Work in azimuthal
    // equidistant ones instead: the same directions, at their true angular distance.
    const pts = new Float64Array(n * 2);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < n * 2; i += 2) {
      const rho = Math.hypot(uv[i], uv[i + 1]), s = rho > 1e-12 ? Math.atan(rho) / rho : 1;
      const x = pts[i] = uv[i] * s, y = pts[i + 1] = uv[i + 1] * s;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const size = Math.min(maxX - minX, maxY - minY), precision = size * ANCHOR_PRECISION;
    // A cell is a square of half-width h centred on (x, y); `reach` is the largest distance
    // any point of it could have.
    const cell = (x, y, h) => { const d = distanceInside(x, y, pts, ends); return { x, y, h, d, reach: d + h * Math.SQRT2 }; };
    let best = cell((minX + maxX) / 2, (minY + maxY) / 2, 0);
    const cells = [];
    if (size > 0) {
      for (let x = minX; x < maxX; x += size) {
        for (let y = minY; y < maxY; y += size) cells.push(cell(x + size / 2, y + size / 2, size / 2));
      }
    }
    while (cells.length) {
      let top = 0;
      for (let i = 1; i < cells.length; i++) if (cells[i].reach > cells[top].reach) top = i;
      const c = cells[top];
      cells[top] = cells[cells.length - 1];
      cells.pop();
      if (c.d > best.d) best = c;
      if (c.reach - best.d <= precision) continue;
      const h = c.h / 2;
      cells.push(cell(c.x - h, c.y - h, h), cell(c.x + h, c.y - h, h), cell(c.x - h, c.y + h, h), cell(c.x + h, c.y + h, h));
    }
    // Back onto the sphere
    const theta = Math.hypot(best.x, best.y), s = theta > 1e-12 ? Math.sin(theta) / theta : 1, c = Math.cos(theta);
    const x = c * poly.cx + s * (best.x * poly.e1x + best.y * poly.e2x);
    const y = c * poly.cy + s * (best.x * poly.e1y + best.y * poly.e2y);
    const z = c * poly.cz + s * (best.x * poly.e1z + best.y * poly.e2z);
    // The clear radius, measured in the plane tangent at the point itself: there the distance
    // to an edge is exactly the tangent of the angle to it
    tangentAxes(x, y, z, axes);
    const xyz = poly.xyz;
    for (let i = 0; i < n; i++) {
      const px = xyz[i * 3], py = xyz[i * 3 + 1], pz = xyz[i * 3 + 2], d = Math.max(px * x + py * y + pz * z, 1e-6);
      pts[i * 2] = (px * axes[0] + py * axes[1] + pz * axes[2]) / d;
      pts[i * 2 + 1] = (px * axes[3] + py * axes[4] + pz * axes[5]) / d;
    }
    return {
      lonlat: [Math.atan2(y, x) * DEG, Math.asin(clamp(z, -1, 1)) * DEG],
      radius: Math.atan(Math.max(distanceInside(0, 0, pts, ends), 0))
    };
  }

  // The mesh being written. A build step works on these module variables so its inner loops
  // touch plain locals; openMesh / closeMesh move them in and out of a layer's mesh object.
  let meshVerts = null, meshVertCount = 0;      // x, y, z, feature index per vertex
  let meshIndex = null, meshIndexCount = 0;     // three vertex indices per triangle
  let meshQuads = null, meshQuadShorts = null;  // border quads, 28 bytes per corner (see addLine)
  let meshSegCount = 0;                         // border segments, four corners each

  function newMesh() {
    return {
      verts: new Float32Array(4 * 4096), vertCount: 0,
      index: new Uint32Array(3 * 4096), indexCount: 0,
      quads: new Float32Array(28 * 1024), segCount: 0
    };
  }
  function openMesh(m) {
    meshVerts = m.verts; meshVertCount = m.vertCount;
    meshIndex = m.index; meshIndexCount = m.indexCount;
    meshQuads = m.quads; meshQuadShorts = new Int16Array(m.quads.buffer); meshSegCount = m.segCount;
  }
  function closeMesh(m) {
    m.verts = meshVerts; m.vertCount = meshVertCount;
    m.index = meshIndex; m.indexCount = meshIndexCount;
    m.quads = meshQuads; m.segCount = meshSegCount;
    meshVerts = meshIndex = meshQuads = meshQuadShorts = null;
  }

  function addVertex(x, y, z, feat) {
    const o = meshVertCount * 4;
    if (o === meshVerts.length) meshVerts = grown(meshVerts, o + 4);
    meshVerts[o] = x; meshVerts[o + 1] = y; meshVerts[o + 2] = z; meshVerts[o + 3] = feat;
    return meshVertCount++;
  }

  // Subdivision scratch: midpoint vertex per split edge, and the stack of triangles to visit.
  const edgeMidpoints = new Map();
  let triStack = new Uint32Array(3 * 1024), triTop = 0;

  function pushTriangle(a, b, c) {
    if (triTop + 3 > triStack.length) triStack = grown(triStack, triTop + 3);
    triStack[triTop++] = a; triStack[triTop++] = b; triStack[triTop++] = c;
  }

  function edgeTooLong(a, b) {
    const v = meshVerts, i = a * 4, j = b * 4;
    const dx = v[i] - v[j], dy = v[i + 1] - v[j + 1], dz = v[i + 2] - v[j + 2];
    return dx * dx + dy * dy + dz * dz > EDGE_CHORD2;
  }

  // The vertex halfway along the great arc from a to b. Whether an edge is split, and where,
  // depends only on its two end points, so both triangles sharing the edge agree (no cracks),
  // and so do two neighbouring features that share a border.
  function edgeMidpoint(a, b, feat) {
    const key = a < b ? a * 67108864 + b : b * 67108864 + a;
    let m = edgeMidpoints.get(key);
    if (m === undefined) {
      const v = meshVerts, i = a * 4, j = b * 4;
      const x = v[i] + v[j], y = v[i + 1] + v[j + 1], z = v[i + 2] + v[j + 2];
      const s = 1 / Math.sqrt(x * x + y * y + z * z);
      m = addVertex(x * s, y * s, z * s, feat);
      edgeMidpoints.set(key, m);
    }
    return m;
  }

  // Triangulates the polygon in `poly` and appends it to the open mesh.
  function tessellate(feat) {
    const n = poly.n, xyz = poly.xyz, ends = poly.ends;
    const base = meshVertCount;
    for (let i = 0; i < n * 3; i += 3) addVertex(xyz[i], xyz[i + 1], xyz[i + 2], feat);
    const holes = ends.length > 1 ? ends.slice(0, -1) : null;
    const tris = earcut(poly.uv.subarray(0, n * 2), holes, 2);
    edgeMidpoints.clear();
    for (let t = 0; t < tris.length; t += 3) {
      pushTriangle(base + tris[t], base + tris[t + 1], base + tris[t + 2]);
      while (triTop) {
        const c = triStack[--triTop], b = triStack[--triTop], a = triStack[--triTop];
        const ab = edgeTooLong(a, b), bc = edgeTooLong(b, c), ca = edgeTooLong(c, a);
        if (!ab && !bc && !ca) {
          if (meshIndexCount + 3 > meshIndex.length) meshIndex = grown(meshIndex, meshIndexCount + 3);
          meshIndex[meshIndexCount++] = a; meshIndex[meshIndexCount++] = b; meshIndex[meshIndexCount++] = c;
          continue;
        }
        const mab = ab ? edgeMidpoint(a, b, feat) : 0;
        const mbc = bc ? edgeMidpoint(b, c, feat) : 0;
        const mca = ca ? edgeMidpoint(c, a, feat) : 0;
        if (ab && bc && ca) {
          pushTriangle(a, mab, mca); pushTriangle(mab, b, mbc);
          pushTriangle(mca, mbc, c); pushTriangle(mab, mbc, mca);
        } else if (ab && bc) {
          pushTriangle(mab, b, mbc); pushTriangle(a, mab, mbc); pushTriangle(a, mbc, c);
        } else if (bc && ca) {
          pushTriangle(mca, mbc, c); pushTriangle(a, b, mbc); pushTriangle(a, mbc, mca);
        } else if (ab && ca) {
          pushTriangle(a, mab, mca); pushTriangle(mab, b, c); pushTriangle(mab, c, mca);
        } else if (ab) {
          pushTriangle(a, mab, c); pushTriangle(mab, b, c);
        } else if (bc) {
          pushTriangle(a, b, mbc); pushTriangle(a, mbc, c);
        } else {
          pushTriangle(a, b, mca); pushTriangle(mca, b, c);
        }
      }
    }
  }

  // The points (x, y, z) of the border line being written.
  let linePoints = new Float32Array(3 * 1024), linePointCount = 0;

  function addLinePoint(x, y, z) {
    const o = linePointCount * 3;
    if (o + 3 > linePoints.length) linePoints = grown(linePoints, o + 3);
    linePoints[o] = x; linePoints[o + 1] = y; linePoints[o + 2] = z;
    linePointCount++;
  }

  // Appends the great arc a → b (without a itself) to the border line being written,
  // bisecting it with the same rule (and the same float32 rounding) as the fills so borders
  // sit exactly on triangle edges.
  function addArc(ax, ay, az, bx, by, bz) {
    const dx = ax - bx, dy = ay - by, dz = az - bz;
    if (dx * dx + dy * dy + dz * dz > EDGE_CHORD2) {
      let x = ax + bx, y = ay + by, z = az + bz;
      const len2 = x * x + y * y + z * z;
      if (len2 > 1e-12) {                       // (antipodal ends have no midpoint)
        const s = 1 / Math.sqrt(len2);
        x = Math.fround(x * s); y = Math.fround(y * s); z = Math.fround(z * s);
        addArc(ax, ay, az, x, y, z);
        addArc(x, y, z, bx, by, bz);
        return;
      }
    }
    addLinePoint(bx, by, bz);
  }

  // Appends one border line (an array of [lon, lat]) to the open mesh as quads: four corners
  // per segment (see LINE_VS), 28 bytes each. A corner is its end of the segment as three
  // floats, then as int16 the way to the segment's other end, the way to the neighbouring
  // segment's far point, and its side.
  function addLine(line) {
    linePointCount = 0;
    let ax = 0, ay = 0, az = 0;
    for (let i = 0; i < line.length; i++) {
      const lam = line[i][0] * RAD, phi = line[i][1] * RAD, cp = Math.cos(phi);
      const bx = Math.fround(cp * Math.cos(lam)), by = Math.fround(cp * Math.sin(lam)), bz = Math.fround(Math.sin(phi));
      if (i) addArc(ax, ay, az, bx, by, bz); else addLinePoint(bx, by, bz);
      ax = bx; ay = by; az = bz;
    }
    const pts = linePoints, segs = linePointCount - 1, last = segs * 3;
    const need = (meshSegCount + segs) * 28;
    if (need > meshQuads.length) {
      meshQuads = grown(meshQuads, need);
      meshQuadShorts = new Int16Array(meshQuads.buffer);
    }
    const floats = meshQuads, shorts = meshQuadShorts, scale = 32767 / LINE_DELTA;
    const closed = pts[0] === pts[last] && pts[1] === pts[last + 1] && pts[2] === pts[last + 2];
    let v = meshSegCount * 4;
    for (let i = 0; i < segs; i++) {
      const a = i * 3, b = a + 3;
      // The points before a and after b: round the loop for a closed line, none at an open end
      const before = i > 0 ? a - 3 : closed ? last - 3 : -1;
      const after = i < segs - 1 ? b + 3 : closed ? 3 : -1;
      for (let corner = 0; corner < 4; corner++, v++) {
        const here = corner < 2 ? a : b, other = corner < 2 ? b : a, next = corner < 2 ? before : after;
        for (let j = 0; j < 3; j++) {
          floats[v * 7 + j] = pts[here + j];
          const toOther = pts[other + j] - pts[here + j];
          shorts[v * 14 + 6 + j] = clamp(Math.round(toOther * scale), -32767, 32767);
          // With no neighbour, pretend the line carries straight on
          shorts[v * 14 + 9 + j] = clamp(Math.round((next < 0 ? -toOther : pts[next + j] - pts[here + j]) * scale), -32767, 32767);
        }
        shorts[v * 14 + 12] = (corner < 2 ? 1 : 2) * (corner % 2 ? -1 : 1);
      }
    }
    meshSegCount += segs;
  }

  // True for the artificial edges of data that was cut for flat maps: runs along the
  // antimeridian, and the line of points standing in for a pole.
  function isSeam(p, q) {
    return (Math.abs(p[0]) > 179.999999 && Math.abs(q[0]) > 179.999999) ||
           (Math.abs(p[1]) > 89.99 && Math.abs(q[1]) > 89.99);
  }

  // Copies `line` into `out` as one or more lines, leaving out seams and (when `seen` is
  // given) any edge already emitted, so a border shared by two polygons is drawn once.
  function cleanLine(line, seen, out) {
    let current = null;
    let prevId = seen ? pointId(seen, line[0]) : 0;
    for (let i = 1; i < line.length; i++) {
      const p = line[i - 1], q = line[i];
      let skip = isSeam(p, q);
      if (seen) {
        const id = pointId(seen, q);
        if (!skip) {
          const key = id < prevId ? id * 67108864 + prevId : prevId * 67108864 + id;
          if (id === prevId || seen.edges.has(key)) skip = true;
          else seen.edges.add(key);
        }
        prevId = id;
      }
      if (skip) { current = null; continue; }
      if (!current) { current = [p]; out.push(current); }
      current.push(q);
    }
  }

  // A small integer identifying a position (positions within about a metre share one).
  function pointId(seen, p) {
    const key = Math.round((p[0] + 180) * 1e5) * 2e7 + Math.round((p[1] + 90) * 1e5);
    let id = seen.ids.get(key);
    if (id === undefined) { id = seen.ids.size; seen.ids.set(key, id); }
    return id;
  }

  // A layer's border lines as arrays of [lon, lat]: the caller's MultiLineString if one was
  // given, otherwise the polygon rings.
  function borderLines(layer) {
    const out = [];
    const b = layer.borders && layer.borders.type === 'Feature' ? layer.borders.geometry : layer.borders;
    if (b) {
      const lines = b.type === 'MultiLineString' ? b.coordinates : b.type === 'LineString' ? [b.coordinates] : [];
      for (let i = 0; i < lines.length; i++) cleanLine(lines[i], null, out);
    } else {
      const seen = { ids: new Map(), edges: new Set() };
      for (let i = 0; i < layer.features.length; i++) {
        const polys = polygonsOf(layer.features[i]);
        for (let p = 0; p < polys.length; p++) {
          for (let r = 0; r < polys[p].length; r++) cleanLine(polys[p][r], seen, out);
        }
      }
    }
    return out;
  }

  function polygonsOf(feature) {
    const g = feature && feature.geometry;
    if (!g) return [];
    return g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  }

  // The cap (centre direction + angular radius) around a list of [lon, lat] positions.
  function capOf(coords) {
    let minX = 2, minY = 2, minZ = 2, maxX = -2, maxY = -2, maxZ = -2;
    const n = coords.length, xyz = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) {
      const lam = coords[i][0] * RAD, phi = coords[i][1] * RAD, cp = Math.cos(phi);
      const x = xyz[i * 3] = cp * Math.cos(lam), y = xyz[i * 3 + 1] = cp * Math.sin(lam), z = xyz[i * 3 + 2] = Math.sin(phi);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    let cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
    const len = Math.sqrt(cx * cx + cy * cy + cz * cz);
    if (len < 1e-6) return { cx: 0, cy: 0, cz: 1, radius: Math.PI };
    cx /= len; cy /= len; cz /= len;
    let cosR = 1;
    for (let i = 0; i < n * 3; i += 3) cosR = Math.min(cosR, xyz[i] * cx + xyz[i + 1] * cy + xyz[i + 2] * cz);
    return { cx, cy, cz, radius: Math.acos(clamp(cosR, -1, 1)) };
  }

  // What buildFeature made of each feature object it has seen.
  const featureMeta = new WeakMap();

  // Measures a feature and returns everything the engine keeps about it: centroid, bounding
  // cap, area and the per-polygon data used for picking, culling and d3. With `wantMesh` its
  // triangles are also appended to the open mesh, tagged with feature index `index`.
  function buildFeature(feature, index, wantMesh) {
    const polys = polygonsOf(feature);
    const meta = {
      centroid: null,                 // [lon, lat], as d3.geoCentroid gives it
      cx: 0, cy: 0, cz: 0,            // the centroid as a unit vector
      sx: 0, sy: 0, sz: 0,            // the same direction weighted by area, for combining features
      radius: 0, cosR: 1,             // angular radius (radians) of a cap around the centroid, and its cosine
      areaSr: 0,                      // as d3.geoArea gives it
      bounds: null,                   // d3.geoBounds, computed on first request
      anchor: null, anchorRadius: 0,  // the most-inside point of the largest polygon and the angular radius
                                      // of the circle that fits round it, computed on first request
      parts: [],                      // one entry per polygon
      tooWide: 0                      // polygons left out because they are wider than a hemisphere
    };
    for (let p = 0; p < polys.length; p++) {
      if (!loadPolygon(polys[p])) {
        if (poly.tooWide) meta.tooWide++;
        continue;
      }
      meta.sx += poly.sx; meta.sy += poly.sy; meta.sz += poly.sz;
      meta.areaSr += poly.area;
      meta.parts.push({
        geom: { type: 'Polygon', coordinates: ringsForD3(polys[p]) },      // for d3: the 2D renderer and overlay outlines
        // Bounding cap
        cx: poly.cx, cy: poly.cy, cz: poly.cz, cosR: poly.cosR - 1e-12, radius: Math.acos(clamp(poly.cosR, -1, 1)),
        area: poly.area,
        // The rings in the plane tangent at the cap's centre, for point-in-polygon tests
        e1x: poly.e1x, e1y: poly.e1y, e1z: poly.e1z, e2x: poly.e2x, e2y: poly.e2y, e2z: poly.e2z,
        uv: poly.uv.slice(0, poly.n * 2), ends: Int32Array.from(poly.ends)
      });
      if (wantMesh) tessellate(index);
    }
    const len = Math.sqrt(meta.sx * meta.sx + meta.sy * meta.sy + meta.sz * meta.sz);
    if (len > 1e-12) {
      meta.centroid = [Math.atan2(meta.sy, meta.sx) * DEG, Math.asin(clamp(meta.sz / len, -1, 1)) * DEG];
    } else {
      // No polygon area to speak of (a line, a point, nothing): let d3 decide
      meta.centroid = d3.geoCentroid(feature);
      if (!isFinite(meta.centroid[0]) || !isFinite(meta.centroid[1])) meta.centroid = [0, 0];
    }
    const cp = Math.cos(meta.centroid[1] * RAD);
    meta.cx = cp * Math.cos(meta.centroid[0] * RAD);
    meta.cy = cp * Math.sin(meta.centroid[0] * RAD);
    meta.cz = Math.sin(meta.centroid[1] * RAD);
    for (let p = 0; p < meta.parts.length; p++) {
      const part = meta.parts[p];
      const reach = Math.acos(clamp(meta.cx * part.cx + meta.cy * part.cy + meta.cz * part.cz, -1, 1)) + part.radius;
      if (reach > meta.radius) meta.radius = Math.min(reach, Math.PI);
    }
    meta.cosR = Math.cos(meta.radius) - 1e-9;
    featureMeta.set(feature, meta);
    return meta;
  }

  // A feature's anchor: the most-inside point of its largest polygon, or its centroid when it
  // has none. Unlike the centroid of a country in several pieces, it is always on its land.
  // Computed once; meta.anchorRadius is filled in with it.
  function anchorOf(meta) {
    if (!meta.anchor) {
      let largest = null;
      for (let p = 0; p < meta.parts.length; p++) if (!largest || meta.parts[p].area > largest.area) largest = meta.parts[p];
      if (largest && loadPolygon(largest.geom.coordinates)) {
        const inside = insidePoint();
        meta.anchor = inside.lonlat;
        meta.anchorRadius = inside.radius;
      } else {
        meta.anchor = meta.centroid;
      }
    }
    return meta.anchor;
  }

  // d3.geoBounds of a feature, read from its polygons as the engine understands them (so the
  // answer does not depend on which way the rings are wound).
  function boundsOf(feature, meta) {
    if (!meta.parts.length) return d3.geoBounds(feature);
    return d3.geoBounds({ type: 'MultiPolygon', coordinates: meta.parts.map(part => part.geom.coordinates) });
  }

  // Exact point-in-polygon for a unit vector, done in the polygon's tangent plane (where its
  // great-circle edges are straight). Rings are counted even–odd, so holes are respected.
  function partContains(part, gx, gy, gz) {
    const d = gx * part.cx + gy * part.cy + gz * part.cz;
    if (d < part.cosR) return false;
    const u = (gx * part.e1x + gy * part.e1y + gz * part.e1z) / d;
    const v = (gx * part.e2x + gy * part.e2y + gz * part.e2z) / d;
    const uv = part.uv, ends = part.ends;
    let inside = false, start = 0;
    for (let r = 0; r < ends.length; r++) {
      const end = ends[r] * 2;
      for (let i = start, j = end - 2; i < end; j = i, i += 2) {
        const vi = uv[i + 1], vj = uv[j + 1];
        if ((vi > v) !== (vj > v) && u < (uv[j] - uv[i]) * (v - vi) / (vj - vi) + uv[i]) inside = !inside;
      }
      start = end;
    }
    return inside;
  }

  /* =========================================================
   * SHADERS
   * ========================================================= */

  const PRECISION = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif'
  ].join('\n');

  // Shared by every fragment shader: where the pixel is on the globe's disc, the anti-aliased
  // disc edge, and the shading toward the rim that makes the disc read as a sphere.
  const LIMB_GLSL = [
    'uniform vec2 uCenter;      // globe centre in gl_FragCoord space',
    'uniform vec2 uInvRadius;   // 1 / globe radius in device px, per axis',
    'uniform float uRadiusPx;   // globe radius in device px',
    'uniform vec4 uLimb;        // rim tint, straight alpha',
    'vec2 discPosition() { return (gl_FragCoord.xy - uCenter) * uInvRadius; }',
    'float discCoverage(float r) { return clamp((1.0 - r) * uRadiusPx + 0.5, 0.0, 1.0); }',
    'vec3 shadeLimb(vec3 rgb, float r) {',
    '  float r4 = r * r * r * r;',
    '  float rim = clamp(1.0 - (1.0 - r) * uRadiusPx / 1.5, 0.0, 1.0);',
    '  return mix(rgb, uLimb.rgb, uLimb.a * (0.55 * r4 * r4 * r4 + 0.45 * rim));',
    '}'
  ].join('\n');

  const SPHERE_VS = [
    'attribute vec2 aCorner;',
    'uniform vec2 uQuad;        // half-size of the globe + halo box in clip units',
    'void main() { gl_Position = vec4(aCorner * uQuad, 0.0, 1.0); }'
  ].join('\n');

  // Satellite imagery for the sphere pass. Tiles are Web Mercator and live in up to three
  // mosaics (see the engine's Imagery section): the whole world, and two detail windows.
  // Each is premultiplied RGBA, transparent where no tile has arrived, and is laid over the
  // one below, so a missing tile simply lets the coarser picture show through.
  const IMAGERY_GLSL = [
    'uniform float uImagery;    // 1 when imagery is drawn',
    'uniform float uFar;        // 1 when places over 90° of longitude from the view centre are in sight',
    'uniform vec2 uCentreLat;   // sine and cosine of the latitude at the view centre',
    'uniform sampler2D uMosaic0, uMosaic1, uMosaic2;',
    'uniform vec4 uPlace0, uPlace1, uPlace2;   // per mosaic: texture coordinates of the view centre, then texture widths and heights per world width',
    'uniform vec4 uLimit0, uLimit1, uLimit2;   // per mosaic: the range of u it covers, then the range of v the Mercator square maps to',
    'uniform vec2 uUse;         // 1 for each of mosaics 1 and 2 that is in use',
    'const float TURN = 6.28318530718;',
    '',
    '// Where the pixel is in Web Mercator relative to the view centre, in world widths: .x east',
    '// and .z south. .y is east again, but measured from the meridian opposite the centre: for',
    '// the pixels with .w = 1, which are over 90° of longitude from the centre. `v` is the pixel',
    '// on the unit sphere in view space, r2 its squared distance from the middle of the disc.',
    '// Everything comes from the pixel\'s small offset from the centre, never from absolute',
    '// longitudes and latitudes, which float32 cannot hold finely enough at deep zoom.',
    'vec4 mercatorOffset(vec3 v, float r2) {',
    '  float drop = -r2 / (1.0 + v.z);                                    // v.z - 1',
    '  float ahead = uCentreLat.y * (1.0 + drop) - uCentreLat.x * v.y;    // toward the equator on the centre meridian',
    '  float rise = uCentreLat.x * drop + uCentreLat.y * v.y;             // sin(latitude) - sin(centre latitude)',
    '  // Longitude from the centre: for small angles a short series is exact where atan is not',
    '  float q = v.x / max(ahead, 1e-6);',
    '  bool none = abs(v.x) + abs(ahead) == 0.0;                          // at a pole there is no longitude',
    '  float lonA = ahead > 0.0 && abs(q) < 0.1 ? q * (1.0 - q * q * (1.0 / 3.0 - 0.2 * q * q)) : atan(v.x, none ? 1.0 : ahead);',
    '  float lonB = atan(-v.x, none ? 1.0 : -ahead);',
    '  // Mercator y is atanh(sin(latitude)), and atanh(a) - atanh(b) = atanh((a - b) / (1 - a b))',
    '  float t = clamp(rise / max(1.0 - (uCentreLat.x + rise) * uCentreLat.x, 1e-9), -0.999999, 0.999999);',
    '  float t2 = t * t;',
    '  float north = abs(t) < 0.1 ? t * (1.0 + t2 * (1.0 / 3.0 + t2 * (0.2 + t2 / 7.0))) : 0.5 * log((1.0 + t) / (1.0 - t));',
    '  return vec4(lonA / TURN, lonB / TURN + 0.5, -north / TURN, step(ahead, 0.0));',
    '}',
    '',
    '// A mosaic\'s colour at Mercator offset d from the view centre: premultiplied, and nothing',
    '// where it has no tile or does not reach.',
    'vec4 mosaic(sampler2D tex, vec4 place, vec4 limit, vec2 d) {',
    '  vec2 uv = place.xy + d * place.zw;',
    '  uv.y = clamp(uv.y, limit.z, limit.w);      // past 85.0511° the last row of the map carries on to the pole',
    '  float inside = step(limit.x, uv.x) * step(uv.x, limit.y) * step(0.0, uv.y) * step(uv.y, 1.0);',
    '  return texture2D(tex, uv) * inside;',
    '}',
    '',
    '// Lays the imagery under the pixel over `rgb`.',
    'vec3 imagery(vec3 rgb, vec3 v, float r2) {',
    '  vec4 m = mercatorOffset(v, r2);',
    '  vec4 c0 = mosaic(uMosaic0, uPlace0, uLimit0, m.xz);',
    '  vec4 c1 = vec4(0.0);',
    '  vec4 c2 = vec4(0.0);',
    '  if (uUse.x > 0.5) c1 = mosaic(uMosaic1, uPlace1, uLimit1, m.xz);',
    '  if (uUse.y > 0.5) c2 = mosaic(uMosaic2, uPlace2, uLimit2, m.xz);',
    '  if (uFar > 0.5) {',
    '    // The first measure of longitude jumps at the meridian opposite the centre (in sight',
    '    // beyond a pole), and along a jump the GPU would pick far too coarse a mipmap. Pixels',
    '    // on that side of the globe use the second measure, which runs smoothly there.',
    '    c0 = mix(c0, mosaic(uMosaic0, uPlace0, uLimit0, m.yz), m.w);',
    '    if (uUse.x > 0.5) c1 = mix(c1, mosaic(uMosaic1, uPlace1, uLimit1, m.yz), m.w);',
    '    if (uUse.y > 0.5) c2 = mix(c2, mosaic(uMosaic2, uPlace2, uLimit2, m.yz), m.w);',
    '  }',
    '  rgb = c0.rgb + rgb * (1.0 - c0.a);',
    '  rgb = c1.rgb + rgb * (1.0 - c1.a);',
    '  return c2.rgb + rgb * (1.0 - c2.a);',
    '}'
  ].join('\n');

  // Ocean (or imagery), graticule and atmosphere halo, computed per pixel.
  const SPHERE_FS = [
    PRECISION,
    LIMB_GLSL,
    'uniform mat3 uRot;         // geographic → view rotation',
    'uniform vec4 uOcean, uOceanEdge, uGraticule, uAtmosphere;',
    'uniform float uHaloPx;     // halo width in device px',
    'uniform float uGridPx;     // graticule line width in device px',
    'const float GRID = 0.3490658504;   // 20 degrees',
    IMAGERY_GLSL,
    '',
    '// Coverage of the nearest grid line, given a coordinate in radians and the length of',
    '// its screen-space gradient in radians per device px.',
    'float gridLine(float value, float gradient) {',
    '  float d = abs(fract(value / GRID + 0.5) - 0.5) * GRID;',
    '  return clamp(0.5 * uGridPx + 0.5 - d / max(gradient, 1e-9), 0.0, 1.0);',
    '}',
    '',
    'void main() {',
    '  vec2 p = discPosition();',
    '  float r2 = dot(p, p);',
    '  float r = sqrt(r2);',
    '  float cover = discCoverage(r);',
    '  float z = sqrt(max(1.0 - r2, 0.0));',
    '  float q = min(r2, 1.0);',
    '  vec3 rgb = mix(uOcean.rgb, uOceanEdge.rgb, q * q);',
    '  // Texture lookups may not sit inside a per-pixel branch (the GPU could not choose a',
    '  // mipmap), so imagery is looked up for every pixel of the quad, the halo included',
    '  if (uImagery > 0.5) rgb = imagery(rgb, vec3(p, z), q);',
    '  if (cover > 0.0) {',
    '    // The point of the sphere under the pixel in geographic space (x toward 0°N 0°E, z',
    '    // toward the north pole)',
    '    vec3 geo = vec3(p, z) * uRot;',
    '    if (uGraticule.a > 0.0 && z > 0.02) {',
    '      // Gradients of lon/lat across the screen, derived analytically: unlike dFdx they',
    '      // need no extension and have no seam at the antimeridian.',
    '      vec2 slope = p / z;',
    '      vec2 dgx = uRot[0].xy - slope * uRot[0].z;',
    '      vec2 dgy = uRot[1].xy - slope * uRot[1].z;',
    '      vec2 dgz = uRot[2].xy - slope * uRot[2].z;',
    '      float cos2 = max(1.0 - geo.z * geo.z, 1e-6);',
    '      float latGrad = length(dgz) / sqrt(cos2) * uInvRadius.x;',
    '      float lonGrad = length(geo.x * dgy - geo.y * dgx) / cos2 * uInvRadius.x;',
    '      float lat = asin(clamp(geo.z, -1.0, 1.0));',
    '      float lon = atan(geo.y, geo.x);',
    '      // Meridians stop at 80° so they do not pile up at the poles',
    '      float meridians = gridLine(lon, lonGrad) * (1.0 - smoothstep(0.9816, 0.9877, abs(geo.z)));',
    '      float lines = max(gridLine(lat, latGrad), meridians);',
    '      rgb = mix(rgb, uGraticule.rgb, uGraticule.a * lines * smoothstep(0.02, 0.3, z));',
    '    }',
    '    rgb = shadeLimb(rgb, r);',
    '  }',
    '  float t = clamp((r - 1.0) * uRadiusPx / uHaloPx, 0.0, 1.0);',
    '  float halo = uAtmosphere.a * (1.0 - t) * (1.0 - t) * (1.0 - t);',
    '  gl_FragColor = vec4(rgb, 1.0) * cover + vec4(uAtmosphere.rgb * halo, halo) * (1.0 - cover);',
    '}'
  ].join('\n');

  // Fills: unit-sphere triangles rotated into view space. View-space z is mapped so that the
  // far hemisphere (z < 0) falls outside clip space and is cut off by the GPU, while the
  // point nearest the viewer (z = 1, give or take float rounding) stays well inside it.
  const FILL_VS = [
    'attribute vec3 aPos;',
    'attribute float aFeature;',
    'uniform mat3 uRot;',
    'uniform vec2 uScale;       // globe radius in clip units, per axis',
    'uniform vec2 uTexSize;     // style texture size in texels',
    'varying vec2 vStyleUv;',
    'void main() {',
    '  vec3 v = uRot * aPos;',
    '  gl_Position = vec4(v.xy * uScale, 1.0 - v.z, 1.0);',
    '  float row = floor(aFeature / uTexSize.x);',
    '  vStyleUv = (vec2(aFeature - row * uTexSize.x, row) + 0.5) / uTexSize;',
    '}'
  ].join('\n');

  const FILL_FS = [
    PRECISION,
    LIMB_GLSL,
    'uniform sampler2D uStyles; // one RGBA texel per feature, straight alpha',
    'varying vec2 vStyleUv;',
    'void main() {',
    '  vec4 c = texture2D(uStyles, vStyleUv);',
    '  if (c.a == 0.0) discard;',
    '  float r = length(discPosition());',
    '  float a = c.a * discCoverage(r);',
    '  gl_FragColor = vec4(shadeLimb(c.rgb, r) * a, a);',
    '}'
  ].join('\n');

  // Borders: one quad per segment, widened in screen space so the line keeps a constant
  // pixel width at any zoom. Each corner knows its own end of the segment, the way to the
  // other end, and the way on to the neighbouring segment's far point. Where the two segments
  // are long enough on screen the corner sits on the bisector between them (a miter join),
  // so wide lines turn without gaps or overlaps. Where they are too short for that (a
  // coastline wiggling within a pixel when zoomed out) each quad is simply cut square.
  const LINE_VS = [
    'attribute vec3 aPos;',
    'attribute vec3 aToOther;   // to the other end of this segment, as a fraction of DELTA',
    'attribute vec3 aToNext;    // to the far point of the neighbouring segment, likewise',
    'attribute float aSide;     // +1/-1 at the start of the segment, +2/-2 at its end; the sign picks the edge',
    'uniform mat3 uRot;',
    'uniform vec2 uRadius;      // globe radius in device px, per axis',
    'uniform vec2 uPxToClip;    // 2 / backing-store size',
    'uniform float uHalfWidth;  // half the quad width in device px',
    'varying float vAcross;',
    'const float DELTA = ' + LINE_DELTA.toFixed(4) + ';',
    'void main() {',
    '  vec3 here = uRot * aPos;',
    '  vec2 own = (uRot * aToOther).xy * uRadius * DELTA;',
    '  vec2 next = (uRot * aToNext).xy * uRadius * DELTA;',
    '  float lo = length(own);',
    '  float ln = length(next);',
    '  // Directions of travel along the line: of this segment (u) and of its neighbour (w)',
    '  float dir = abs(aSide) > 1.5 ? -1.0 : 1.0;',
    '  vec2 u = lo > 1e-6 ? own / lo * dir : vec2(1.0, 0.0);',
    '  vec2 w = ln > 1e-6 ? next / ln * -dir : u;',
    '  vec2 square = vec2(-u.y, u.x);',
    '  vec2 t = u + w;',
    '  float lt = length(t);',
    '  vec2 offset = square;',
    '  if (lt > 0.1) {',
    '    // A miter reaches further out, and further along the segment, the sharper the corner',
    '    // (capped at twice the half-width). Use it when both segments are long enough to',
    '    // hold it, and fade to a square end as they get too short.',
    '    vec2 miter = vec2(-t.y, t.x) / lt;',
    '    float c = max(dot(miter, square), 0.5);',
    '    float along = uHalfWidth * sqrt(1.0 - c * c) / c;',
    '    offset = mix(square, miter / c, clamp(min(lo, ln) / max(along, 1e-3) - 1.0, 0.0, 1.0));',
    '  }',
    '  vAcross = sign(aSide) * uHalfWidth;',
    '  gl_Position = vec4((here.xy * uRadius + offset * vAcross) * uPxToClip, 1.0 - here.z, 1.0);',
    '}'
  ].join('\n');

  const LINE_FS = [
    PRECISION,
    LIMB_GLSL,
    'uniform vec4 uColor;       // straight alpha',
    'uniform float uWidth;      // line width in device px',
    'varying float vAcross;',
    'void main() {',
    '  // Lines thinner than a pixel are drawn one pixel wide and proportionally fainter',
    '  float w = max(uWidth, 1.0);',
    '  float r = length(discPosition());',
    '  float a = uColor.a * (uWidth / w) * clamp(0.5 * w + 0.5 - abs(vAcross), 0.0, 1.0) * discCoverage(r);',
    '  // Borders crowd together where the surface turns away at the limb: fade them out there',
    '  a *= smoothstep(0.0, 0.3, sqrt(max(1.0 - r * r, 0.0)));',
    '  gl_FragColor = vec4(shadeLimb(uColor.rgb, r) * a, a);',
    '}'
  ].join('\n');

  /* =========================================================
   * WEBGL RENDERER
   * ========================================================= */

  // Returns a renderer drawing on `canvas` with WebGL 1, or null when no context is available.
  function createGLRenderer(canvas) {
    const attrs = { antialias: true, alpha: true, premultipliedAlpha: true, depth: false, stencil: true };
    const gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
    if (!gl) return null;

    let wideIndex = false;      // OES_element_index_uint available
    let quad = null;            // the four corners (±1, ±1) of the sphere pass
    let sphere = null, fill = null, line = null;
    let enabledAttribs = 0;
    let anisotropic = null, anisotropy = 1;     // EXT_texture_filter_anisotropic, and how much of it to use

    function compile(vs, fs, attribs) {
      const program = gl.createProgram();
      [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]].forEach(pair => {
        const shader = gl.createShader(pair[0]);
        gl.shaderSource(shader, pair[1]);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
          throw new Error('Globe shader: ' + gl.getShaderInfoLog(shader));
        }
        gl.attachShader(program, shader);
      });
      attribs.forEach((name, i) => gl.bindAttribLocation(program, i, name));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
        throw new Error('Globe program: ' + gl.getProgramInfoLog(program));
      }
      const uniforms = {};
      const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) || 0;
      for (let i = 0; i < count; i++) {
        const name = gl.getActiveUniform(program, i).name;
        uniforms[name] = gl.getUniformLocation(program, name);
      }
      return { program, u: uniforms };
    }

    // (Re)creates everything that lives in the GL context. Called again after a context loss.
    function init() {
      wideIndex = !!gl.getExtension('OES_element_index_uint');
      sphere = compile(SPHERE_VS, SPHERE_FS, ['aCorner']);
      sphere.place = [sphere.u.uPlace0, sphere.u.uPlace1, sphere.u.uPlace2];
      sphere.limit = [sphere.u.uLimit0, sphere.u.uLimit1, sphere.u.uLimit2];
      // Imagery mosaics are read from texture units 1 to 3; unit 0 is for everything else
      gl.useProgram(sphere.program);
      gl.uniform1i(sphere.u.uMosaic0, 1);
      gl.uniform1i(sphere.u.uMosaic1, 2);
      gl.uniform1i(sphere.u.uMosaic2, 3);
      api.maxMosaicTiles = Math.floor((gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0) / TILE_PX);
      // Imagery is seen at a slant everywhere but the middle of the disc: where the GPU can
      // filter for that, it stays sharp toward the limb
      anisotropic = gl.getExtension('EXT_texture_filter_anisotropic');
      anisotropy = anisotropic ? Math.min(4, gl.getParameter(anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1) : 1;
      fill = compile(FILL_VS, FILL_FS, ['aPos', 'aFeature']);
      line = compile(LINE_VS, LINE_FS, ['aPos', 'aToOther', 'aToNext', 'aSide']);
      quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      enabledAttribs = 0;
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);     // premultiplied alpha throughout
      gl.clearColor(0, 0, 0, 0);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
      gl.activeTexture(gl.TEXTURE0);
    }

    // Enables vertex attribute arrays 0..count-1 and disables the rest.
    function useAttribs(count) {
      for (let i = enabledAttribs; i < count; i++) gl.enableVertexAttribArray(i);
      for (let i = count; i < enabledAttribs; i++) gl.disableVertexAttribArray(i);
      enabledAttribs = count;
    }

    // Uniforms go to WebGL as typed arrays: a fractional number passed directly is boxed on
    // the way in, which would leave a little garbage behind on every frame.
    const one = new Float32Array(1), two = new Float32Array(2), four = new Float32Array(4);
    function set1(location, a) { one[0] = a; gl.uniform1fv(location, one); }
    function set2(location, a, b) { two[0] = a; two[1] = b; gl.uniform2fv(location, two); }
    function setColor(location, c) {
      four[0] = c[0] / 255; four[1] = c[1] / 255; four[2] = c[2] / 255; four[3] = c[3];
      gl.uniform4fv(location, four);
    }

    // Without 32-bit indices: a copy of the vertices with one per triangle corner.
    function unindexed(verts, index, stride) {
      const flat = new Float32Array(index.length * stride);
      for (let i = 0; i < index.length; i++) flat.set(verts.subarray(index[i] * stride, (index[i] + 1) * stride), i * stride);
      return flat;
    }

    // Creates a vertex buffer and, when 32-bit indices are available, its index buffer.
    function upload(verts, index, stride) {
      const out = { verts: gl.createBuffer(), index: null, count: index.length };
      gl.bindBuffer(gl.ARRAY_BUFFER, out.verts);
      gl.bufferData(gl.ARRAY_BUFFER, wideIndex ? verts : unindexed(verts, index, stride), gl.STATIC_DRAW);
      if (wideIndex) {
        out.index = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, out.index);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW);
      }
      return out;
    }

    // Uploads a built layer's buffers and style texture.
    function uploadLayer(layer) {
      const m = layer.mesh;
      // Border quads are four corners in a row: two triangles each
      const quadIndex = new Uint32Array(m.segCount * 6);
      for (let i = 0, v = 0; i < quadIndex.length; i += 6, v += 4) {
        quadIndex[i] = v; quadIndex[i + 1] = v + 1; quadIndex[i + 2] = v + 2;
        quadIndex[i + 3] = v + 2; quadIndex[i + 4] = v + 1; quadIndex[i + 5] = v + 3;
      }
      const g = { fill: upload(m.verts, m.index, 4), lines: upload(m.quads, quadIndex, 7), styles: gl.createTexture() };
      gl.bindTexture(gl.TEXTURE_2D, g.styles);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, layer.texWidth, layer.texHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, layer.texels);
      layer.texelsDirty = false;
      layer.gpu = g;
    }

    function freeLayer(layer) {
      const g = layer.gpu;
      if (!g) return;
      [g.fill, g.lines].forEach(b => { gl.deleteBuffer(b.verts); if (b.index) gl.deleteBuffer(b.index); });
      gl.deleteTexture(g.styles);
      layer.gpu = null;
    }

    // An imagery mosaic: an RGBA texture that tiles are copied into, transparent where none
    // has been. It has no size until resetMosaic gives it one.
    function createMosaic() {
      return { texture: gl.createTexture(), stale: false };
    }

    // Empties a mosaic and makes it width × height px (powers of two, so that it can have
    // mipmaps and, with `repeat`, wrap round from east to west).
    function resetMosaic(m, width, height, repeat) {
      gl.bindTexture(gl.TEXTURE_2D, m.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (anisotropy > 1) gl.texParameterf(gl.TEXTURE_2D, anisotropic.TEXTURE_MAX_ANISOTROPY_EXT, anisotropy);
      gl.generateMipmap(gl.TEXTURE_2D);
      m.stale = false;
    }

    // Copies a tile (an image or canvas TILE_PX square) into a mosaic with its top-left
    // corner at (x, y) px. The mosaic's mipmaps are brought up to date before the next frame.
    function putTile(m, source, x, y) {
      gl.bindTexture(gl.TEXTURE_2D, m.texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      m.stale = true;
    }

    // Binds the mosaics in use and sets the imagery uniforms of the sphere pass.
    function prepareImagery(im) {
      gl.uniform1f(sphere.u.uImagery, im.on ? 1 : 0);
      if (!im.on) return;
      gl.uniform1f(sphere.u.uFar, im.far ? 1 : 0);
      set2(sphere.u.uCentreLat, im.sinLat, im.cosLat);
      for (let i = 0; i < 3; i++) {
        const m = im.mosaics[i];
        if (m.z < 0 || !m.gpu) continue;
        gl.activeTexture(gl.TEXTURE1 + i);
        gl.bindTexture(gl.TEXTURE_2D, m.gpu.texture);
        if (m.gpu.stale) { gl.generateMipmap(gl.TEXTURE_2D); m.gpu.stale = false; }
        gl.uniform4fv(sphere.place[i], m.place);
        gl.uniform4fv(sphere.limit[i], m.limit);
      }
      gl.uniform2f(sphere.u.uUse, im.mosaics[1].z < 0 ? 0 : 1, im.mosaics[2].z < 0 ? 0 : 1);
      gl.activeTexture(gl.TEXTURE0);
    }

    // Draws an uploaded buffer as triangles; its attributes must already be set up.
    function drawTriangles(b) {
      if (b.index) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.index);
        gl.drawElements(gl.TRIANGLES, b.count, gl.UNSIGNED_INT, 0);
      } else {
        gl.drawArrays(gl.TRIANGLES, 0, b.count);
      }
    }

    // Sets the uniforms every program shares for this frame.
    function prepare(p, s, cx, cy, rx, ry) {
      gl.useProgram(p.program);
      set2(p.u.uCenter, cx, cy);
      set2(p.u.uInvRadius, 1 / rx, 1 / ry);
      set1(p.u.uRadiusPx, rx);
      setColor(p.u.uLimb, s.theme.limb);
      gl.uniformMatrix3fv(p.u.uRot, false, s.rot);
    }

    function draw(s) {
      const sx = s.pw / s.w, sy = s.ph / s.h;           // device px per CSS px
      const cx = s.pw / 2, cy = s.ph / 2;
      const rx = s.radius * sx, ry = s.radius * sy;      // globe radius in device px
      const scaleX = 2 * s.radius / s.w, scaleY = 2 * s.radius / s.h;
      gl.viewport(0, 0, s.pw, s.ph);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

      // Sphere: one quad just large enough for the disc and its halo
      prepare(sphere, s, cx, cy, rx, ry);
      const reach = s.radius + s.haloPx + 1;
      set2(sphere.u.uQuad, Math.min(1, 2 * reach / s.w), Math.min(1, 2 * reach / s.h));
      setColor(sphere.u.uOcean, s.theme.ocean);
      setColor(sphere.u.uOceanEdge, s.theme.oceanEdge);
      setColor(sphere.u.uAtmosphere, s.theme.atmosphere);
      if (s.graticule) setColor(sphere.u.uGraticule, s.theme.graticule);
      else gl.uniform4f(sphere.u.uGraticule, 0, 0, 0, 0);
      set1(sphere.u.uHaloPx, s.haloPx * sx);
      set1(sphere.u.uGridPx, GRATICULE_PX * sx);
      prepareImagery(s.imagery);
      useAttribs(1);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      prepare(fill, s, cx, cy, rx, ry);
      set2(fill.u.uScale, scaleX, scaleY);
      gl.uniform1i(fill.u.uStyles, 0);
      prepare(line, s, cx, cy, rx, ry);
      set2(line.u.uRadius, rx, ry);
      set2(line.u.uPxToClip, 2 / s.pw, 2 / s.ph);

      for (let i = 0; i < s.layers.length; i++) {
        const layer = s.layers[i], g = layer.gpu;
        if (!layer.visible || !g) continue;
        if (g.fill.count) {
          // Flat triangles on a sphere overlap their neighbours by a sliver wherever the
          // surface turns from the viewer. The stencil lets each layer touch a sample once,
          // so translucent fills never blend twice.
          gl.enable(gl.STENCIL_TEST);
          gl.stencilFunc(gl.NOTEQUAL, i % 255 + 1, 0xff);
          gl.useProgram(fill.program);
          gl.bindTexture(gl.TEXTURE_2D, g.styles);
          if (layer.texelsDirty) {
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, layer.texWidth, layer.texHeight, gl.RGBA, gl.UNSIGNED_BYTE, layer.texels);
            layer.texelsDirty = false;
          }
          set2(fill.u.uTexSize, layer.texWidth, layer.texHeight);
          useAttribs(2);
          gl.bindBuffer(gl.ARRAY_BUFFER, g.fill.verts);
          gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
          gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 12);
          drawTriangles(g.fill);
          gl.disable(gl.STENCIL_TEST);
        }
        if (g.lines.count && layer.bordersVisible && layer.borderWidth > 0 && layer.borderColor[3] > 0) {
          const width = layer.borderWidth * sx;
          gl.useProgram(line.program);
          setColor(line.u.uColor, layer.borderColor);
          set1(line.u.uWidth, width);
          set1(line.u.uHalfWidth, 0.5 * Math.max(width, 1) + 1);
          useAttribs(4);
          gl.bindBuffer(gl.ARRAY_BUFFER, g.lines.verts);
          gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
          gl.vertexAttribPointer(1, 3, gl.SHORT, true, 28, 12);
          gl.vertexAttribPointer(2, 3, gl.SHORT, true, 28, 18);
          gl.vertexAttribPointer(3, 1, gl.SHORT, false, 28, 24);
          drawTriangles(g.lines);
        }
      }
    }

    function destroy() {
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    }

    const api = {
      kind: 'webgl', needsMesh: true, init, draw, uploadLayer, freeLayer, destroy,
      createMosaic, resetMosaic, putTile,
      maxMosaicTiles: 0             // the largest texture this GPU takes, in tiles on a side
    };
    init();
    return api;
  }

  /* =========================================================
   * CANVAS 2D RENDERER (fallback)
   * ========================================================= */

  // Draws the same scene with d3.geoPath. Far slower than WebGL, so while the view is moving
  // it skips adaptive resampling and anything too small to see; the settled frame is exact.
  function createCanvasRenderer(canvas) {
    const ctx = canvas.getContext('2d');
    const projection = d3.geoOrthographic().clipAngle(90);
    const path = d3.geoPath(projection, ctx);
    const grid = d3.geoGraticule().step([20, 20]).extent([[-180, -80.001], [180, 80.001]])();
    let gradients = null, gradientKey = '';

    // Radial gradients for the halo, the ocean and the rim shading; rebuilt only when the
    // globe's size or the theme changes.
    function gradientsFor(s, cx, cy, R) {
      const t = s.theme;
      const key = [cx, cy, R, s.haloPx, t.ocean, t.oceanEdge, t.atmosphere, t.limb].join('|');
      if (key === gradientKey) return gradients;
      const rgba = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
      const halo = ctx.createRadialGradient(cx, cy, R, cx, cy, R + s.haloPx);
      for (let i = 0; i <= 4; i++) halo.addColorStop(i / 4, rgba(t.atmosphere, t.atmosphere[3] * Math.pow(1 - i / 4, 3)));
      const ocean = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      const shade = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      for (let i = 0; i <= 8; i++) {
        const r = i / 8, m = Math.pow(r, 4);
        ocean.addColorStop(r, rgba([0, 1, 2].map(j => Math.round(t.ocean[j] + (t.oceanEdge[j] - t.ocean[j]) * m)), 1));
        shade.addColorStop(r, rgba(t.limb, t.limb[3] * 0.55 * Math.pow(r, 12)));
      }
      gradientKey = key;
      gradients = { halo, ocean, shade };
      return gradients;
    }

    function draw(s) {
      const cx = s.w / 2, cy = s.h / 2, R = s.radius;
      ctx.setTransform(s.pw / s.w, 0, 0, s.ph / s.h, 0, 0);
      ctx.clearRect(0, 0, s.w, s.h);
      const g = gradientsFor(s, cx, cy, R);
      ctx.fillStyle = g.halo;
      ctx.beginPath(); ctx.arc(cx, cy, R + s.haloPx, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = g.ocean;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.fill();

      projection.rotate([-s.view.lon, -s.view.lat]).scale(R).translate([cx, cy]).precision(s.moving ? 0 : 0.5);
      if (s.graticule && s.theme.graticule[3] > 0) {
        ctx.beginPath(); path(grid);
        ctx.strokeStyle = cssOf(s.theme.graticule); ctx.lineWidth = GRATICULE_PX; ctx.stroke();
      }

      // What can be on screen: everything within this angle of the view centre
      const reach = Math.hypot(cx, cy);
      const visible = reach >= R ? Math.PI / 2 : Math.asin(reach / R);
      const vx = s.rot[2], vy = s.rot[5], vz = s.rot[8];       // direction of the view centre
      const minRadius = s.moving ? Math.asin(Math.min(1, 0.75 / R)) : 0;
      const shown = c => c.radius >= minRadius &&
        Math.acos(clamp(c.cx * vx + c.cy * vy + c.cz * vz, -1, 1)) - c.radius <= visible;

      for (let l = 0; l < s.layers.length; l++) {
        const layer = s.layers[l];
        if (!layer.visible) continue;
        const t = layer.texels;
        for (let i = 0; i < layer.features.length; i++) {
          if (!t[i * 4 + 3]) continue;
          const parts = layer.meta[i].parts;
          let any = false;
          for (let p = 0; p < parts.length; p++) {
            if (!shown(parts[p])) continue;
            if (!any) { ctx.beginPath(); any = true; }
            path(parts[p].geom);
          }
          if (any) {
            ctx.fillStyle = 'rgba(' + t[i * 4] + ',' + t[i * 4 + 1] + ',' + t[i * 4 + 2] + ',' + t[i * 4 + 3] / 255 + ')';
            ctx.fill();
          }
        }
        layer.texelsDirty = false;
        if (layer.bordersVisible && layer.borderWidth > 0 && layer.borderColor[3] > 0) {
          ctx.beginPath();
          for (let i = 0; i < layer.lines.length; i++) if (shown(layer.lines[i])) path(layer.lines[i].geom);
          ctx.strokeStyle = cssOf(layer.borderColor);
          ctx.lineWidth = layer.borderWidth;
          ctx.lineJoin = 'round';
          ctx.stroke();
        }
      }

      ctx.fillStyle = g.shade;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.fill();
      ctx.strokeStyle = cssOf([s.theme.limb[0], s.theme.limb[1], s.theme.limb[2], s.theme.limb[3] * 0.45]);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(R - 0.75, 0), 0, 2 * Math.PI); ctx.stroke();
    }

    return { kind: 'canvas2d', needsMesh: false, init() {}, draw, uploadLayer() {}, freeLayer() {}, destroy() {} };
  }

  /* =========================================================
   * ENGINE
   * ========================================================= */

  function create(hostElement, options) {
    const opts = options || {};
    let host = null;                 // the element the canvases live in (see attachTo)
    let previousTouchAction = '';    // the host's own touch-action, restored when we leave it
    let madeRelative = false;        // we gave the host position: relative
    let minZoom = 1, maxZoom = 80;
    let dblClickZoom = true;         // a double click or double tap zooms in

    /* ----- Canvases and renderer ----- */

    function makeCanvas(className) {
      const c = document.createElement('canvas');
      c.className = className;
      c.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:block;';
      return c;
    }
    // The scene canvas keeps the class `globe-gl` in both rendering modes
    function makeSceneCanvas() {
      const c = makeCanvas('globe-gl');
      c.style.cursor = 'var(--globe-cursor, grab)';
      c.style.userSelect = c.style.webkitUserSelect = 'none';
      c.addEventListener('webglcontextlost', onContextLost);
      c.addEventListener('webglcontextrestored', onContextRestored);
      return c;
    }
    let sceneCanvas = makeSceneCanvas();
    const overlayCanvas = makeCanvas('globe-overlay');
    overlayCanvas.style.pointerEvents = 'none';
    const octx = overlayCanvas.getContext('2d');
    // WebGL when it can be had, Canvas 2D otherwise (and see fallBackToCanvas)
    let renderer = null;
    if (!opts.forceCanvas2D) {
      try {
        renderer = createGLRenderer(sceneCanvas);
      } catch (e) {
        console.warn('Globe: WebGL could not be set up; drawing with Canvas 2D instead.', e);
        sceneCanvas = makeSceneCanvas();      // a canvas that has given out a WebGL context cannot give a 2D one
      }
    }
    if (!renderer) renderer = createCanvasRenderer(sceneCanvas);

    /* ----- State ----- */

    const view = { lon: 0, lat: 0, k: 1 };
    // Everything a renderer needs to draw a frame
    const scene = {
      w: 0, h: 0,                    // host size, CSS px
      pw: 0, ph: 0,                  // backing-store size, device px
      radius: 0,                     // globe radius, CSS px
      haloPx: 0,                     // halo width, CSS px
      rot: new Float32Array(9),      // geographic → view rotation, column-major (see viewRows)
      view,
      theme: {},
      graticule: true,
      layers: [],                    // the layers on screen, bottom first
      moving: false,                 // the view changed less than SETTLE_MS ago
      // Satellite imagery (see the Imagery section): whether any is drawn, its mosaics from
      // the bottom up, and what the shader needs to know about the view
      imagery: { on: false, mosaics: [], far: false, sinLat: 0, cosLat: 1 }
    };
    const rows = new Float64Array(9);          // the same rotation as rows X, Y, Z
    const vecA = new Float64Array(3), vecB = new Float64Array(3);    // scratch unit vectors
    let baseRadius = 0;                        // globe radius at k = 1
    const styles = new Map();                  // style name → [r, g, b, a]
    let pendingLayers = null;                  // layers being built; they replace scene.layers when done
    let buildTimer = 0;
    let buildResolvers = [];                   // resolve functions of the setLayers promises still waiting
    let lastBuildMs = 0;
    const flashes = [];                        // { layer, index, color, start, ms }
    const hover = { layer: null, index: -1 };
    const listeners = {};
    const overlays = [];
    let overlayUsed = false;
    let home = { lon: 0, lat: 0, k: 1 };
    let homeFit = null;                        // the fit that `home` was derived from, if any
    let fitBeforeLayout = false;               // fitTo ran before the host had a size; applied on first layout
    let fitPoints = new Float64Array(3 * 1024);    // scratch for measureFit
    let rafId = 0, needsDraw = true, viewChanged = false;
    let inMotion = false;                      // a fly, zoom ease, glide or spin is running
    let paused = false, destroyed = false, contextLost = false, readyFired = false;
    let lastFrameTime = 0, animateUntil = 0;
    let settleTimer = 0, lastViewChange = 0;
    const stats = { frames: 0, lastFrameMs: 0, avgFrameMs: 0 };
    // Reused for every 'view' event; listeners copy the values if they keep them
    const viewEvent = { lon: 0, lat: 0, k: 1 };
    const viewInfo = { moving: false };
    const reducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

    /* ----- Events ----- */

    function on(name, fn) {
      (listeners[name] || (listeners[name] = [])).push(fn);
      return () => {
        const list = listeners[name], i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
      };
    }

    function listening(name) {
      return typeof api['on' + name] === 'function' || !!(listeners[name] && listeners[name].length);
    }

    // Calls api.on<name> if one was assigned, then every listener added with on().
    function emit(name, a, b) {
      const assigned = api['on' + name];
      if (typeof assigned === 'function') assigned(a, b);
      const list = listeners[name];
      if (list) for (let i = 0; i < list.length; i++) list[i](a, b);
    }

    /* ----- View ----- */

    // Applies a new view, clamped. Everything that moves the globe ends up here.
    function setViewRaw(lon, lat, k) {
      lon = wrapLon(lon);
      lat = clamp(lat, -MAX_LAT, MAX_LAT);
      k = clamp(k, minZoom, maxZoom);
      if (lon === view.lon && lat === view.lat && k === view.k) return;
      view.lon = lon; view.lat = lat; view.k = k;
      updateRotation();
      viewChanged = true;
      requestFrame();
    }

    function updateRotation() {
      viewRows(view.lon, view.lat, rows);
      const m = scene.rot;
      m[0] = rows[0]; m[1] = rows[3]; m[2] = rows[6];
      m[3] = rows[1]; m[4] = rows[4]; m[5] = rows[7];
      m[6] = rows[2]; m[7] = rows[5]; m[8] = rows[8];
      scene.radius = view.k * baseRadius;
    }

    function getView() { return { lon: view.lon, lat: view.lat, k: view.k }; }

    function setView(v) {
      stopMotion();
      setViewRaw(v.lon === undefined ? view.lon : v.lon, v.lat === undefined ? view.lat : v.lat, v.k === undefined ? view.k : v.k);
    }

    // { x, y, visible, z } in CSS px relative to the host. z is the depth toward the viewer
    // (1 at the centre of the disc, 0 on the limb). Pass `out` to reuse an object.
    function project(lonlat, out) {
      return projectVector(unitVector(lonlat, vecB), out || { x: 0, y: 0, visible: false, z: 0 });
    }

    // A geographic vector's components in view space: to the right, up, and toward the viewer.
    function viewX(x, y, z) { return rows[0] * x + rows[1] * y + rows[2] * z; }
    function viewY(x, y, z) { return rows[3] * x + rows[4] * y + rows[5] * z; }
    function viewZ(x, y, z) { return rows[6] * x + rows[7] * y + rows[8] * z; }

    // The same for a unit vector g.
    function projectVector(g, o) {
      o.x = scene.w / 2 + scene.radius * viewX(g[0], g[1], g[2]);
      o.y = scene.h / 2 - scene.radius * viewY(g[0], g[1], g[2]);
      o.z = viewZ(g[0], g[1], g[2]);
      o.visible = o.z > 0;
      return o;
    }

    // Writes the unit vector under host point (x, y) into out[0..2]; false when off the globe.
    function unproject(x, y, out) {
      const px = (x - scene.w / 2) / scene.radius, py = (scene.h / 2 - y) / scene.radius;
      const r2 = px * px + py * py;
      if (!(r2 <= 1)) return false;
      const pz = Math.sqrt(1 - r2);
      out[0] = px * rows[0] + py * rows[3] + pz * rows[6];
      out[1] = px * rows[1] + py * rows[4] + pz * rows[7];
      out[2] = px * rows[2] + py * rows[5] + pz * rows[8];
      return true;
    }

    function invert(x, y) {
      if (!unproject(x, y, vecA)) return null;
      return [Math.atan2(vecA[1], vecA[0]) * DEG, Math.asin(clamp(vecA[2], -1, 1)) * DEG];
    }

    // Turns the globe so that the surface point (gx, gy, gz) sits under host point (x, y).
    // Returns false, changing nothing, when no north-up view can do that.
    function placeUnder(gx, gy, gz, x, y) {
      const u = (x - scene.w / 2) / scene.radius, v = (scene.h / 2 - y) / scene.radius;
      const cp = Math.sqrt(Math.max(0, 1 - gz * gz));
      if (u * u + v * v > 0.96 || Math.abs(u) >= cp) return false;
      const dLon = Math.asin(u / cp);
      const c = cp * Math.cos(dLon);
      const lat = Math.acos(clamp(v / Math.sqrt(1 - u * u), -1, 1)) - Math.atan2(c, gz);
      setViewRaw((Math.atan2(gy, gx) - dLon) * DEG, lat * DEG, view.k);
      return true;
    }

    // Rotates by a pointer movement so the ground follows the pointer.
    function rotateByPixels(dx, dy) {
      const R = scene.radius;
      setViewRaw(view.lon - dx / (R * Math.max(Math.cos(view.lat * RAD), 0.3)) * DEG, view.lat + dy / R * DEG, view.k);
    }

    /* ----- Motion: fly, zoom ease, inertia, spin ----- */

    let fly = null;                 // the running flyTo: { a, b, angle (the arc flown), k0, to, start, duration, resolve }
    const zoom = { active: false, target: 1, anchored: false, gx: 0, gy: 0, gz: 0, x: 0, y: 0 };
    const inertia = { active: false, vx: 0, vy: 0 };
    let spinRate = 0;               // degrees per second
    const pointers = [];            // pointers currently down: { id, x, y }

    function endFly(completed) {
      if (!fly) return;
      const done = fly.resolve;
      fly = null;
      done(completed);
    }

    // Cancels every animation in progress (a running flyTo resolves false).
    function stopMotion() {
      endFly(false);
      zoom.active = false;
      inertia.active = false;
      inMotion = false;
    }

    function flyTo(target, o) {
      stopMotion();
      const to = {
        lon: target.lon === undefined ? view.lon : target.lon,
        lat: clamp(target.lat === undefined ? view.lat : target.lat, -MAX_LAT, MAX_LAT),
        k: clamp(target.k === undefined ? view.k : target.k, minZoom, maxZoom)
      };
      const duration = o && o.duration !== undefined ? o.duration : 700;
      const still = wrapLon(to.lon) === view.lon && to.lat === view.lat && to.k === view.k;
      if (still || duration <= 0 || reducedMotion.matches || !scene.w || paused) {
        setViewRaw(to.lon, to.lat, to.k);
        return Promise.resolve(true);
      }
      return new Promise(resolve => {
        const a = unitVector([view.lon, view.lat], [0, 0, 0]), b = unitVector([to.lon, to.lat], [0, 0, 0]);
        fly = {
          a, b, angle: Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1)),
          k0: view.k, to, start: 0, duration, resolve
        };
        requestFrame();
      });
    }

    // Advances every animation by dt ms. Returns true while any of them is still running.
    function stepMotion(now, dt) {
      if (fly) {
        if (!fly.start) fly.start = now;
        const u = (now - fly.start) / fly.duration;
        if (u >= 1) {
          setViewRaw(fly.to.lon, fly.to.lat, fly.to.k);
          endFly(true);
          return false;
        }
        // Centre along the great circle, zoom geometrically
        const e = easeInOut(u), c = slerp(fly.a, fly.b, fly.angle, e, vecA);
        setViewRaw(Math.atan2(c[1], c[0]) * DEG, Math.asin(clamp(c[2] / Math.hypot(c[0], c[1], c[2]), -1, 1)) * DEG,
          fly.k0 * Math.pow(fly.to.k / fly.k0, e));
        return true;
      }
      let active = false;
      if (zoom.active) {
        const step = reducedMotion.matches ? 1 : 1 - Math.exp(-dt / ZOOM_TAU_MS);
        let k = view.k * Math.pow(zoom.target / view.k, step);
        if (Math.abs(Math.log(zoom.target / k)) < 0.002) { k = zoom.target; zoom.active = false; }
        zoomAbout(k, zoom);
        active = zoom.active;
      }
      if (inertia.active) {
        rotateByPixels(inertia.vx * dt, inertia.vy * dt);
        const decay = Math.exp(-dt / INERTIA_TAU_MS);
        inertia.vx *= decay; inertia.vy *= decay;
        if (inertia.vx * inertia.vx + inertia.vy * inertia.vy < 1e-4) inertia.active = false;
        active = active || inertia.active;
      }
      if (spinRate && !pointers.length && !active) {
        setViewRaw(view.lon + spinRate * dt / 1000, view.lat, view.k);
        active = true;
      }
      return active;
    }

    // Sets the zoom to k, keeping anchor's surface point under its screen position.
    function zoomAbout(k, anchor) {
      setViewRaw(view.lon, view.lat, k);
      if (anchor.anchored) placeUnder(anchor.gx, anchor.gy, anchor.gz, anchor.x, anchor.y);
    }

    // Starts easing the zoom toward `target`, about host point (x, y) if it is on the globe
    // (otherwise about the centre of the screen).
    function zoomToward(target, x, y) {
      endFly(false);
      inertia.active = false;
      zoom.target = clamp(target, minZoom, maxZoom);
      zoom.anchored = x !== undefined && unproject(x, y, vecA);
      if (zoom.anchored) { zoom.gx = vecA[0]; zoom.gy = vecA[1]; zoom.gz = vecA[2]; zoom.x = x; zoom.y = y; }
      zoom.active = true;
      requestFrame();
    }

    function zoomBy(factor, o) {
      if (o && o.animate === false) { stopMotion(); setViewRaw(view.lon, view.lat, view.k * factor); return; }
      zoomToward((zoom.active ? zoom.target : view.k) * factor);
    }

    // Changes the options that can change after creation: { dblClickZoom, minZoom, maxZoom }.
    function setOptions(o) {
      if (o.dblClickZoom !== undefined) dblClickZoom = !!o.dblClickZoom;
      if (o.minZoom !== undefined) minZoom = o.minZoom;
      if (o.maxZoom !== undefined) maxZoom = Math.min(o.maxZoom, ZOOM_LIMIT);
      if (homeFit && scene.w) home.k = fitZoom(homeFit);
      if (zoom.active) zoom.target = clamp(zoom.target, minZoom, maxZoom);
      setViewRaw(view.lon, view.lat, view.k);          // back inside the limits
    }

    function spin(degPerSecond) {
      spinRate = degPerSecond || 0;
      if (spinRate) requestFrame();
    }

    /* ----- Fitting and framing ----- */

    // Where to centre the view on a GeoJSON object and how far it reaches from there:
    // { lon, lat, extentX, extentY }, extents in globe radii (1 = reaches the limb).
    function measureFit(object) {
      const obj = Array.isArray(object) ? { type: 'FeatureCollection', features: object } : object;
      const fit = { lon: view.lon, lat: view.lat, extentX: 1, extentY: 1 };
      // Every position as a unit vector
      let n = 0;
      eachCoord(obj, () => { n++; });
      if (fitPoints.length < n * 3) fitPoints = new Float64Array(n * 3);
      const pts = fitPoints;
      n = 0;
      eachCoord(obj, (lon, lat) => {
        const cp = Math.cos(lat * RAD);
        pts[n++] = cp * Math.cos(lon * RAD); pts[n++] = cp * Math.sin(lon * RAD); pts[n++] = Math.sin(lat * RAD);
      });
      const c = fitCentroid(obj);
      if (!n || !isFinite(c[0]) || !isFinite(c[1])) return fit;
      fit.lon = c[0]; fit.lat = clamp(c[1], -MAX_LAT, MAX_LAT);
      // Start at the centroid, then twice re-centre on the middle of what is seen from
      // there, so lopsided shapes (a country with a far-flung territory) use the whole view.
      const m = new Float64Array(9);
      let minX = 0, maxX = 0, minY = 0, maxY = 0;
      for (let pass = 0; pass < 3; pass++) {
        viewRows(fit.lon, fit.lat, m);
        minX = minY = 2; maxX = maxY = -2;
        for (let i = 0; i < n; i += 3) {
          const gx = pts[i], gy = pts[i + 1], gz = pts[i + 2];
          if (m[6] * gx + m[7] * gy + m[8] * gz < 0.05) return fit;      // reaches round the limb: show the whole globe
          const x = m[0] * gx + m[1] * gy + m[2] * gz, y = m[3] * gx + m[4] * gy + m[5] * gz;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
        if (pass === 2) break;
        const x = (minX + maxX) / 2, y = (minY + maxY) / 2, z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
        const gx = x * m[0] + y * m[3] + z * m[6], gy = x * m[1] + y * m[4] + z * m[7], gz = x * m[2] + y * m[5] + z * m[8];
        fit.lon = Math.atan2(gy, gx) * DEG;
        fit.lat = clamp(Math.asin(clamp(gz, -1, 1)) * DEG, -MAX_LAT, MAX_LAT);
      }
      fit.extentX = Math.max(Math.abs(minX), Math.abs(maxX), 1e-6);
      fit.extentY = Math.max(Math.abs(minY), Math.abs(maxY), 1e-6);
      return fit;
    }

    // The spherical centroid of a GeoJSON object: the area-weighted sum of its features'
    // centroids (what d3.geoCentroid computes, but indifferent to ring winding).
    function fitCentroid(obj) {
      const features = obj.type === 'FeatureCollection' ? obj.features : [obj.type === 'Feature' ? obj : { type: 'Feature', geometry: obj }];
      let x = 0, y = 0, z = 0;
      for (let i = 0; i < features.length; i++) {
        const meta = measureFeature(features[i]);
        x += meta.sx; y += meta.sy; z += meta.sz;
      }
      const len = Math.sqrt(x * x + y * y + z * z);
      return len > 1e-12 ? [Math.atan2(y, x) * DEG, Math.asin(clamp(z / len, -1, 1)) * DEG] : d3.geoCentroid(obj);
    }

    // The zoom at which a measured fit fills the host inside its padding.
    function fitZoom(fit) {
      const R = Math.min((scene.w / 2 - fit.padding) / fit.extentX, (scene.h / 2 - fit.padding) / fit.extentY);
      return clamp(R > 0 ? R / baseRadius : minZoom, minZoom, Math.min(maxZoom, fit.maxZoom || maxZoom));
    }

    function fitTo(object, o) {
      o = o || {};
      const fit = measureFit(object);
      fit.padding = o.padding === undefined ? 24 : o.padding;
      fit.maxZoom = o.maxZoom;
      homeFit = fit;
      home = { lon: fit.lon, lat: fit.lat, k: scene.w ? fitZoom(fit) : view.k };
      if (!scene.w) { fitBeforeLayout = true; return Promise.resolve(true); }
      if (o.animate) return flyTo(home, { duration: o.duration });
      setView(home);
      return Promise.resolve(true);
    }

    function setHome(v) {
      home = { lon: v.lon, lat: v.lat, k: v.k };
      homeFit = null;
    }

    function resetView(o) {
      if (o && o.animate === false) { setView(home); return Promise.resolve(true); }
      return flyTo(home);
    }

    // What buildFeature keeps about a feature, whether or not a layer holds it.
    function measureFeature(feature) {
      return featureMeta.get(feature) || buildFeature(feature, 0, false);
    }

    const projected = { x: 0, y: 0, visible: false, z: 0 };

    function ensureVisible(target, o) {
      o = o || {};
      const margin = o.margin === undefined ? 60 : o.margin;
      let lonlat = target, sizePx = 0;
      if (!Array.isArray(target)) {
        const meta = measureFeature(target);
        // The centroid of a sprawling feature can be off its land altogether: aim at its anchor
        lonlat = meta.radius > ANCHOR_CAP ? anchorOf(meta) : meta.centroid;
        sizePx = 2 * scene.radius * Math.sin(Math.min(meta.radius, Math.PI / 2));
      }
      const p = project(lonlat, projected);
      // Out of sight: behind the globe or seen nearly edge-on at its rim, or at the edge of the host
      const hidden = p.z < 0.35 || p.x < margin || p.x > scene.w - margin || p.y < margin || p.y > scene.h - margin;
      const tiny = sizePx > 0 && sizePx < 10;
      if (!hidden && !tiny) return Promise.resolve(true);
      const to = { lon: lonlat[0], lat: lonlat[1], k: tiny ? view.k * 24 / Math.max(sizePx, 0.01) : view.k };
      if (o.animate === false) { setView(to); return Promise.resolve(true); }
      return flyTo(to);
    }

    /* ----- Styles ----- */

    const TRANSPARENT = [0, 0, 0, 0];
    const mixed = [0, 0, 0, 0];

    function defineStyles(map) {
      Object.keys(map).forEach(name => styles.set(name, parseColor(map[name])));
      eachLayer(repaintLayer);
    }

    function eachLayer(fn) {
      scene.layers.forEach(fn);
      if (pendingLayers) pendingLayers.forEach(layer => { if (scene.layers.indexOf(layer) < 0) fn(layer); });
    }

    // The layer with this id: the one being built if a build is under way, else the one on screen.
    function findLayer(id) {
      const lists = pendingLayers ? [pendingLayers, scene.layers] : [scene.layers];
      for (let l = 0; l < lists.length; l++) {
        for (let i = 0; i < lists[l].length; i++) if (lists[l][i].id === id) return lists[l][i];
      }
      return null;
    }

    // Recomputes one feature's texel: its style (or the hover style), blended toward a
    // flash colour while one is running.
    function repaint(layer, index) {
      const hovered = hover.layer === layer && hover.index === index && layer.hoverStyle &&
        (!layer.hoverAllow || layer.hoverAllow(layer.keys[index]));
      let c = styles.get(hovered ? layer.hoverStyle : layer.styleOf[index] || layer.style) || TRANSPARENT;
      for (let i = 0; i < flashes.length; i++) {
        const f = flashes[i];
        if (f.layer !== layer || f.index !== index) continue;
        // Blend in premultiplied space so fading to or from transparent has no dark fringe
        const m = f.amount, a = f.color[3] * m + c[3] * (1 - m);
        for (let j = 0; j < 3; j++) mixed[j] = a ? (f.color[j] * f.color[3] * m + c[j] * c[3] * (1 - m)) / a : 0;
        mixed[3] = a;
        c = mixed;
      }
      const o = index * 4, t = layer.texels;
      t[o] = c[0]; t[o + 1] = c[1]; t[o + 2] = c[2]; t[o + 3] = Math.round(c[3] * 255);
      layer.texelsDirty = true;
      invalidate();
    }

    function repaintLayer(layer) {
      for (let i = 0; i < layer.features.length; i++) repaint(layer, i);
    }

    function setStyle(layerId, key, styleName) {
      const layer = findLayer(layerId);
      const index = layer ? layer.indexByKey.get(key) : undefined;
      if (index === undefined) return;
      layer.styleOf[index] = styleName || null;
      repaint(layer, index);
    }

    function setStyles(layerId, map) {
      Object.keys(map).forEach(key => setStyle(layerId, key, map[key]));
    }

    function resetStyles(layerId, styleName) {
      const layer = findLayer(layerId);
      if (!layer) return;
      layer.styleOf.fill(styleName || null);
      repaintLayer(layer);
    }

    function flash(layerId, key, styleName, ms) {
      const layer = findLayer(layerId);
      const index = layer ? layer.indexByKey.get(key) : undefined;
      if (index === undefined) return;
      for (let i = flashes.length - 1; i >= 0; i--) {
        if (flashes[i].layer === layer && flashes[i].index === index) flashes.splice(i, 1);
      }
      flashes.push({ layer, index, color: styles.get(styleName) || TRANSPARENT, start: 0, ms: ms || 700, amount: 1 });
      repaint(layer, index);
    }

    // Advances the running flashes: full colour for the first third, then an eased fade.
    function stepFlashes(now) {
      for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i];
        if (!f.start) f.start = now;
        const u = (now - f.start) / f.ms;
        if (u >= 1) flashes.splice(i, 1);
        else { const t = clamp((u - 0.35) / 0.65, 0, 1); f.amount = 1 - t * t * (3 - 2 * t); }
        repaint(f.layer, f.index);
      }
    }

    function setHoverStyle(layerId, styleName, allow) {
      const layer = findLayer(layerId);
      if (!layer) return;
      layer.hoverStyle = styleName || null;
      layer.hoverAllow = allow || null;
      if (hover.layer === layer) repaint(layer, hover.index);
    }

    /* ----- Layers ----- */

    const defaultKey = f => String(f.id);

    // Copies the settings that need no rebuild from a layer definition.
    function configureLayer(layer, def) {
      layer.interactive = !!def.interactive;
      layer.borderColor = parseColor(def.borderColor || 'rgba(0,0,0,0.4)');
      layer.borderWidth = def.borderWidth === undefined ? 0.8 : def.borderWidth;
      layer.bordersVisible = def.bordersVisible !== false;
      layer.visible = def.visible !== false;
      layer.style = def.style || null;
    }

    // Creates a layer from the caller's definition. Keys and styles are ready at once; the
    // geometry is built afterwards in slices. `like` is an existing layer with the same id, if
    // there is one: when it holds the very same features array its fills are taken over, and
    // only the border lines are built again.
    function makeLayer(def, like) {
      const features = def.features || [];
      const n = features.length;
      const layer = {
        id: def.id,
        features,
        key: def.key || defaultKey,
        interactive: false,                    // takes part in picking and hover
        borders: def.borders || null,
        borderColor: null, borderWidth: 0, bordersVisible: true, visible: true,
        style: null,                           // style name for features without one of their own
        keys: new Array(n),
        indexByKey: new Map(),
        styleOf: new Array(n).fill(null),      // per-feature style name, null = the layer's
        hoverStyle: null, hoverAllow: null,
        texWidth: STYLE_TEX_WIDTH,
        texHeight: Math.max(1, Math.ceil(n / STYLE_TEX_WIDTH)),
        texels: null, texelsDirty: true,       // effective colour per feature, RGBA bytes
        meta: new Array(n),                    // per feature, what buildFeature returned
        mesh: renderer.needsMesh ? newMesh() : null,
        lines: null,                           // border lines (with caps) for the 2D renderer
        gpu: null,
        built: false, nextFeature: 0, borderWork: null, nextLine: 0, buildMs: 0, warned: false
      };
      configureLayer(layer, def);
      layer.texels = new Uint8Array(layer.texWidth * layer.texHeight * 4);
      let duplicate;
      for (let i = 0; i < n; i++) {
        layer.keys[i] = layer.key(features[i]);
        if (duplicate === undefined && layer.indexByKey.has(layer.keys[i])) duplicate = layer.keys[i];
        layer.indexByKey.set(layer.keys[i], i);
      }
      if (duplicate !== undefined) {
        console.warn('Globe: layer "' + layer.id + '" has more than one feature with the key "' + duplicate + '"; keys must be unique.');
      }
      if (like && like.built && like.features === features && like.meta.length === n) {
        layer.meta = like.meta;
        layer.nextFeature = n;
        if (layer.mesh) {
          layer.mesh.verts = like.mesh.verts; layer.mesh.vertCount = like.mesh.vertCount;
          layer.mesh.index = like.mesh.index; layer.mesh.indexCount = like.mesh.indexCount;
        }
      }
      repaintLayer(layer);
      return layer;
    }

    // Gives a replacement layer the per-key styles and hover settings of the layer it replaces.
    function inheritStyles(layer, previous) {
      layer.hoverStyle = previous.hoverStyle;
      layer.hoverAllow = previous.hoverAllow;
      for (let i = 0; i < layer.keys.length; i++) {
        const j = previous.indexByKey.get(layer.keys[i]);
        if (j !== undefined) layer.styleOf[i] = previous.styleOf[j];
      }
      repaintLayer(layer);
    }

    // True when a definition describes exactly the geometry a layer already has: the very same
    // features array and borders object, and the same keys.
    function sameGeometry(layer, def) {
      const key = def.key || defaultKey;
      return layer.features === def.features && layer.borders === (def.borders || null) &&
        layer.keys.length === layer.features.length && !layer.features.some((f, i) => key(f) !== layer.keys[i]);
    }

    // Builds feature i of a layer into its meta list and (WebGL) the open mesh.
    function buildLayerFeature(layer, i) {
      const meta = layer.meta[i] = buildFeature(layer.features[i], i, !!layer.mesh);
      if (meta.tooWide && !layer.warned) {
        layer.warned = true;
        console.warn('Globe: layer "' + layer.id + '" has a polygon wider than a hemisphere; it is not drawn.');
      }
    }

    // Metadata for one feature, building it on the spot if the layer's build has not reached it.
    function metaFor(layer, index) {
      if (!layer.meta[index]) {
        if (layer.mesh) openMesh(layer.mesh);
        buildLayerFeature(layer, index);
        if (layer.mesh) closeMesh(layer.mesh);
      }
      return layer.meta[index];
    }

    // Returns `arr` cut down to `length` items (itself when it has no spare capacity).
    function trimmed(arr, length) { return arr.length === length ? arr : arr.slice(0, length); }

    // Builds as much of a layer as fits before `deadline` (a performance.now() time).
    // Returns true when the layer is complete.
    function buildSome(layer, deadline) {
      const started = performance.now();
      const mesh = layer.mesh;
      if (mesh) openMesh(mesh);
      while (layer.nextFeature < layer.features.length && performance.now() < deadline) {
        if (!layer.meta[layer.nextFeature]) buildLayerFeature(layer, layer.nextFeature);
        layer.nextFeature++;
      }
      if (layer.nextFeature === layer.features.length) {
        if (!layer.borderWork) { layer.borderWork = borderLines(layer); layer.lines = []; }
        const work = layer.borderWork;
        while (layer.nextLine < work.length && performance.now() < deadline) {
          const coords = work[layer.nextLine++];
          if (mesh) addLine(coords);
          else {
            const cap = capOf(coords);
            cap.geom = { type: 'LineString', coordinates: coords };
            layer.lines.push(cap);
          }
        }
        if (layer.nextLine === work.length) { layer.borderWork = null; layer.built = true; }
      }
      if (mesh) closeMesh(mesh);
      if (mesh && layer.built) {
        // Drop the spare capacity left by growing the arrays
        mesh.verts = trimmed(mesh.verts, mesh.vertCount * 4);
        mesh.index = trimmed(mesh.index, mesh.indexCount);
        mesh.quads = trimmed(mesh.quads, mesh.segCount * 28);
      }
      layer.buildMs += performance.now() - started;
      return layer.built;
    }

    // Makes `next` the layer list: builds what is not built yet (in slices), then swaps the
    // new list in and frees layers that are no longer used. Resolves when that has happened.
    function commitLayers(next) {
      const superseded = pendingLayers;
      pendingLayers = next;
      if (superseded) superseded.forEach(layer => { if (next.indexOf(layer) < 0 && scene.layers.indexOf(layer) < 0) discardLayer(layer); });
      const promise = new Promise(resolve => buildResolvers.push(resolve));
      clearTimeout(buildTimer);
      runBuild();
      return promise;
    }

    function runBuild() {
      buildTimer = 0;
      if (destroyed || !pendingLayers) return;
      const deadline = performance.now() + BUILD_SLICE_MS;
      let done = 0, total = 0, complete = true, worked = false;
      for (let i = 0; i < pendingLayers.length; i++) {
        const layer = pendingLayers[i];
        if (complete && !layer.built) { complete = buildSome(layer, deadline); worked = true; }
        done += layer.nextFeature; total += layer.features.length;
      }
      // Not finished, or finished with the slice used up: the upload gets a slice of its own
      if (!complete || (worked && performance.now() >= deadline)) {
        emit('progress', total ? done / total : 1);
        buildTimer = setTimeout(runBuild, 0);
        return;
      }
      const old = scene.layers;
      scene.layers = pendingLayers;
      pendingLayers = null;
      lastBuildMs = 0;
      scene.layers.forEach(layer => {
        if (!layer.gpu && !contextLost) renderer.uploadLayer(layer);
        lastBuildMs += layer.buildMs;
      });
      old.forEach(layer => { if (scene.layers.indexOf(layer) < 0) discardLayer(layer); });
      if (hover.layer && scene.layers.indexOf(hover.layer) < 0) setHover(null, -1);
      refreshHover();
      invalidate();
      const resolvers = buildResolvers;
      buildResolvers = [];
      resolvers.forEach(resolve => resolve());
    }

    function discardLayer(layer) {
      renderer.freeLayer(layer);
      for (let i = flashes.length - 1; i >= 0; i--) if (flashes[i].layer === layer) flashes.splice(i, 1);
    }

    // Replaces the layer list. A layer whose id, features array, borders object and keys are
    // unchanged keeps its geometry (and its place on screen meanwhile); it takes the new
    // settings and starts again with no per-feature styles.
    function setLayers(defs) {
      const existing = (pendingLayers || []).concat(scene.layers);
      return commitLayers((defs || []).map(def => {
        const sameId = existing.filter(layer => layer.id === def.id);
        const kept = sameId.find(layer => sameGeometry(layer, def));
        if (!kept) return makeLayer(def, sameId.find(layer => layer.built && layer.features === def.features));
        kept.key = def.key || defaultKey;
        configureLayer(kept, def);
        kept.styleOf.fill(null);
        kept.hoverStyle = kept.hoverAllow = null;
        for (let i = flashes.length - 1; i >= 0; i--) if (flashes[i].layer === kept) flashes.splice(i, 1);
        repaintLayer(kept);
        return kept;
      }));
    }

    // Changes a layer: { interactive, borderColor, borderWidth, bordersVisible, visible, style }
    // apply at once; new `features` or `borders` are built first and then swapped in, keeping
    // the styles already set for keys that are still there.
    function updateLayer(id, changes) {
      const layer = findLayer(id);
      if (!layer) return Promise.resolve();
      if (changes.interactive !== undefined) layer.interactive = !!changes.interactive;
      if (changes.borderColor !== undefined) layer.borderColor = parseColor(changes.borderColor);
      if (changes.borderWidth !== undefined) layer.borderWidth = changes.borderWidth;
      if (changes.bordersVisible !== undefined) layer.bordersVisible = !!changes.bordersVisible;
      if (changes.visible !== undefined) layer.visible = !!changes.visible;
      if (changes.style !== undefined) { layer.style = changes.style; repaintLayer(layer); }
      refreshHover();
      invalidate();
      if ((changes.features === undefined || changes.features === layer.features) &&
          (changes.borders === undefined || changes.borders === layer.borders)) return Promise.resolve();
      const replacement = makeLayer({
        id: layer.id, key: layer.key,
        features: changes.features === undefined ? layer.features : changes.features,
        borders: changes.borders === undefined ? layer.borders : changes.borders
      }, layer);
      ['interactive', 'borderColor', 'borderWidth', 'bordersVisible', 'visible', 'style'].forEach(name => { replacement[name] = layer[name]; });
      inheritStyles(replacement, layer);
      return commitLayers((pendingLayers || scene.layers).map(l => l === layer ? replacement : l));
    }

    function featureInfo(layerId, key) {
      const layer = findLayer(layerId);
      const index = layer ? layer.indexByKey.get(key) : undefined;
      if (index === undefined) return null;
      const meta = metaFor(layer, index);
      if (!meta.bounds) meta.bounds = boundsOf(layer.features[index], meta);
      return { feature: layer.features[index], centroid: meta.centroid, bounds: meta.bounds, radiusDeg: meta.radius * DEG, areaSr: meta.areaSr };
    }

    function anchor(layerId, key) {
      const layer = findLayer(layerId);
      const index = layer ? layer.indexByKey.get(key) : undefined;
      return index === undefined ? null : anchorOf(metaFor(layer, index));
    }

    // The angular radius, in degrees, of the largest circle round a feature's anchor that stays
    // inside the feature: how much room there is for a label there.
    function anchorRadiusDeg(layerId, key) {
      const layer = findLayer(layerId);
      const index = layer ? layer.indexByKey.get(key) : undefined;
      if (index === undefined) return null;
      const meta = metaFor(layer, index);
      anchorOf(meta);
      return meta.anchorRadius * DEG;
    }

    /* ----- Picking ----- */

    let pickedLayer = null, pickedIndex = -1, pickedExact = false;

    // Finds the feature at host point (x, y); the result is left in pickedLayer, pickedIndex
    // and pickedExact. First an exact point-in-polygon test, topmost interactive layer first,
    // whatever `eligible` says. Failing that, among the eligible features that are small on
    // screen, the one with the nearest vertex within `tolerance` px: tiny islands can be tapped.
    function pick(x, y, tolerance, eligible) {
      pickedLayer = null; pickedIndex = -1; pickedExact = false;
      const layers = scene.layers;
      if (unproject(x, y, vecA)) {
        const gx = vecA[0], gy = vecA[1], gz = vecA[2];
        for (let l = layers.length - 1; l >= 0; l--) {
          const layer = layers[l];
          if (!layer.interactive || !layer.visible) continue;
          for (let i = 0; i < layer.meta.length; i++) {
            const meta = layer.meta[i];
            if (gx * meta.cx + gy * meta.cy + gz * meta.cz < meta.cosR) continue;
            for (let p = 0; p < meta.parts.length; p++) {
              if (partContains(meta.parts[p], gx, gy, gz)) { pickedLayer = layer; pickedIndex = i; pickedExact = true; return; }
            }
          }
        }
      }
      if (!(tolerance > 0)) return;
      const R = scene.radius;
      let best = Infinity, bestArea = Infinity;
      for (let l = layers.length - 1; l >= 0; l--) {
        const layer = layers[l];
        if (!layer.interactive || !layer.visible) continue;
        for (let i = 0; i < layer.meta.length; i++) {
          const meta = layer.meta[i];
          // Small on screen: a narrow bounding cap, or (scattered islands) little land
          const small = 2 * R * Math.sin(Math.min(meta.radius, Math.PI / 2)) < SMALL_FEATURE_PX || meta.areaSr * R * R < SMALL_AREA_PX2;
          if (!small || capDistance(meta, x, y) > Math.min(tolerance, best) || (eligible && !eligible(layer.id, layer.keys[i]))) continue;
          for (let p = 0; p < meta.parts.length; p++) {
            const d = vertexDistance(meta.parts[p], x, y, Math.min(tolerance, best));
            // Of two equally near, the smaller feature wins
            if (d > tolerance || d > best || (d === best && meta.areaSr >= bestArea)) continue;
            best = d; bestArea = meta.areaSr; pickedLayer = layer; pickedIndex = i;
          }
        }
      }
    }

    // A lower bound on the distance in px from host point (x, y) to anything inside a bounding
    // cap (a feature's or a polygon's: an object with cx, cy, cz and radius). A point of the
    // cap is no further from its centre on screen than it is in space.
    function capDistance(cap, x, y) {
      const R = scene.radius;
      const dx = scene.w / 2 + R * viewX(cap.cx, cap.cy, cap.cz) - x;
      const dy = scene.h / 2 - R * viewY(cap.cx, cap.cy, cap.cz) - y;
      return Math.sqrt(dx * dx + dy * dy) - 2 * R * Math.sin(Math.min(cap.radius, Math.PI) / 2);
    }

    // Distance in px from host point (x, y) to the nearest vertex of a polygon that is on the
    // near side of the globe; Infinity if there is none, or none within `limit`.
    function vertexDistance(part, x, y, limit) {
      if (capDistance(part, x, y) > limit) return Infinity;
      const R = scene.radius, cx = scene.w / 2, cy = scene.h / 2;
      // The polygon's centre c and tangent-plane axes e1, e2 in view space: a vertex at (u, v)
      // in the plane is c + u·e1 + v·e2, scaled back onto the sphere
      const xc = viewX(part.cx, part.cy, part.cz), x1 = viewX(part.e1x, part.e1y, part.e1z), x2 = viewX(part.e2x, part.e2y, part.e2z);
      const yc = viewY(part.cx, part.cy, part.cz), y1 = viewY(part.e1x, part.e1y, part.e1z), y2 = viewY(part.e2x, part.e2y, part.e2z);
      const zc = viewZ(part.cx, part.cy, part.cz), z1 = viewZ(part.e1x, part.e1y, part.e1z), z2 = viewZ(part.e2x, part.e2y, part.e2z);
      const uv = part.uv;
      let min2 = Infinity;
      for (let i = 0; i < uv.length; i += 2) {
        const u = uv[i], v = uv[i + 1], s = R / Math.sqrt(1 + u * u + v * v);
        if (zc + u * z1 + v * z2 <= 0) continue;
        const dx = cx + s * (xc + u * x1 + v * x2) - x, dy = cy - s * (yc + u * y1 + v * y2) - y;
        const d2 = dx * dx + dy * dy;
        if (d2 < min2) min2 = d2;
      }
      return Math.sqrt(min2);
    }

    function hitObject() {
      return pickedLayer ? { layerId: pickedLayer.id, key: pickedLayer.keys[pickedIndex], feature: pickedLayer.features[pickedIndex], exact: pickedExact } : null;
    }

    function featureAt(x, y, o) {
      pick(x, y, o && o.tolerance !== undefined ? o.tolerance : 22, o && o.eligible);
      return hitObject();
    }

    /* ----- Hover ----- */

    let hoverX = 0, hoverY = 0;        // where the mouse is, while it is over the host
    let mouseOver = false, hoverPending = false;
    // Reused for every 'hover' and 'move' event; listeners copy what they keep
    const hoverPoint = { x: 0, y: 0 };
    const moveEvent = { x: 0, y: 0, lonlat: null };
    const moveLonLat = [0, 0];

    function setHover(layer, index) {
      if (hover.layer === layer && hover.index === index) return;
      const oldLayer = hover.layer, oldIndex = hover.index;
      hover.layer = layer; hover.index = index;
      if (oldLayer && oldLayer.hoverStyle) repaint(oldLayer, oldIndex);
      if (layer && layer.hoverStyle) repaint(layer, index);
      hoverPoint.x = hoverX; hoverPoint.y = hoverY;
      emit('hover', layer ? hitObject() : null, hoverPoint);
    }

    // Has the hover worked out again on the next frame: what is under a resting mouse changed.
    function refreshHover() {
      if (mouseOver) { hoverPending = true; requestFrame(); }
    }

    // Runs once per frame in which the mouse moved without a button down.
    function updateHover() {
      hoverPending = false;
      if (pointers.length) return;
      pick(hoverX, hoverY, 22, null);
      setHover(pickedLayer, pickedIndex);
      if (listening('move')) {
        moveEvent.x = hoverX; moveEvent.y = hoverY; moveEvent.lonlat = null;
        if (unproject(hoverX, hoverY, vecA)) {
          moveLonLat[0] = Math.atan2(vecA[1], vecA[0]) * DEG; moveLonLat[1] = Math.asin(clamp(vecA[2], -1, 1)) * DEG;
          moveEvent.lonlat = moveLonLat;
        }
        emit('move', moveEvent);
      }
    }

    /* ----- Pointer, wheel and touch input ----- */

    let hostRect = null;
    const press = { x: 0, y: 0, moved: false, pinched: false };
    const lastTap = { time: 0, x: 0, y: 0 };
    let pinchDistance = 0, pinchX = 0, pinchY = 0;
    const track = new Float64Array(3 * 8);     // recent drag samples: time, x, y
    let trackCount = 0;

    // The event's position in the host's own CSS px (allowing for a transformed ancestor).
    function localPoint(e, out) {
      const rect = hostRect || host.getBoundingClientRect();
      out.x = (e.clientX - rect.left) * (rect.width ? scene.w / rect.width : 1);
      out.y = (e.clientY - rect.top) * (rect.height ? scene.h / rect.height : 1);
      return out;
    }
    const point = { x: 0, y: 0 };

    function findPointer(id) {
      for (let i = 0; i < pointers.length; i++) if (pointers[i].id === id) return pointers[i];
      return null;
    }

    function startPinch() {
      const a = pointers[0], b = pointers[1];
      pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
      pinchX = (a.x + b.x) / 2; pinchY = (a.y + b.y) / 2;
      press.pinched = true;
    }

    function onPointerDown(e) {
      if (paused || (e.pointerType === 'mouse' && e.button !== 0) || pointers.length >= 2) return;
      stopMotion();
      hostRect = host.getBoundingClientRect();
      localPoint(e, point);
      pointers.push({ id: e.pointerId, x: point.x, y: point.y });
      try { host.setPointerCapture(e.pointerId); } catch (gone) { /* the pointer was released already */ }
      if (pointers.length === 1) {
        press.x = point.x; press.y = point.y; press.moved = false; press.pinched = false;
        trackCount = 0;
      } else {
        startPinch();
      }
    }

    function onPointerMove(e) {
      if (paused) return;
      const p = findPointer(e.pointerId);
      if (!p) {
        if (e.pointerType === 'mouse' && !pointers.length) {
          hostRect = null;
          localPoint(e, point);
          hoverX = point.x; hoverY = point.y;
          mouseOver = hoverPending = true;
          requestFrame();
        }
        return;
      }
      localPoint(e, point);
      const dx = point.x - p.x, dy = point.y - p.y;
      p.x = point.x; p.y = point.y;
      if (pointers.length === 2) {
        // Pinch: scale about the midpoint and carry the ground under it along
        const a = pointers[0], b = pointers[1];
        const distance = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const anchored = unproject(pinchX, pinchY, vecA);
        const gx = vecA[0], gy = vecA[1], gz = vecA[2];
        if (pinchDistance > 0 && distance > 0) setViewRaw(view.lon, view.lat, view.k * distance / pinchDistance);
        if (!anchored || !placeUnder(gx, gy, gz, mx, my)) rotateByPixels(mx - pinchX, my - pinchY);
        pinchDistance = distance; pinchX = mx; pinchY = my;
        return;
      }
      if (!press.moved) {
        if (Math.hypot(point.x - press.x, point.y - press.y) < CLICK_SLOP_PX) return;
        press.moved = true;
        sceneCanvas.style.cursor = 'var(--globe-cursor-dragging, grabbing)';
        setHover(null, -1);
        return;
      }
      rotateByPixels(dx, dy);
      const o = (trackCount % 8) * 3;
      track[o] = e.timeStamp; track[o + 1] = point.x; track[o + 2] = point.y;
      trackCount++;
    }

    function onPointerUp(e) {
      const p = findPointer(e.pointerId);
      if (!p) return;
      pointers.splice(pointers.indexOf(p), 1);
      if (pointers.length) {           // one finger of a pinch lifted: the other carries on dragging
        press.moved = true;
        trackCount = 0;
        return;
      }
      sceneCanvas.style.cursor = 'var(--globe-cursor, grab)';
      hostRect = null;
      if (spinRate) requestFrame();
      if (paused || e.type === 'pointercancel') return;
      localPoint(e, point);
      if (press.moved || press.pinched) {
        if (!press.pinched) startInertia(e.timeStamp);
        return;
      }
      pick(point.x, point.y, 22, null);
      emit('click', { x: point.x, y: point.y, lonlat: invert(point.x, point.y), hit: hitObject(), originalEvent: e });
      if (dblClickZoom) {
        const reach = e.pointerType === 'mouse' ? CLICK_SLOP_PX : 28;
        if (e.timeStamp - lastTap.time < DOUBLE_TAP_MS && Math.hypot(point.x - lastTap.x, point.y - lastTap.y) < reach) {
          lastTap.time = 0;
          zoomToward(view.k * 2, point.x, point.y);
        } else {
          lastTap.time = e.timeStamp; lastTap.x = point.x; lastTap.y = point.y;
        }
      }
    }

    // Starts the glide after a drag from the pointer's velocity over its last 120 ms.
    function startInertia(now) {
      if (reducedMotion.matches || trackCount < 2) return;
      const newest = ((trackCount - 1) % 8) * 3;
      if (now - track[newest] > 100) return;      // the pointer rested before lifting
      let oldest = newest;
      for (let i = 2; i <= Math.min(trackCount, 8); i++) {
        const o = ((trackCount - i) % 8) * 3;
        if (track[newest] - track[o] > 120) break;
        oldest = o;
      }
      const dt = track[newest] - track[oldest];
      if (dt <= 0) return;
      inertia.vx = (track[newest + 1] - track[oldest + 1]) / dt;
      inertia.vy = (track[newest + 2] - track[oldest + 2]) / dt;
      if (inertia.vx * inertia.vx + inertia.vy * inertia.vy < 0.0025) return;
      inertia.active = true;
      requestFrame();
    }

    function onPointerLeave(e) {
      if (e.pointerType === 'mouse' && !pointers.length) { mouseOver = hoverPending = false; setHover(null, -1); }
    }

    function onWheel(e) {
      if (paused) return;
      e.preventDefault();
      // Same scaling as d3-zoom: lines and pages count for more, and so do trackpad pinches
      const delta = -e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002) * (e.ctrlKey ? 10 : 1);
      hostRect = null;
      localPoint(e, point);
      zoomToward((zoom.active ? zoom.target : view.k) * Math.pow(2, delta), point.x, point.y);
    }

    function listen(target, add) {
      const fn = add ? 'addEventListener' : 'removeEventListener';
      target[fn]('pointerdown', onPointerDown);
      target[fn]('pointermove', onPointerMove);
      target[fn]('pointerup', onPointerUp);
      target[fn]('pointercancel', onPointerUp);
      target[fn]('pointerleave', onPointerLeave);
      target[fn]('wheel', onWheel, { passive: false });
    }

    /* ----- Overlay ----- */

    // The object handed to overlay callbacks; its fields are refreshed before every frame.
    const overlayInfo = { project, view, width: 0, height: 0, dpr: 1, time: 0, radiusPx: 0 };

    function addOverlay(fn) {
      overlays.push(fn);
      invalidate();
      return () => {
        const i = overlays.indexOf(fn);
        if (i >= 0) overlays.splice(i, 1);
        invalidate();
      };
    }

    function drawOverlay(now) {
      if (!overlays.length && !overlayUsed) return;
      octx.setTransform(scene.pw / scene.w, 0, 0, scene.ph / scene.h, 0, 0);
      octx.clearRect(0, 0, scene.w, scene.h);
      overlayUsed = overlays.length > 0;
      overlayInfo.width = scene.w; overlayInfo.height = scene.h; overlayInfo.dpr = scene.pw / scene.w;
      overlayInfo.time = now; overlayInfo.radiusPx = scene.radius;
      for (let i = 0; i < overlays.length; i++) {
        const fn = overlays[i];
        octx.save();
        fn(octx, overlayInfo);
        octx.restore();
        if (overlays[i] !== fn) i--;        // the callback removed itself
      }
    }

    // A d3 projection matching the current view, for the helpers that draw GeoJSON on the overlay.
    const overlayProjection = d3.geoOrthographic().clipAngle(90).precision(0.3);
    const overlayPath = d3.geoPath(overlayProjection);
    const overlayRotation = [0, 0], overlayCentre = [0, 0];
    const pA = { x: 0, y: 0, visible: false, z: 0 }, pB = { x: 0, y: 0, visible: false, z: 0 }, pC = { x: 0, y: 0, visible: false, z: 0 };
    const arcA = new Float64Array(3), arcB = new Float64Array(3);

    const draw = {
      // Strokes the great-circle arc from a to b, stopping at the limb.
      // opts: { color, width, dash }
      geoLine(ctx, a, b, o) {
        o = o || {};
        unitVector(a, arcA); unitVector(b, arcB);
        const angle = Math.acos(clamp(arcA[0] * arcB[0] + arcA[1] * arcB[1] + arcA[2] * arcB[2], -1, 1));
        const steps = Math.max(2, Math.ceil(angle * DEG / 2));
        ctx.beginPath();
        let prev = projectVector(arcA, pA), cur = pB, prevT = 0;
        if (prev.visible) ctx.moveTo(prev.x, prev.y);
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          projectVector(slerp(arcA, arcB, angle, t, vecA), cur);
          if (cur.visible !== prev.visible) {
            // The arc crosses the limb between the two samples: find where
            const edge = projectVector(slerp(arcA, arcB, angle, prevT + (t - prevT) * prev.z / (prev.z - cur.z), vecA), pC);
            if (prev.visible) ctx.lineTo(edge.x, edge.y); else ctx.moveTo(edge.x, edge.y);
          }
          if (cur.visible) ctx.lineTo(cur.x, cur.y);
          const swap = prev; prev = cur; cur = swap; prevT = t;
        }
        ctx.strokeStyle = o.color || '#000';
        ctx.lineWidth = o.width || 1.5;
        ctx.setLineDash(o.dash || []);
        ctx.lineCap = 'round';
        ctx.stroke();
      },

      // Fills and/or strokes one feature's outline, clipped at the limb.
      // opts: { stroke, width, fill }
      outline(ctx, feature, o) {
        o = o || {};
        const meta = measureFeature(feature), parts = meta.parts;
        // Nothing to draw when the whole feature is behind the limb
        if (viewZ(meta.cx, meta.cy, meta.cz) < -Math.sin(Math.min(meta.radius, Math.PI / 2))) return;
        overlayRotation[0] = -view.lon; overlayRotation[1] = -view.lat;
        overlayCentre[0] = scene.w / 2; overlayCentre[1] = scene.h / 2;
        overlayProjection.rotate(overlayRotation).scale(scene.radius).translate(overlayCentre);
        overlayPath.context(ctx);
        ctx.beginPath();
        if (parts.length) for (let p = 0; p < parts.length; p++) overlayPath(parts[p].geom);
        else overlayPath(feature);          // not a polygon: a line or a point
        if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
        if (o.stroke) {
          ctx.strokeStyle = o.stroke;
          ctx.lineWidth = o.width || 2;
          ctx.lineJoin = 'round';
          ctx.stroke();
        }
      },

      // Expanding, fading rings around a place. opts: { t (0–1 progress), color, count, radius }
      rings(ctx, lonlat, o) {
        o = o || {};
        const p = project(lonlat, pA);
        if (!p.visible) return;
        const count = o.count || 3, reach = o.radius || 36, t = clamp(o.t || 0, 0, 1);
        ctx.strokeStyle = o.color || '#000';
        ctx.lineWidth = 2;
        for (let i = 0; i < count; i++) {
          // Each ring starts a little after the one before it
          const u = clamp(t * (1 + 0.35 * (count - 1)) - 0.35 * i, 0, 1);
          if (u <= 0 || u >= 1) continue;
          ctx.globalAlpha = (1 - u) * (1 - u);
          ctx.beginPath();
          ctx.arc(p.x, p.y, reach * (1 - Math.pow(1 - u, 3)), 0, 2 * Math.PI);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    };

    /* ----- Frame loop ----- */

    function requestFrame() {
      if (!rafId && !paused && !destroyed) rafId = requestAnimationFrame(frame);
    }

    function invalidate() {
      needsDraw = true;
      requestFrame();
    }

    function animate(ms) {
      animateUntil = Math.max(animateUntil, performance.now() + ms);
      requestFrame();
    }

    function frame(now) {
      rafId = 0;
      if (paused || destroyed) return;
      const started = performance.now();
      // Time since the previous frame of a running animation (a slow frame counts for at
      // most 50 ms); the first frame after a pause counts as one ordinary frame.
      const dt = lastFrameTime ? Math.min(now - lastFrameTime, 50) : 16;
      let active = inMotion = stepMotion(now, dt);
      if (hoverPending) updateHover();
      if (flashes.length) { stepFlashes(now); active = true; }
      if (now < animateUntil) { needsDraw = true; active = true; }
      const moved = viewChanged;
      viewChanged = false;
      if (moved) {
        scene.moving = true;
        lastViewChange = now;
        if (!settleTimer) settleTimer = setTimeout(checkSettled, SETTLE_MS);
      }
      if (needsDraw || moved) {
        render(now);
        if (moved) {
          viewEvent.lon = view.lon; viewEvent.lat = view.lat; viewEvent.k = view.k;
          viewInfo.moving = inMotion || pointers.length > 0;
          emit('view', viewEvent, viewInfo);
        }
        const ms = performance.now() - started;
        stats.lastFrameMs = ms;
        stats.avgFrameMs += (ms - stats.avgFrameMs) / clamp(stats.frames, 1, 60);
      }
      lastFrameTime = active ? now : 0;
      if (active) requestFrame();
    }

    // Draws the scene and the overlay now.
    function render(now) {
      needsDraw = false;
      if (!scene.w || !scene.h || contextLost) return;
      if (scene.imagery.on) placeImagery();
      renderer.draw(scene);
      drawOverlay(now);
      stats.frames++;
      if (!readyFired && scene.layers.length && !pendingLayers) { readyFired = true; emit('ready'); }
    }

    function checkSettled() {
      settleTimer = 0;
      // Not settled while an animation is still running, however slowly its frames arrive
      const wait = inMotion ? SETTLE_MS : SETTLE_MS - (performance.now() - lastViewChange);
      if (wait > 1) { settleTimer = setTimeout(checkSettled, wait); return; }
      scene.moving = false;
      if (renderer.kind === 'canvas2d') invalidate();     // redraw at full quality
      refreshHover();              // the globe moved under a resting mouse
      updateImagery(false);
      emit('settle', getView());
    }

    /* ----- Size, theme and lifecycle ----- */

    function resize() {
      const w = host.clientWidth, h = host.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
      if (w === scene.w && h === scene.h && pw === scene.pw && ph === scene.ph) return;
      const wasHome = fitBeforeLayout || (view.lon === home.lon && view.lat === home.lat && view.k === home.k);
      scene.w = w; scene.h = h; scene.pw = pw; scene.ph = ph;
      sceneCanvas.width = overlayCanvas.width = pw;
      sceneCanvas.height = overlayCanvas.height = ph;
      baseRadius = BASE_RADIUS * Math.min(w, h);
      scene.haloPx = HALO * baseRadius;
      scene.radius = view.k * baseRadius;
      overlayUsed = true;
      if (homeFit && w && h) {
        // A fit depends on the host's shape: keep home in step, and stay on it if we were there
        home.k = fitZoom(homeFit);
        if (wasHome) { fitBeforeLayout = false; stopMotion(); setViewRaw(home.lon, home.lat, home.k); }
      }
      // Draw at once: the canvases were just cleared and the browser paints before the next frame
      if (!paused) render(performance.now());
      if (!scene.moving) updateImagery(false);
    }

    function setTheme(partial) {
      Object.keys(partial || {}).forEach(name => { scene.theme[name] = parseColor(partial[name]); });
      invalidate();
    }

    function setGraticule(onOff) {
      scene.graticule = !!onOff;
      invalidate();
    }

    /* ----- Imagery ----- */

    // Satellite tiles are 256 px Web Mercator images. They are copied, as they arrive, into
    // mosaics: textures the sphere shader reads (see IMAGERY_GLSL). `base` is the whole world
    // at BASE_TILE_ZOOM, loaded first and kept, so there is always something to show while
    // the globe turns. The two detail windows hold sharper tiles for the part of the world
    // the view last settled on: `top` is the current one, and `under` the one before it,
    // which stays underneath until the new one is complete so the picture never steps back
    // to something coarser.
    function newMosaic() {
      return {
        z: -1,                       // tile zoom; -1 while not in use
        x0: 0, y0: 0,                // the tile in its top-left corner (x0 may be negative: columns wrap round the world)
        cols: 0, rows: 0,            // size in tiles, powers of two
        repeat: false,               // it spans the whole world from west to east
        tiles: new Map(),            // for every tile wanted in it, key → whether it has been copied in
        drawn: 0,                    // how many have been
        gpu: null,                   // the renderer's texture
        place: new Float32Array(4), limit: new Float32Array(4)      // shader uniforms, see placeImagery
      };
    }
    const imagery = {
      enabled: false,
      tileUrl: null, source: '',     // the caller's (z, x, y) → URL, and one URL from it to tell sources apart
      maxZoom: 15,
      onStatus: null,
      status: '',                    // what onStatus was last told
      cache: new Map(),              // key → { key, z, x, y, image, state, failedAt }, least recently used first
      loading: 0,                    // tiles on their way
      failedAt: 0,                   // when imagery as a whole was last found to be unavailable
      base: newMosaic(), under: newMosaic(), top: newMosaic(),
      scratch: null                  // 2D context for bringing odd-sized tiles to TILE_PX
    };
    scene.imagery.mosaics.push(imagery.base, imagery.under, imagery.top);

    // Whether this globe can draw imagery at all: only the WebGL renderer can.
    function supportsImagery() {
      return renderer.kind === 'webgl' && renderer.maxMosaicTiles * TILE_PX >= 1024;
    }

    // Turns imagery on or off, or changes its settings: { enabled, tileUrl, maxZoom, onStatus },
    // each optional after the first call. Enabling it again after a failure tries again at once.
    function setImagery(o) {
      o = o || {};
      const im = imagery;
      if (o.onStatus !== undefined) im.onStatus = o.onStatus;
      if (o.maxZoom !== undefined) im.maxZoom = o.maxZoom;
      if (typeof o.tileUrl === 'function') {
        let source = '';
        try { source = String(o.tileUrl(BASE_TILE_ZOOM, 1, 1)); } catch (e) { /* treated as no tiles */ }
        if (source !== im.source) forgetTiles();
        im.tileUrl = o.tileUrl; im.source = source;
      }
      if (o.enabled !== undefined) im.enabled = !!o.enabled;
      im.status = '';
      if (!im.enabled) {
        stopLoading();
        clearMosaic(im.under); clearMosaic(im.top);
        showImagery();
        return;
      }
      if (!supportsImagery() || !im.tileUrl) {
        im.enabled = false;
        reportImagery('failed');
        return;
      }
      updateImagery(true);
    }

    // Starts loading a tile into its cache entry.
    function loadTile(tile) {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => tileArrived(tile, image, true);
      image.onerror = () => tileArrived(tile, image, false);
      tile.image = image;
      tile.state = TILE_LOADING;
      imagery.loading++;
      let url = '';
      try { url = imagery.tileUrl(tile.z, tile.x, tile.y); } catch (e) { /* counts as a tile that failed */ }
      if (url) image.src = url;
      else setTimeout(image.onerror, 0);
    }

    // The cache entry for tile z/x/y, now the most recently used. A tile that is not there, or
    // that failed a while ago (or at any time, with `retryNow`), is asked for.
    function fetchTile(z, x, y, retryNow) {
      const key = z + '/' + x + '/' + y;
      let tile = imagery.cache.get(key);
      if (tile) imagery.cache.delete(key);
      else tile = { key, z, x, y, image: null, state: TILE_FAILED, failedAt: -Infinity };
      imagery.cache.set(key, tile);
      if (tile.state === TILE_FAILED && (retryNow || performance.now() - tile.failedAt >= IMAGERY_RETRY_MS)) loadTile(tile);
      return tile;
    }

    function tileArrived(tile, image, ok) {
      if (destroyed || tile.image !== image || tile.state !== TILE_LOADING) return;      // given up on meanwhile
      imagery.loading--;
      if (ok) {
        tile.state = TILE_READY;
        scene.imagery.mosaics.forEach(m => { if (m.tiles.get(tile.key) === false) drawTile(m, tile); });
      } else {
        tile.state = TILE_FAILED;
        tile.image = null;
        tile.failedAt = performance.now();
      }
      imageryProgress();
    }

    // Gives up on a tile that is still loading; it can be asked for again at any time.
    function abandonTile(tile) {
      tile.image.onload = tile.image.onerror = null;
      tile.image.src = '';
      tile.image = null;
      tile.state = TILE_FAILED;
      tile.failedAt = -Infinity;
      imagery.loading--;
    }

    function stopLoading() {
      imagery.cache.forEach(tile => { if (tile.state === TILE_LOADING) abandonTile(tile); });
    }

    // Gives up on loading tiles that no mosaic is waiting for, and forgets the least recently
    // used tiles beyond what the cache holds. Tiles in a mosaic are kept: they are needed
    // again if the WebGL context is lost.
    function trimTiles() {
      const mosaics = scene.imagery.mosaics;
      let spare = imagery.cache.size - TILE_CACHE;
      imagery.cache.forEach((tile, key) => {
        if (mosaics[0].tiles.has(key) || mosaics[1].tiles.has(key) || mosaics[2].tiles.has(key)) return;
        if (tile.state === TILE_LOADING) abandonTile(tile);
        else if (spare <= 0) return;
        imagery.cache.delete(key);
        spare--;
      });
    }

    // Forgets every tile and empties every mosaic: the tiles now come from somewhere else.
    function forgetTiles() {
      stopLoading();
      imagery.cache.clear();
      scene.imagery.mosaics.forEach(clearMosaic);
    }

    // A tile as something TILE_PX square that can be copied into a mosaic.
    function tileSource(image) {
      if (image.naturalWidth === TILE_PX && image.naturalHeight === TILE_PX) return image;
      if (!imagery.scratch) {
        const c = document.createElement('canvas');
        c.width = c.height = TILE_PX;
        imagery.scratch = c.getContext('2d');
      }
      imagery.scratch.clearRect(0, 0, TILE_PX, TILE_PX);
      imagery.scratch.drawImage(image, 0, 0, TILE_PX, TILE_PX);
      return imagery.scratch.canvas;
    }

    // Empties a mosaic and gives it a place in the world: tile zoom z, tile (x0, y0) in its
    // top-left corner, cols × rows tiles.
    function layMosaic(m, z, x0, y0, cols, rows) {
      m.z = z; m.x0 = x0; m.y0 = y0; m.cols = cols; m.rows = rows;
      m.repeat = cols === Math.pow(2, z);
      m.tiles.clear();
      m.drawn = 0;
      if (!m.gpu) m.gpu = renderer.createMosaic();
      renderer.resetMosaic(m.gpu, cols * TILE_PX, rows * TILE_PX, m.repeat);
    }

    // Takes a mosaic out of use and gives back its memory.
    function clearMosaic(m) {
      if (m.z < 0) return;
      m.z = -1;
      m.tiles.clear();
      m.drawn = 0;
      if (m.gpu) renderer.resetMosaic(m.gpu, 1, 1, false);
      invalidate();
    }

    // Wants tile (x, y) of a mosaic's zoom in it; x is taken round the world.
    function wantTile(m, x, y, retryNow) {
      const n = Math.pow(2, m.z);
      x = (x % n + n) % n;
      const key = m.z + '/' + x + '/' + y;
      if (m.tiles.get(key)) return;
      m.tiles.set(key, false);
      const tile = fetchTile(m.z, x, y, retryNow);
      if (tile.state === TILE_READY) drawTile(m, tile);
    }

    // Copies a loaded tile into a mosaic that wants it.
    function drawTile(m, tile) {
      const n = Math.pow(2, m.z);
      const col = ((tile.x - m.x0) % n + n) % n;
      renderer.putTile(m.gpu, tileSource(tile.image), col * TILE_PX, (tile.y - m.y0) * TILE_PX);
      m.tiles.set(tile.key, true);
      m.drawn++;
      invalidate();
    }

    // The tiles a detail window should hold for the view as it is: { z, x0, y0, nx, ny } (x0
    // counted from the antimeridian, possibly negative: columns wrap), or null when the base
    // mosaic is fine enough.
    function wantedWindow() {
      const R = scene.radius, dpr = scene.pw / scene.w;
      const lat = view.lat * RAD, sinLat = Math.sin(lat), cosLat = Math.cos(lat);
      // What is in sight: a grid of points across the host, those off the globe pulled in to
      // its limb, as longitudes from the centre and latitudes
      const N = 8;
      let west = 0, east = 0, south = lat, north = lat;
      let low = Math.abs(lat);         // the latitude nearest the equator that faces the viewer squarely
      for (let j = 0; j <= N; j++) {
        for (let i = 0; i <= N; i++) {
          let px = (i / N - 0.5) * scene.w / R, py = (0.5 - j / N) * scene.h / R, pz = 0;
          const r2 = px * px + py * py;
          if (r2 > 1) { const r = Math.sqrt(r2); px /= r; py /= r; } else pz = Math.sqrt(1 - r2);
          const lon = Math.atan2(px, pz * cosLat - py * sinLat);
          const la = Math.asin(clamp(pz * sinLat + py * cosLat, -1, 1));
          if (lon < west) west = lon; if (lon > east) east = lon;
          if (la < south) south = la; if (la > north) north = la;
          if (pz > 0.6) low = la * lat < 0 ? 0 : Math.min(low, Math.abs(la));
        }
      }
      // The tile zoom whose texels are nearest in size to a device pixel. Mercator tiles are
      // coarsest on the ground toward the equator, so that is where they are matched.
      let z = Math.min(Math.round(Math.log2(2 * Math.PI * R * dpr * Math.cos(low) / TILE_PX)), imagery.maxZoom);
      if (!(z > BASE_TILE_ZOOM)) return null;
      // A pole in sight brings every longitude with it
      const whole = cosLat * R <= scene.h / 2 + 2 || east - west > 1.9 * Math.PI;
      const cx = (view.lon + 180) / 360, turn = 2 * Math.PI;
      const top = mercatorY(north * DEG), bottom = mercatorY(south * DEG);
      // A little more than was measured, for what lies between the grid points
      const padX = 0.02 * (east - west) / turn, padY = 0.02 * (bottom - top);
      const side = Math.min(WINDOW_TILES, renderer.maxMosaicTiles);
      for (; z > BASE_TILE_ZOOM; z--) {
        const n = Math.pow(2, z);
        let x0 = Math.floor((cx + west / turn - padX) * n), nx = Math.floor((cx + east / turn + padX) * n) - x0 + 1;
        if (whole || nx >= n) { x0 = 0; nx = n; }
        const y0 = Math.max(0, Math.floor((top - padY) * n)), ny = Math.min(n - 1, Math.floor((bottom + padY) * n)) - y0 + 1;
        // One level above the base the mosaic is simply the whole world, however many tiles
        // of it are in sight; from there on a window is kept to WINDOW_TILE_LIMIT tiles
        if (nx <= side && ny <= side && (nx * ny <= WINDOW_TILE_LIMIT || z === BASE_TILE_ZOOM + 1)) return { z, x0, y0, nx, ny };
      }
      return null;
    }

    // Brings the mosaics up to date with the view: asks for the base tiles still missing and
    // for the detail tiles of what is in sight. Runs when the view settles (and when imagery
    // is turned on); `retryNow` asks again for tiles that failed only a moment ago.
    function updateImagery(retryNow) {
      const im = imagery;
      if (!im.enabled || contextLost || !scene.w || !scene.h) return;
      if (im.status === 'failed') {
        // Nothing could be loaded last time: try again, but not at every pause in a drag
        if (!retryNow && performance.now() - im.failedAt < IMAGERY_RETRY_MS) return;
        im.failedAt = performance.now();
      }
      if (im.base.z < 0) layMosaic(im.base, BASE_TILE_ZOOM, 0, 0, 4, 4);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) wantTile(im.base, x, y, retryNow);
      const want = wantedWindow();
      if (!want) {
        clearMosaic(im.under); clearMosaic(im.top);
      } else {
        const n = Math.pow(2, want.z);
        let top = im.top;
        const held = top.z === want.z && want.y0 >= top.y0 && want.y0 + want.ny <= top.y0 + top.rows &&
          (top.repeat || ((want.x0 - top.x0) % n + n) % n + want.nx <= top.cols);
        if (!held) {
          // A new window. The one it replaces stays underneath while the new tiles load
          // (unless it has nothing to show, in which case the one before it stays)
          if (top.drawn) {
            im.top = im.under; im.under = top; top = im.top;
            scene.imagery.mosaics[1] = im.under; scene.imagery.mosaics[2] = im.top;
          }
          // The tiles wanted sit in the middle of the mosaic, leaving room for the view to wander
          const cols = powerOfTwo(want.nx), rows = powerOfTwo(want.ny);
          layMosaic(top, want.z, cols === n ? 0 : want.x0 - ((cols - want.nx) >> 1),
            clamp(want.y0 - ((rows - want.ny) >> 1), 0, n - rows), cols, rows);
        }
        for (let y = want.y0; y < want.y0 + want.ny; y++) {
          for (let x = want.x0; x < want.x0 + want.nx; x++) wantTile(top, x, y, retryNow);
        }
      }
      trimTiles();
      imageryProgress();
    }

    // Called when tiles have been asked for or have arrived: decides whether imagery shows,
    // and what to tell onStatus.
    function imageryProgress() {
      const im = imagery;
      if (!im.enabled) return;
      // Once the current window is complete the one under it has nothing left to add
      if (im.top.z >= 0 && im.top.drawn === im.top.tiles.size) clearMosaic(im.under);
      showImagery();
      if (im.loading) {
        // After a failure the engine tries again quietly, and says so only if tiles come
        if (im.status !== 'failed') reportImagery('loading');
      } else if (scene.imagery.on) {
        reportImagery('ready');
      } else {
        if (im.status !== 'failed') im.failedAt = performance.now();
        reportImagery('failed');
      }
    }

    // Imagery is drawn while it is enabled and at least one tile has arrived.
    function showImagery() {
      const im = imagery, on = im.enabled && im.base.drawn + im.under.drawn + im.top.drawn > 0;
      if (on !== scene.imagery.on) { scene.imagery.on = on; invalidate(); }
    }

    function reportImagery(status) {
      if (status === imagery.status) return;
      imagery.status = status;
      if (typeof imagery.onStatus === 'function') imagery.onStatus(status);
    }

    // Works out, for the frame about to be drawn, where the view centre falls in each mosaic
    // (in double precision here, so that the shader only has small offsets left to add).
    function placeImagery() {
      const s = scene.imagery, lat = view.lat * RAD;
      s.sinLat = Math.sin(lat); s.cosLat = Math.cos(lat);
      // Longitudes over 90° from the centre's are in sight once the host reaches this far
      // from the view centre
      const reach = Math.hypot(scene.w, scene.h) / (2 * scene.radius);
      s.far = reach >= 1 || Math.asin(reach) > Math.PI / 2 - Math.abs(lat) - 0.02;
      const cx = (view.lon + 180) / 360, cy = mercatorY(view.lat);
      for (let i = 0; i < 3; i++) {
        const m = s.mosaics[i];
        if (m.z < 0) continue;
        const n = Math.pow(2, m.z), w = m.cols / n, h = m.rows / n;
        // The view centre's distance east of the mosaic's west edge, in world widths: of all
        // the copies of the world side by side, the one that puts it nearest the mosaic
        let dx = cx - m.x0 / n;
        dx -= m.repeat ? Math.floor(dx) : Math.round(dx - w / 2);
        m.place[0] = dx / w; m.place[1] = (cy - m.y0 / n) / h; m.place[2] = 1 / w; m.place[3] = 1 / h;
        m.limit[0] = m.repeat ? -1e9 : 0; m.limit[1] = m.repeat ? 1e9 : 1;
        m.limit[2] = -m.y0 / m.rows; m.limit[3] = (n - m.y0) / m.rows;
      }
    }

    // After the WebGL context has come back: the mosaics are made again from the cached tiles.
    function restoreImagery() {
      scene.imagery.mosaics.forEach(m => {
        m.gpu = null;
        if (m.z < 0) return;
        const wanted = Array.from(m.tiles.keys());
        layMosaic(m, m.z, m.x0, m.y0, m.cols, m.rows);
        wanted.forEach(key => {
          const tile = imagery.cache.get(key);
          m.tiles.set(key, false);
          if (tile && tile.state === TILE_READY) drawTile(m, tile);
        });
      });
      updateImagery(false);
    }

    // The Canvas 2D renderer has taken over: it draws no imagery.
    function dropImagery() {
      const wasOn = imagery.enabled;
      stopLoading();
      imagery.cache.clear();
      scene.imagery.mosaics.forEach(m => { m.gpu = null; m.z = -1; m.tiles.clear(); m.drawn = 0; });
      imagery.enabled = false;
      showImagery();
      if (wasOn) reportImagery('failed');
    }

    let resizeObserver = null;
    let dprQuery = null;

    // Re-measures when the device pixel ratio changes (browser zoom, moving between screens).
    function watchPixelRatio() {
      if (!window.matchMedia) return;
      unwatchPixelRatio();
      dprQuery = window.matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)');
      if (dprQuery.addEventListener) dprQuery.addEventListener('change', onPixelRatioChange);
    }
    function unwatchPixelRatio() {
      if (dprQuery && dprQuery.removeEventListener) dprQuery.removeEventListener('change', onPixelRatioChange);
    }
    function onPixelRatioChange() {
      watchPixelRatio();
      resize();
    }

    // Undoes what attachTo did to the current host.
    function leaveHost() {
      listen(host, false);
      host.style.touchAction = previousTouchAction;
      if (madeRelative) host.style.position = '';
      if (resizeObserver) resizeObserver.disconnect();
    }

    function attachTo(el) {
      if (host) leaveHost();
      host = el;
      madeRelative = getComputedStyle(host).position === 'static';
      if (madeRelative) host.style.position = 'relative';
      previousTouchAction = host.style.touchAction;
      host.style.touchAction = 'none';
      host.appendChild(sceneCanvas);
      host.appendChild(overlayCanvas);
      listen(host, true);
      pointers.length = 0;
      if (window.ResizeObserver) {
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);
      }
      resize();
    }

    function pause() {
      paused = true;
      stopMotion();
      pointers.length = 0;
      cancelAnimationFrame(rafId);
      rafId = 0;
    }

    function resume() {
      if (!paused) return;
      paused = false;
      resize();
      invalidate();
    }

    /* ----- Losing the WebGL context ----- */

    let contextTimer = 0;

    function onContextLost(e) {
      e.preventDefault();              // asks the browser to restore the context when it can
      contextLost = true;
      waitForContext();
    }

    // Browsers restore a lost context promptly once the page is showing. Counts the time the
    // page has been visible without that happening, and then stops waiting.
    function waitForContext() {
      clearTimeout(contextTimer);
      contextTimer = 0;
      if (contextLost && document.visibilityState !== 'hidden') contextTimer = setTimeout(fallBackToCanvas, CONTEXT_WAIT_MS);
    }

    // Everything on the GPU went with the old context: set it up again from the CPU copies.
    function onContextRestored() {
      contextLost = false;
      clearTimeout(contextTimer);
      renderer.init();
      eachLayer(layer => {
        layer.gpu = null;
        if (layer.built) renderer.uploadLayer(layer);
      });
      restoreImagery();
      invalidate();
    }

    // Switches to the Canvas 2D renderer for good, on a new scene canvas in place of the old
    // one. Layers keep their features, styles and measurements; only their border lines are
    // prepared again, in the form the 2D renderer wants.
    function fallBackToCanvas() {
      const old = sceneCanvas;
      old.removeEventListener('webglcontextlost', onContextLost);
      old.removeEventListener('webglcontextrestored', onContextRestored);
      contextLost = false;
      contextTimer = 0;
      sceneCanvas = makeSceneCanvas();
      sceneCanvas.width = scene.pw; sceneCanvas.height = scene.ph;
      renderer = createCanvasRenderer(sceneCanvas);
      if (old.parentNode) old.parentNode.replaceChild(sceneCanvas, old);
      eachLayer(layer => {
        const wasBuilt = layer.built;
        layer.gpu = layer.mesh = layer.borderWork = null;
        layer.nextLine = 0;
        layer.built = false;
        if (wasBuilt) buildSome(layer, Infinity);
      });
      dropImagery();
      emit('renderer', renderer.kind);
      invalidate();
    }

    function destroy() {
      destroyed = true;
      stopMotion();
      cancelAnimationFrame(rafId);
      clearTimeout(settleTimer);
      clearTimeout(buildTimer);
      stopLoading();
      leaveHost();
      clearTimeout(contextTimer);
      document.removeEventListener('visibilitychange', waitForContext);
      unwatchPixelRatio();
      sceneCanvas.removeEventListener('webglcontextlost', onContextLost);
      sceneCanvas.removeEventListener('webglcontextrestored', onContextRestored);
      eachLayer(layer => renderer.freeLayer(layer));
      renderer.destroy();
      sceneCanvas.remove();
      overlayCanvas.remove();
    }

    function getStats() {
      let triangles = 0, segments = 0;
      scene.layers.forEach(layer => {
        if (layer.mesh) { triangles += layer.mesh.indexCount / 3; segments += layer.mesh.segCount; }
      });
      return {
        renderer: renderer.kind, frames: stats.frames, lastFrameMs: stats.lastFrameMs, avgFrameMs: stats.avgFrameMs,
        triangles, segments, buildMs: lastBuildMs,
        // While imagery is on: the last status, the tile zoom of the sharpest mosaic, tiles
        // on their way, and tiles held in the cache
        imagery: imagery.enabled ? {
          status: imagery.status, zoom: imagery.top.z < 0 ? BASE_TILE_ZOOM : imagery.top.z,
          loading: imagery.loading, tiles: imagery.cache.size
        } : null
      };
    }

    /* ----- Public API ----- */

    const api = {
      setLayers, updateLayer,
      defineStyles, setStyle, setStyles, resetStyles, flash, setHoverStyle,
      getView, setView, flyTo, fitTo, setHome, resetView, zoomBy, ensureVisible, spin, setOptions,
      project, invert, featureAt, featureInfo, anchor, anchorRadiusDeg,
      radiusPx: () => scene.radius,
      on, addOverlay, invalidate, animate, draw,
      setImagery, supportsImagery, setTheme, setGraticule,
      attachTo, resize, pause, resume,
      stats: getStats,
      destroy
    };

    setTheme(Object.assign({}, DEFAULT_THEME, opts.theme));
    setOptions(opts);
    updateRotation();
    document.addEventListener('visibilitychange', waitForContext);
    watchPixelRatio();
    attachTo(hostElement);
    return api;
  }

  return { create };
})();
