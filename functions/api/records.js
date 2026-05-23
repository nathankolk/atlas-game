// Cartographer's Atlas — record sync API
// Cloudflare Pages Function. Auto-deployed at /api/records.
//
//   GET  /api/records?token=<32 hex chars>  -> JSON blob, or "null"
//   POST /api/records?token=<32 hex chars>  -> stores JSON body, returns { ok: true }
//
// Storage: Cloudflare KV namespace bound as `RECORDS_KV`.
// Trust model: the token IS the credential. Anyone with it can read/write that user.
// No accounts, no passwords. Same as Signal-style device linking.

'use strict';

/* ===== Constants ===== */

const TOKEN_RE = /^[a-f0-9]{32}$/i;     // 128-bit hex
const MAX_BODY_BYTES = 64 * 1024;        // 64 KB per user — generous; records blob is tiny

/* ===== Helpers ===== */

// Build a JSON response with proper Content-Type
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

/* ===== Main handler ===== */

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';

  // Validate token shape before doing anything else
  if (!TOKEN_RE.test(token)) {
    return json({ error: 'invalid_token' }, 400);
  }

  // KV must be bound on this environment (locally via --kv flag, in prod via wrangler.toml)
  const kv = env.RECORDS_KV;
  if (!kv) {
    return json({ error: 'kv_not_bound' }, 500);
  }

  // GET — read the stored blob for this token, or "null" if none
  if (request.method === 'GET') {
    const stored = await kv.get(token);
    return new Response(stored ?? 'null', {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  // POST — overwrite the stored blob for this token
  if (request.method === 'POST') {
    const text = await request.text();

    if (text.length > MAX_BODY_BYTES) {
      return json({ error: 'payload_too_large' }, 413);
    }

    // Must be valid JSON. We don't enforce a schema yet — that's the client's job.
    try {
      JSON.parse(text);
    } catch {
      return json({ error: 'invalid_json' }, 400);
    }

    await kv.put(token, text);
    return json({ ok: true });
  }

  return json({ error: 'method_not_allowed' }, 405);
}
