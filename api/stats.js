const crypto = require('crypto');
const { all, allDwell, persistent } = require('./_store');

/* ------------------------------------------------------------------
   The report's data. Public: no names, emails or phone numbers unless
   ?key= matches ADMIN_KEY (and only if ADMIN_KEY is set at all).

   Two eras, kept apart:
     v2   events tagged v:2 — every view classified on the server as a
          real Meta ad click (VERIFIED) or not, with the reason
     v1   everything older, shown as it always was, never deleted
   ------------------------------------------------------------------ */

const TRACKING_VERSION = 2;
const TZ = 'America/Toronto';
const MAX_MS = 30 * 60 * 1000;

/* The screen reached: step 1 is landing on Q1, step 2 means Q1 was
   answered, and so on. Same numbering in v1 and v2. */
const STEP_LABELS = {
  1: 'Q1 · Amount signed for',
  2: 'Q2 · Who’s left',
  3: 'Q3 · Existing coverage',
  4: 'Q4 · Age',
  5: 'Contact form',
  6: 'Lead submitted'
};

const REASON_LABELS = {
  bot_ua: 'Bot, crawler or link preview',
  no_click_id: 'No Meta click: no fbclid and not the Facebook / Instagram app',
  no_ad_tag: 'No a= ad tag on the link',
  outside_canada: 'Outside Canada',
  duplicate: 'Same click again (reload or reopened link)',
  no_view: 'Page view never arrived'
};

/* ---------- helpers ---------- */
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, year: 'numeric', month: 'short', day: 'numeric',
  hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
});
function torontoDay(ts) {
  const p = {};
  for (const x of dayFmt.formatToParts(new Date(ts))) p[x.type] = x.value;
  return p.year + '-' + p.month + '-' + p.day;
}
function torontoTime(ts) { return timeFmt.format(new Date(ts)); }

function avg(arr) { return arr.length ? Math.round(arr.reduce((t, n) => t + n, 0) / arr.length) : 0; }
function median(arr) {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b), m = s.length >> 1;
  return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
}
const rate = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

/* Compared as digests so the check takes the same time whatever was typed. */
function hasKey(req, params) {
  const KEY = process.env.ADMIN_KEY || '';
  const given = params.get('key') || '';
  if (!KEY || !given) return false;
  const h = s => crypto.createHash('sha256').update(String(s)).digest();
  return crypto.timingSafeEqual(h(KEY), h(given));
}

/* ---------- v2 ---------- */

/* One block of numbers for a list of units (a unit is one visit, or
   one verified person). The same shape for "verified" and "all", so the
   report draws either with the same code. */
function summarise(units) {
  const views = units.length;
  const leads = units.filter(u => u.lead).length;
  const vis = units.map(u => u.vis).filter(n => n > 0);
  const land = units.map(u => u.land).filter(n => n > 0);
  const fa = units.map(u => u.fa).filter(n => n > 0);

  return {
    views,
    engaged: units.filter(u => u.engaged).length,
    started: units.filter(u => u.maxStep >= 2).length,
    leads,
    conversionRate: rate(leads, views),
    visibleMedianMs: median(vis),
    visibleAvgMs: avg(vis),
    landingMedianMs: median(land),
    firstAnswerMedianMs: median(fa)
  };
}

function groupBy(units, keyFn, sortByKey) {
  const m = new Map();
  for (const u of units) {
    const k = keyFn(u) || '(none)';
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(u);
  }
  const rows = [...m.entries()].map(([key, list]) => Object.assign({ key }, summarise(list)));
  return sortByKey
    ? rows.sort((a, b) => (a.key < b.key ? 1 : -1))      // newest day first
    : rows.sort((a, b) => b.views - a.views);
}

function block(units) {
  return {
    totals: summarise(units),
    steps: [1, 2, 3, 4, 5, 6].map(n => ({
      step: n,
      label: STEP_LABELS[n],
      reached: units.filter(u => u.maxStep >= n).length,
      droppedHere: units.filter(u => !u.lead && u.maxStep === n).length
    })),
    byA: groupBy(units, u => u.a),
    bySrc: groupBy(units, u => u.src),
    byPl: groupBy(units, u => u.pl),
    byDay: groupBy(units, u => torontoDay(u.ts), true)
  };
}

/* Sessions are built from every v2 event, not just the window, and a
   session belongs to the day it landed. So a lead submitted today by
   someone who arrived yesterday counts on yesterday's row, the way
   Meta's daily numbers count the click. */
