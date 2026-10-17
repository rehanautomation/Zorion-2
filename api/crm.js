/* ------------------------------------------------------------------
   The CRM's data. Admin key only (ADMIN_KEY, sent as x-crm-key), since
   every lead's name and phone comes back.

   GET   every real lead from the event store, with its answers, the
         ad that brought him, any call he booked himself on the results
         page, and his saved pipeline state.
   POST  { id, action, at?, text?, stage?, result? }
         action: no_answer · talked · booked · won · lost · stage ·
                 note · undo · reopen
         Returns the lead's new saved state.

   The rules (cadence, Sabbath, what each action does) live in
   assets/crm-core.js, shared with the page.
   ------------------------------------------------------------------ */
const crypto = require('crypto');
const Z = require('../assets/crm-core.js');
const { all, readBody, allBookings, crmAll, crmGet, crmSet } = require('./_store');
const { QUESTIONS } = require('./lead');

const SHORT = { q2: 'Signed for', q4: 'Left holding it', q3: 'Has now', q5: 'Age' };

function hasKey(req) {
  const KEY = process.env.ADMIN_KEY || '';
  const given = String(req.headers['x-crm-key'] || '');
  if (!KEY || !given) return false;
  const h = s => crypto.createHash('sha256').update(String(s)).digest();
  return crypto.timingSafeEqual(h(KEY), h(given));
}

const digits = s => String(s || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
const leadId = e => String(e.ts) + (e.sid ? '-' + String(e.sid).slice(0, 8) : '');

function answers(a) {
  if (!a) return [];
  return QUESTIONS.map(q => {
    const raw = a[q.key];
    const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    const text = list.length ? list.map(v => (q.options && q.options[v]) || v).join(', ') : '—';
    return { q: SHORT[q.key] || q.label, full: q.label, a: text };
  });
}

async function load() {
  const [events, bookings, states] = await Promise.all([all(), allBookings().catch(() => []), crmAll()]);

  /* the ad behind each session: its first view's a= tag, or the story link */
  const adOf = {};
  for (let i = events.length - 1; i >= 0; i--) {       // the list is newest first
    const e = events[i];
    if (e.type !== 'view' || !e.sid || adOf[e.sid]) continue;
    const tag = e.a || (e.story ? 'story' : '');
    if (tag) adOf[e.sid] = tag;
  }

  /* one lead per person: a repeat submit with the same phone folds into the first */
  const leads = [], seen = {};
  const raw = events.filter(e => e.type === 'lead').sort((a, b) => a.ts - b.ts);
  for (const e of raw) {
    const d = digits(e.phone);
    const k = d || String(e.email || '').toLowerCase() || leadId(e);
    if (seen[k]) continue;
    seen[k] = true;
    leads.push(e);
  }

  const bySid = {}, byPhone = {};
  for (const b of bookings) {
    const at = Date.parse(b.iso || '') || null;
    if (!at) continue;
    const row = { at, slot: b.slot };
    if (b.sid) bySid[b.sid] = row;
    if (digits(b.phone)) byPhone[digits(b.phone)] = row;
  }

  return leads.map(e => {
    const id = leadId(e);
    const st = states[id] || null;
    if (st) delete st.hist;
    const tag = adOf[e.sid] || '';
    return {
      id, ts: e.ts,
      name: e.name || '', email: e.email || '', phone: e.phone || '',
      answers: answers(e.answers),
      ad: tag ? (Z.AD_LABELS[tag] || tag) : '',
      booking: (e.sid && bySid[e.sid]) || byPhone[digits(e.phone)] || null,
      state: st,
      canUndo: Boolean(states[id] && (states[id].hist || []).length)
    };
  }).sort((a, b) => b.ts - a.ts);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (!hasKey(req)) return res.status(401).json({ ok: false, error: 'key' });

  try {
    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, now: Date.now(), leads: await load() });
    }
    if (req.method !== 'POST') return res.status(405).json({ ok: false });

    const b = await readBody(req);
    const id = String(b.id || '').slice(0, 60);
    if (!id || Z.ACTIONS.indexOf(b.action) === -1) return res.status(400).json({ ok: false, error: 'bad_request' });

    const now = Date.now();
    const action = {
      action: b.action,
      at: Number(b.at) || null,
      text: b.text,
      stage: b.stage,
      result: b.result
    };
    const prev = await crmGet(id);
    const next = Z.apply(prev, action, now);
    await crmSet(id, next);
    const canUndo = (next.hist || []).length > 0;
    delete next.hist;
    return res.status(200).json({ ok: true, id, state: next, canUndo });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err && err.message || err) });
  }
};

module.exports.load = load;
