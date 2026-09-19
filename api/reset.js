/* ------------------------------------------------------------------
   Wipes every stored event, so the report starts from zero.

   Guarded by ADMIN_KEY (Vercel → Settings → Environment Variables).
   With no ADMIN_KEY set the endpoint refuses to do anything at all —
   an unprotected delete is worse than no delete.

   POST /api/reset   { "key": "..." }      (or ?key=... )
   ------------------------------------------------------------------ */
const { clear, all, readBody } = require('./_store');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  const KEY = process.env.ADMIN_KEY || '';
  if (!KEY) {
    return res.status(503).json({
      ok: false,
      error: 'ADMIN_KEY is not set. Add it in Vercel → Settings → Environment Variables, then redeploy.'
    });
  }

  /* GET can be triggered by a prefetch, a crawler or a shared link, and
     this deletes everything — POST only. */
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }

  const body = await readBody(req);
  const urlKey = new URL(req.url, 'http://x').searchParams.get('key');
  const given = String((body && body.key) || urlKey || '');

  if (given !== KEY) {
    return res.status(401).json({ ok: false, error: 'Wrong key' });
  }

  let before = 0;
  try { before = (await all()).length; } catch (_) {}

  try {
    await clear();
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err && err.message) });
  }

  let after = 0;
  try { after = (await all()).length; } catch (_) {}

  res.status(200).json({ ok: true, deleted: before, remaining: after });
};
