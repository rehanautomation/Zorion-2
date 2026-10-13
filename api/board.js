/* ------------------------------------------------------------------
   Ad board images (/adboard).

   GET  /api/board                 -> { ok, v: { slot: version } }
   GET  /api/board?slot=w3-deck    -> the image itself (cached for good;
                                      the page adds &v=version to the URL)
   POST /api/board  { key, slot, img }   img = data:image/jpeg;base64,...
        Saving needs ADMIN_KEY (the same key as the report).

   Images live in the same Upstash Redis as the report, in two hashes
   of their own. Nothing here touches the tracking data.
   ------------------------------------------------------------------ */
const crypto = require('crypto');
const { readBody } = require('./_store');

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const IMG = 'zorion_adboard_img_v1';
const VER = 'zorion_adboard_ver_v1';
const SLOT = /^[a-z0-9-]{1,40}$/;
const MAX = 3 * 1024 * 1024; // data URL length

async function kv(command) {
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command)
  });
  if (!res.ok) throw new Error('kv ' + res.status);
  return (await res.json()).result;
}

function keyOk(given) {
  const KEY = process.env.ADMIN_KEY || '';
  if (!KEY || !given) return false;
  const h = s => crypto.createHash('sha256').update(String(s)).digest();
  return crypto.timingSafeEqual(h(KEY), h(given));
}

module.exports = async (req, res) => {
  if (!KV_URL || !KV_TOKEN) return res.status(503).json({ ok: false, error: 'storage not set up' });
  const params = new URL(req.url, 'http://x').searchParams;

  try {
    if (req.method === 'GET') {
      const slot = params.get('slot');
      if (slot) {
        if (!SLOT.test(slot)) return res.status(400).end();
        const data = await kv(['HGET', IMG, slot]);
        const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(data || '');
        if (!m) return res.status(404).end();
        res.setHeader('Content-Type', m[1]);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.status(200).send(Buffer.from(m[2], 'base64'));
      }
      const flat = (await kv(['HGETALL', VER])) || [];
      const v = {};
      for (let i = 0; i < flat.length; i += 2) v[flat[i]] = flat[i + 1];
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ok: true, v });
    }

    if (req.method === 'POST') {
      res.setHeader('Cache-Control', 'no-store');
      const body = await readBody(req);
      if (!keyOk(body.key)) return res.status(401).json({ ok: false, error: 'wrong key' });
      const { slot, img } = body;
      if (!SLOT.test(slot || '')) return res.status(400).json({ ok: false, error: 'bad slot' });
      if (typeof img !== 'string' || img.length > MAX || !/^data:image\/(jpeg|png|webp);base64,/.test(img)) {
        return res.status(400).json({ ok: false, error: 'bad image' });
      }
      const ver = String(Date.now());
      await kv(['HSET', IMG, slot, img]);
      await kv(['HSET', VER, slot, ver]);
      return res.status(200).json({ ok: true, v: ver });
    }

    return res.status(405).json({ ok: false, error: 'GET or POST' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'storage error' });
  }
};
