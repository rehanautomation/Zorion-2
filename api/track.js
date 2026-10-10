const { push, readBody, isAdmin, markClick, setDwell } = require('./_store');
const { classifyClick, cleanHash } = require('./_classify');

const MAX_MS = 30 * 60 * 1000;
const ms = n => Math.max(0, Math.min(Math.round(Number(n) || 0), MAX_MS));
const str = (v, n) => (v == null || v === '' ? undefined : String(v).slice(0, n));
const header = (req, name) => String(req.headers[name] || '');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  try {
    const b = await readBody(req);
    const KINDS = ['view', 'step', 'dwell', 'engaged', 'first_answer'];
    if (!b || KINDS.indexOf(b.type) === -1) return res.status(200).json({ ok: true });

    /* our own visits never reach the store */
    if (isAdmin(req, b)) return res.status(200).json({ ok: true, skipped: true });

    const sid = String(b.sid || '').slice(0, 40);
    const v2 = Number(b.v) === 2;

    /* ---- v1: a page loaded before the switch. Stored exactly as
       before, so the old section of the report keeps working. ---- */
    if (!v2) {
      if (b.type !== 'view' && b.type !== 'step' && b.type !== 'dwell') return res.status(200).json({ ok: true });
      await push({
        type: b.type,
        sid,
        step: b.type === 'step' ? Number(b.step) || 0 : undefined,
        ref: str(b.ref, 200),
        a: str(b.a, 40),
        q: str(b.q, 200),
        where: b.type === 'dwell' ? String(b.where || '').slice(0, 16) : undefined,
        ms: b.type === 'dwell' ? ms(b.ms) : undefined,
        ts: Date.now()
      });
      return res.status(200).json({ ok: true });
    }

    /* ---- v2 ---- */

    /* Visible time: one entry per session, overwritten every few
       seconds. s = whole page, l = landing screen until Q1. */
    if (b.type === 'dwell') {
      if (sid) await setDwell(sid, { s: ms(b.ms), l: ms(b.land), t: Date.now() });
      return res.status(200).json({ ok: true });
    }

    const row = { v: 2, type: b.type, sid, ts: Date.now() };

    if (b.type === 'step') row.step = Number(b.step) || 0;
    if (b.type === 'first_answer') row.ms = ms(b.ms);

    if (b.type === 'view') {
      const hash = cleanHash(b.ch);
      const ua = header(req, 'user-agent');
      const c = await classifyClick({
        ua,
        country: header(req, 'x-vercel-ip-country'),
        region: header(req, 'x-vercel-ip-country-region'),
        a: b.a,
        hasFbclid: b.fb === true || b.fb === 1 || b.fb === '1',
        fbclidHash: hash
      }, markClick);

      Object.assign(row, {
        a: str(b.a, 40),
        ad: str(b.ad, 60),
        src: str(b.src, 40),
        pl: str(b.pl, 60),
        ref: str(b.ref, 200),
        q: str(b.q, 200),
        ch: hash || undefined,          // SHA-256 of the fbclid, never the fbclid
        fb: c.clickId || undefined,
        ok: c.verified,
        why: c.reason || undefined,
        story: (c.verified && c.story) || undefined,   // came through the link at the end of the story
        app: c.inApp || undefined,
        cc: c.country || undefined,
        rg: c.region || undefined,
        ua: ua.slice(0, 160) || undefined
      });
    }

    await push(row);
  } catch (_) { /* analytics must never break the page */ }

  res.status(200).json({ ok: true });
};
