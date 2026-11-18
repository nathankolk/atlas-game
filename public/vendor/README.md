# Vendored files

Third-party code and assets the game serves from its own origin. Nothing here is built or
modified: each file is the published one, byte for byte. To update one, replace the file with
the same path from a newer release of its package and change its row below.

| File | Package and version | What the game uses it for | Source | Licence |
|---|---|---|---|---|
| `d3-array.min.js` | d3-array 3.2.5 (`dist/d3-array.min.js`) | Required by d3-geo | https://github.com/d3/d3-array | ISC, © Mike Bostock |
| `d3-geo.min.js` | d3-geo 3.1.2 (`dist/d3-geo.min.js`) | Spherical geometry for the globe engine: distances, centroids, bounds, the Canvas 2D fallback's projection | https://github.com/d3/d3-geo | ISC, © Mike Bostock; includes code © Charles Karney (MIT) |
| `topojson-client.min.js` | topojson-client 3.1.0 (`dist/topojson-client.min.js`) | Turns the TopoJSON map files in `public/data/` into shapes, borders and neighbour lists | https://github.com/topojson/topojson-client | ISC, © Mike Bostock |
| `earcut.min.js` | earcut 2.2.4 (`dist/earcut.min.js`) | Triangulates country shapes for the WebGL globe | https://github.com/mapbox/earcut | ISC, © Mapbox |
| `TwemojiCountryFlags.woff2` | country-flag-emoji-polyfill 0.1.10 (`dist/TwemojiCountryFlags.woff2`) | Draws flags the same on every system (the font `Atlas Flags`); fetched the first time a flag is about to show | https://github.com/talkjs/country-flag-emoji-polyfill | Font build: MIT, © 2022 TalkJS. Flag artwork: Twemoji, © Twitter and contributors, CC BY 4.0 (credited in the app under Settings, About) |

The four scripts are loaded by `<script>` tags at the end of `public/index.html`, in the order
d3-array, d3-geo, topojson-client, earcut, and define the globals `d3`, `topojson` and `earcut`.

The map files in `public/data/` are data, not code: Natural Earth (public domain). The two
`countries-*.json` files are the world-atlas package's (version 2.0.2, ISC), `provinces-*.json` are made by
`tools/build-provinces.js`, and `us-states.json` is Natural Earth's 1:10m states and provinces
cut down to the fifty states and the District of Columbia, as TopoJSON.
