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
    if (!sessions.has(sid)) sessions.set(sid, { maxStep: 0, lead: false, ts: e.ts || 0 });
    const s = sessions.get(sid);
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

  res.status(200).json({
    persistent,
    generatedAt: Date.now(),
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
