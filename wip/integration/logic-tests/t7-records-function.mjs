// The Pages Function's size limit, exercised directly with a stand-in KV
import { onRequest } from '/home/user/atlas-game/functions/api/records.js';
const kv = { m: new Map(), get: async k => kv.m.get(k) ?? null, put: async (k, v) => { kv.m.set(k, v); } };
const T = '4a8e9b2c7d3f1e6a5b8c2d4e7f9a1b3c';
const call = (method, body, token = T) => onRequest({ request: new Request('https://x/api/records?token=' + token, { method, body }), env: { RECORDS_KV: kv } });
let failed = 0;
const check = (name, ok, detail) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok ? '' : '  ' + JSON.stringify(detail))); if (!ok) failed++; };
const pad = (n) => JSON.stringify({ p: 'a'.repeat(n - 8) });           // exactly n bytes of ASCII
let r = await call('POST', pad(256 * 1024));
check('256 KB exactly is stored', r.status === 200 && kv.m.get(T).length === 256 * 1024, r.status);
r = await call('POST', pad(256 * 1024 + 1));
check('one byte over is refused with 413', r.status === 413 && (await r.json()).error === 'payload_too_large', r.status);
r = await call('POST', pad(100 * 1024));
check('a 100 KB blob (over the old 64 KB limit) is stored', r.status === 200, r.status);
const multi = JSON.stringify({ p: 'ã'.repeat(140 * 1024) });          // 140k characters, 280k bytes
r = await call('POST', multi);
check('the limit counts bytes, not characters', multi.length < 256 * 1024 && r.status === 413, [multi.length, r.status]);
r = await call('GET');
check('GET returns the last stored blob', r.status === 200 && (await r.text()).length === 100 * 1024, r.status);
r = await call('POST', 'not json');
check('invalid JSON is still refused', r.status === 400, r.status);
r = await call('GET', undefined, 'nope');
check('bad token is still refused', r.status === 400, r.status);
console.log('\nrecords function: ' + (failed ? failed + ' failed' : 'all passed'));
process.exit(failed ? 1 : 0);
