/* ------------------------------------------------------------------
   Discord call reminders. Run often: GitHub Actions every 5 min (in
   practice less often), hourly Vercel crons through the call day, and
   the CRM page while open.

   The rules live in assets/crm-core.js (Z.nags). In short: a call stays
   open until Alicia taps an outcome, and until then she gets pinged:
     new lead     3 pings, 15 min apart
     other call   3 pings, 30 min apart, when it's due
     still open   3 pings, 30 min apart, in every call window after
                  (Morning 9–11, Lunch 12–2, Evening 5–7)
   Nothing ever goes quiet while a call is open, except outside 9 AM to
   7 PM and in the Sabbath.

   Call reminders channel (REMIND_FOLLOWUP_WEBHOOK): one message per
   round, listing every open call, follow-ups she promised first, then
   newest opt-in first. A round goes out whenever any lead has a ping
   due. Each ping is sent once; a late run still sends the latest ping
   if it is under NAG_FRESH old.
   Appointments channel (REMIND_APPT_WEBHOOK): 1 hour and 15 minutes
   before a booked call, any hour.
   ------------------------------------------------------------------ */
const Z = require('../assets/crm-core.js');
const { firstTime, forget, lock } = require('./_store');
const { load } = require('./crm');
const { ALICIA_ID } = require('./lead');

