const { push, readBody, isAdmin } = require('./_store');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  try {
    const b = await readBody(req);
    const KINDS = ['view', 'step', 'dwell'];
    if (!b || KINDS.indexOf(b.type) === -1) return res.status(200).json({ ok: true });

    /* our own visits never reach the store */
    if (isAdmin(req, b)) return res.status(200).json({ ok: true, skipped: true });

    await push({
      type: b.type,
      sid: String(b.sid || '').slice(0, 40),
      step: b.type === 'step' ? Number(b.step) || 0 : undefined,
      ref: b.ref ? String(b.ref).slice(0, 200) : undefined,
      /* the ad variant, captured on the landing view only */
      a: b.a ? String(b.a).slice(0, 40) : undefined,
      q: b.q ? String(b.q).slice(0, 200) : undefined,
      /* dwell: 'landing' (load until Q1 answered) or 'session' (total).
         Capped again here — the browser is not to be trusted with it. */
      where: b.type === 'dwell' ? String(b.where || '').slice(0, 16) : undefined,
      ms: b.type === 'dwell' ? Math.max(0, Math.min(Number(b.ms) || 0, 30 * 60 * 1000)) : undefined,
      ts: Date.now()
    });
  } catch (_) { /* analytics must never break the page */ }

  res.status(200).json({ ok: true });
};