function buildV2(events, dwell, cutoff, admin) {
  const sess = new Map();
  const S = (sid, ts) => {
    if (!sess.has(sid)) sess.set(sid, { sid, views: [], maxStep: 0, engaged: false, lead: null, fa: 0, firstTs: ts });
    const s = sess.get(sid);
    if (ts < s.firstTs) s.firstTs = ts;
    return s;
  };

  for (const e of events) {
    if (e.v !== 2) continue;
    const s = S(e.sid || 'anon-' + e.ts, e.ts || 0);
    if (e.type === 'view') s.views.push(e);
    else if (e.type === 'step') s.maxStep = Math.max(s.maxStep, Number(e.step) || 0);
    else if (e.type === 'engaged') s.engaged = true;
    else if (e.type === 'first_answer') {
      const ms = Number(e.ms) || 0;
      if (ms > 0 && (!s.fa || ms < s.fa)) s.fa = ms;
    }
  }
  /* api/lead.js stores leads untagged; they belong to v2 when the
     session is a v2 session */
  const v2Leads = new Set();
  for (const e of events) {
    if (e.type === 'lead' && e.sid && sess.has(e.sid)) {
      const s = sess.get(e.sid);
      if (!s.lead || e.ts < s.lead.ts) s.lead = e;
      v2Leads.add(e);
    }
  }

  /* one unit per session */
  const visits = [];
  for (const s of sess.values()) {
    s.views.sort((a, b) => a.ts - b.ts);
    const ok = s.views.find(v => v.ok);
    const first = s.views[0];
    const view = ok || first || null;
    const d = dwell[s.sid] || {};
    visits.push({
      sid: s.sid,
      cls: ok ? 'verified' : (first ? (first.why || 'no_click_id') : 'no_view'),
      ch: view && view.ch,
      ts: view ? view.ts : s.firstTs,
      a: view && view.a, src: view && view.src, pl: view && view.pl,
      maxStep: Math.max(s.maxStep, view ? 1 : 0, s.lead ? 6 : 0),
      engaged: s.engaged,
      lead: s.lead,
      vis: Math.min(Number(d.s) || 0, MAX_MS),
      land: Math.min(Number(d.l) || 0, MAX_MS),
      fa: s.fa
    });
  }

  /* People: each verified visit is one person. A later visit carrying
     the same click (a reload in a new tab, the link reopened) is the
     same person — it is filtered as "duplicate" but its progress and
     lead are folded into that person. */
  const people = new Map();
  for (const v of visits) {
    if (v.cls !== 'verified') continue;
    const k = v.ch ? 'c:' + v.ch : 's:' + v.sid;
    if (!people.has(k)) people.set(k, Object.assign({}, v));
  }
  for (const v of visits) {
    if (v.cls !== 'duplicate' || !v.ch) continue;
    const p = people.get('c:' + v.ch);
    if (!p) continue;
    p.maxStep = Math.max(p.maxStep, v.maxStep);
    p.engaged = p.engaged || v.engaged;
    p.lead = p.lead || v.lead;
    p.vis = Math.min(p.vis + v.vis, MAX_MS);
    if (v.fa && (!p.fa || v.fa < p.fa)) p.fa = v.fa;
  }

  const inWindow = u => !cutoff || u.ts >= cutoff;
  const allUnits = visits.filter(inWindow);
  const verified = [...people.values()].filter(inWindow);

  const counts = {};
  for (const v of allUnits) if (v.cls !== 'verified') counts[v.cls] = (counts[v.cls] || 0) + 1;
  const filtered = Object.keys(counts)
    .map(reason => ({ reason, label: REASON_LABELS[reason] || reason, count: counts[reason] }))
    .sort((a, b) => b.count - a.count);

  const out = {
    verified: block(verified),
    all: block(allUnits),
    filtered: { total: allUnits.length - verified.length, byReason: filtered }
  };

  if (admin) {
    const verifiedSids = new Set();
    for (const v of visits) {
      if (v.cls === 'verified' || (v.cls === 'duplicate' && v.ch && people.has('c:' + v.ch))) verifiedSids.add(v.sid);
    }
    out.leads = allUnits.filter(u => u.lead).map(u => ({
      ts: u.lead.ts, name: u.lead.name, email: u.lead.email, phone: u.lead.phone,
      verified: verifiedSids.has(u.sid), a: u.a || '', src: u.src || ''
    })).sort((a, b) => b.ts - a.ts).slice(0, 100);
  }

  return { out, v2Leads };
}