const FOLLOWUP = process.env.REMIND_FOLLOWUP_WEBHOOK || '';
const APPT = process.env.REMIND_APPT_WEBHOOK || '';
const MIN = 60e3, FRESH = 90 * MIN, NAG_FRESH = 45 * MIN;
const AT = '<@' + ALICIA_ID + '>';
const md = s => String(s || '').replace(/([\\*_~`|>])/g, '\\$1');
const CRM = 'https://www.zorionlife.com/crm?lead=';
const first = l => (l.name || 'lead').split(' ')[0];

/* Short, top-priority-first messages (Nov 1, user). The first line is
   what a phone notification shows: emoji, 2-4 word headline, first
   name, then the mention. It never says "NEW FACEBOOK LEAD", so a
   reminder can't be mistaken for a new opt-in (that message is 🟢). */
const link = (l, text) => '[' + text + '](<' + CRM + encodeURIComponent(l.id) + '>)';
const APPT_HEAD = { 'Appointment in 1 hr': 'Call in 1 hr', 'Appointment in 15 min': 'Call in 15 min' };

function msg(head, l, what) {
  const ph = l.phone ? md(l.phone) + ' · ' : '';
  return '📅 **' + (APPT_HEAD[head] || head) + ': ' + md(first(l)) + '** ' + AT + '\n'
    + ph + (what ? what + ' · ' : '') + link(l, 'Open in CRM');
}

/* new lead nobody has called > a follow-up she promised > the next try */
const RANK = { new: 0, followup: 1, call: 2 };
const HEAD = { new: 'New lead, not called', followup: 'Follow-up due', call: 'Call again' };
function kindOf(r) { return r.d.fresh ? 'new' : (r.d.kind === 'followup' ? 'followup' : 'call'); }
function status(r) {
  const k = kindOf(r);
  if (k === 'new') return 'new lead, not called';
  if (k === 'followup') return 'follow-up due';
  return 'call ' + (r.d.noAnswers + 1) + ' of ' + r.d.total;
}

/* One lead right now: its latest ping (if any, and fresh), whether its
   call is open, and its appointment pings. */
function plan(l, now) {
  const d = Z.derive(l, l.state, l.booking, now);
  const out = { lead: l, d, open: false, ping: null, appts: [] };
  if (d.stage === 'done' || !d.next) return out;
  const list = Z.nags(l, l.state, l.booking, now - FRESH, now);
  if (d.kind === 'booked') {
    out.appts = list.map(n => ({ key: l.id + ':appt:' + n.t, text: msg(n.label, l, Z.time12(d.next)) }));
    return out;
  }
  if (d.kind !== 'cadence' && d.kind !== 'followup') return out;
  out.open = d.next <= now;
  const last = list.filter(n => now - n.t <= NAG_FRESH).pop();
  if (last) { out.ping = { key: l.id + ':nag:' + last.t, label: last.label, n: last.n }; out.open = true; }
  return out;
}

/* The round message: every open call, most urgent first, newest lead first within each. */
function roundText(rows, now) {
  rows = rows.slice().sort((a, b) => (RANK[kindOf(a)] - RANK[kindOf(b)]) || (b.lead.ts - a.lead.ts));
  const top = rows[0], k = kindOf(top);
  const more = rows.length > 1 ? ' · +' + (rows.length - 1) + ' more' : '';
  const head = '🚨 **' + HEAD[k] + ': ' + md(first(top.lead)) + '**' + more + ' ' + AT;
  if (rows.length === 1) {
    const l = top.lead, bits = [];
    if (l.phone) bits.push(md(l.phone));
    if (k === 'call') bits.push(status(top));
    if (top.ping && top.ping.n) bits.push('reminder ' + top.ping.n + '/3');
    bits.push(link(l, 'Open in CRM'));
    return head + '\n' + bits.join(' · ');
  }
  const MAX = 10, lines = [];
  rows.slice(0, MAX).forEach((r, i) => {
    const l = r.lead;
    lines.push((i + 1) + '. **' + md(l.name || 'Lead') + '** · ' + status(r) + (l.phone ? ' · ' + md(l.phone) : '') + ' · ' + link(l, 'Open'));
  });
  if (rows.length > MAX) lines.push('…and ' + (rows.length - MAX) + ' more in the CRM');
  return head + '\n' + lines.join('\n');
}

async function post(hook, text) {
  const r = await fetch(hook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: text, allowed_mentions: { parse: [], users: [ALICIA_ID] } })
  });
  return r.ok;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    /* ?hello=1 posts one "connected" line to each channel, once ever */
    if (String(req.url || '').indexOf('hello=1') !== -1) {
      const out = {};
      if (FOLLOWUP && await firstTime('hello:followup')) out.followup = await post(FOLLOWUP, '✅ Call reminders connected');
      if (APPT && await firstTime('hello:appt')) out.appt = await post(APPT, '✅ Appointment reminders connected');
      return res.status(200).json({ ok: true, hello: out });
    }
    /* REMINDERS_PAUSED=1 in Vercel stops every reminder (set Oct 17, user's call).
       Resuming never floods: only reminders from the last 40 minutes go out. */
    if (process.env.REMINDERS_PAUSED === '1') return res.status(200).json({ ok: true, paused: true });
    if (!(await lock('remind', 50))) return res.status(200).json({ ok: true, busy: true });
    const now = Date.now();
    const leads = await load();
    let sent = 0, waiting = 0;
    const rows = leads.map(l => plan(l, now));

    /* appointments: one message each, any hour */
    for (const r of rows) for (const a of r.appts) {
      if (!APPT) { waiting++; continue; }
      if (!(await firstTime(a.key))) continue;
      const ok = await post(APPT, a.text).catch(() => false);
      if (ok) sent++; else await forget(a.key);
    }

    /* calls: one round message when any open call has a new ping */
    const open = rows.filter(r => r.open);
    const fresh = [];
    for (const r of open) if (r.ping && FOLLOWUP && await firstTime(r.ping.key)) fresh.push(r.ping.key);
    if (!FOLLOWUP && open.some(r => r.ping)) waiting++;
    if (fresh.length) {
      const ok = await post(FOLLOWUP, roundText(open, now)).catch(() => false);
      if (ok) sent++; else for (const k of fresh) await forget(k);
    }

    res.status(200).json({ ok: true, sent, waiting, open: open.length, followup: Boolean(FOLLOWUP), appt: Boolean(APPT) });
  } catch (err) {
    console.error('remind failed', err);
    res.status(200).json({ ok: false, error: String(err && err.message || err) });
  }
};
module.exports.plan = plan;
module.exports.roundText = roundText;
