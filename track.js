const { push, readBody } = require('./_store');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  try {
    const b = await readBody(req);
    if (!b || (b.type !== 'view' && b.type !== 'step')) return res.status(200).json({ ok: true });

    await push({
      type: b.type,
      sid: String(b.sid || '').slice(0, 40),
      step: b.type === 'step' ? Number(b.step) || 0 : undefined,
      ref: b.ref ? String(b.ref).slice(0, 200) : undefined,
      ts: Date.now()
    });
  } catch (_) { /* analytics must never break the page */ }

  res.status(200).json({ ok: true });
};