/* ---------- v1: the old report, unchanged in meaning ---------- */
function buildV1(events, admin) {
  const sessions = new Map();
  const leads = [];

  for (const e of events) {
    const sid = e.sid || 'anon-' + (e.ts || 0);
    if (!sessions.has(sid)) sessions.set(sid, { maxStep: 0, lead: false, a: '', q: '' });
    const s = sessions.get(sid);
    if (e.a && !s.a) s.a = String(e.a);
    if (e.q && !s.q) s.q = String(e.q);
    if (e.type === 'dwell') {
      const ms = Number(e.ms) || 0;
      if (e.where === 'landing') s.landingMs = Math.max(s.landingMs || 0, ms);
      else s.sessionMs = Math.max(s.sessionMs || 0, ms);
    }
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

  const byVariant = new Map();
  for (const s of list) {
    const key = s.a || '(none)';
    if (!byVariant.has(key)) byVariant.set(key, { variant: key, views: 0, started: 0, leads: 0, extra: '', _l: [], _s: [] });
    const v = byVariant.get(key);
    v.views++;
    if (s.maxStep >= 2) v.started++;
    if (s.lead) v.leads++;
    if (!v.extra && s.q) v.extra = s.q;
    if (s.landingMs) v._l.push(s.landingMs);
    if (s.sessionMs) v._s.push(s.sessionMs);
  }
  const variants = [...byVariant.values()].map(v => {
    const o = Object.assign({}, v, { conversionRate: rate(v.leads, v.views), avgLandingMs: avg(v._l), avgSessionMs: avg(v._s) });
    delete o._l; delete o._s;
    return o;
  }).sort((a, b) => b.views - a.views);

  const ts = events.map(e => e.ts || 0).filter(Boolean);
  const out = {
    from: ts.length ? Math.min(...ts) : null,
    to: ts.length ? Math.max(...ts) : null,
    totals: {
      views,
      attempted: list.filter(s => s.maxStep >= 2 && !s.lead).length,
      bounced: list.filter(s => s.maxStep < 2 && !s.lead).length,
      leads: converted,
      conversionRate: rate(converted, views),
      avgLandingMs: avg(list.filter(s => s.landingMs).map(s => s.landingMs)),
      avgSessionMs: avg(list.filter(s => s.sessionMs).map(s => s.sessionMs))
    },
    steps: [1, 2, 3, 4, 5, 6].map(n => ({
      step: n,
      label: STEP_LABELS[n],
      reached: list.filter(s => s.maxStep >= n).length,
      droppedHere: list.filter(s => !s.lead && s.maxStep === n).length
    })),
    variants
  };
  if (admin) out.leads = leads.sort((a, b) => b.ts - a.ts).slice(0, 50);
  return out;
}

/* ---------- ?raw=v1: one row per old session ----------
   Public, so it carries nothing personal: no names, emails, phones,
   IPs, session ids or full URLs. The referrer is cut down to its
   domain. Lead events only count towards the furthest step. */
function refDomain(ref) {
  if (!ref) return '';
  try { return new URL(String(ref)).hostname.toLowerCase(); } catch (_) { return ''; }
}

function rawV1(events) {
  const sessions = new Map();
  for (const e of events) {
    const sid = e.sid || 'anon-' + (e.ts || 0);
    if (!sessions.has(sid)) sessions.set(sid, { ts: 0, a: '', ref: '', totalMs: 0, landingMs: 0, step: 0 });
    const s = sessions.get(sid);
    if (e.ts && (!s.ts || e.ts < s.ts)) s.ts = e.ts;
    if (e.a && !s.a) s.a = String(e.a);
    if (e.type === 'view' && e.ref && !s.ref) s.ref = refDomain(e.ref);
    if (e.type === 'dwell') {
      const ms = Math.min(Number(e.ms) || 0, MAX_MS);
      if (e.where === 'landing') s.landingMs = Math.max(s.landingMs, ms);
      else s.totalMs = Math.max(s.totalMs, ms);
    }
    if (e.type === 'step') s.step = Math.max(s.step, Number(e.step) || 0);
    if (e.type === 'lead') s.step = Math.max(s.step, 6);
  }
  return [...sessions.values()]
    .sort((x, y) => x.ts - y.ts)
    .map(s => ({
      time: s.ts ? { iso: new Date(s.ts).toISOString(), toronto: torontoTime(s.ts) } : null,
      a: s.a,
      referrer: s.ref,
      totalMs: s.totalMs,
      landingMs: s.landingMs,
      step: s.step,
      stepLabel: STEP_LABELS[s.step] || ''
    }));
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const params = new URL(req.url, 'http://x').searchParams;
  const admin = hasKey(req, params);

  let events = [];
  try { events = await all(); } catch (_) {}
  let dwell = {};
  try { dwell = await allDwell(); } catch (_) {}

  /* The cutover is the first v2 event ever stored, whatever window is
     being looked at. */
  let since = null;
  for (const e of events) if (e.v === 2 && e.ts && (since === null || e.ts < since)) since = e.ts;

  const days = Number(params.get('days') || 0);
  const cutoff = days > 0 ? Date.now() - days * 86400000 : 0;

  const v2 = buildV2(events, dwell, cutoff, admin);

  const v1Events = events.filter(e =>
    e.v !== 2 && !v2.v2Leads.has(e) && (!cutoff || (e.ts || 0) >= cutoff));

  if (params.get('raw') === 'v1') {
    const sessions = rawV1(v1Events);
    return res.status(200).json({
      raw: 'v1',
      timeZone: TZ,
      generatedAt: Date.now(),
      days,
      note: 'v1 timings ran from page load until the tab was hidden; they were not limited to visible time.',
      count: sessions.length,
      sessions
    });
  }

  const body = {
    trackingVersion: TRACKING_VERSION,
    trackingSince: since ? { ts: since, iso: new Date(since).toISOString(), toronto: torontoTime(since) } : null,
    timeZone: TZ,
    persistent,
    admin,
    generatedAt: Date.now(),
    days,
    verified: v2.out.verified,
    all: v2.out.all,
    filtered: v2.out.filtered,
    legacy: buildV1(v1Events, admin)
  };
  if (admin) body.leads = v2.out.leads;

  res.status(200).json(body);
};

/* exposed for the tests */
module.exports._build = { buildV2, buildV1, rawV1, refDomain, torontoDay, torontoTime, median };
