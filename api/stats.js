const { all, persistent } = require('./_store');

const STEP_LABELS = {
  1: 'Q1 · Your role',
  2: 'Q2 · What you signed',
  3: 'Q3 · The total',
  4: 'Q4 · Existing coverage',
  5: 'Q5 · Who’s left',
  6: 'Contact form'
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  let events = [];
  try { events = await all(); } catch (_) {}

  // ?days=7 filter (0 / all = everything)
  const days = Number((req.query && req.query.days) || (new URL(req.url, 'http://x').searchParams.get('days')) || 0);
  if (days > 0) {
    const cutoff = Date.now() - days * 86400000;
    events = events.filter(e => (e.ts || 0) >= cutoff);
  }

  const sessions = new Map();
  const leads = [];

  for (const e of events) {
    const sid = e.sid || 'anon-' + (e.ts || 0);
    if (!sessions.has(sid)) sessions.set(sid, { maxStep: 0, lead: false, ts: e.ts || 0, a: '', q: '' });
    const s = sessions.get(sid);
    /* the variant arrives on the landing view and belongs to the whole
       session from then on */
    if (e.a && !s.a) s.a = String(e.a);
    if (e.q && !s.q) s.q = String(e.q);
    if (e.type === 'step') s.maxStep = Math.max(s.maxStep, Number(e.step) || 0);
    if (e.type === 'lead') {
      s.lead = true;
      s.maxStep = Math.max(s.maxStep, 6);
      leads.push({ name: e.name, email: e.email, phone: e.phone, ts: e.ts });
    }
  }

  const list = [...sessions.values()];
  const views = list.length;
  const converted = list.filter(s => s.lead).length;
  const attempted = list.filter(s => s.maxStep >= 2 && !s.lead).length; // started answering, never submitted
  const bounced = list.filter(s => s.maxStep < 2 && !s.lead).length;    // landed, answered nothing

  const steps = [1, 2, 3, 4, 5, 6].map(n => ({
    step: n,
    label: STEP_LABELS[n],
    reached: list.filter(s => s.maxStep >= n).length,
    droppedHere: list.filter(s => !s.lead && s.maxStep === n).length
  }));

  /* Grouped from whatever values are actually in the data, never from
     a list in the code — add a=whatever to an ad tomorrow and it shows
     up here on its own, with no change to this file. */
  const byVariant = new Map();
  for (const s of list) {
    const key = s.a || '(none)';
    if (!byVariant.has(key)) byVariant.set(key, { variant: key, views: 0, started: 0, leads: 0, extra: '' });
    const v = byVariant.get(key);
    v.views++;
    if (s.maxStep >= 2) v.started++;
    if (s.lead) v.leads++;
    if (!v.extra && s.q) v.extra = s.q;
  }
  const variants = [...byVariant.values()]
    .map(v => Object.assign(v, {
      conversionRate: v.views ? Math.round((v.leads / v.views) * 1000) / 10 : 0
    }))
    .sort((a, b) => b.views - a.views);

  res.status(200).json({
    persistent,
    generatedAt: Date.now(),
    variants,
    totals: {
      views,
      attempted,
      bounced,
      leads: converted,
      conversionRate: views ? Math.round((converted / views) * 1000) / 10 : 0
    },
    steps,
    leads: leads.sort((a, b) => b.ts - a.ts).slice(0, 50)
  });
};
