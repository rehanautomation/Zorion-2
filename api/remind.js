/* ------------------------------------------------------------------
   Discord call reminders. Run every few minutes (GitHub Actions hits
   this; the CRM page also nudges it while open). Each reminder is sent
   once, ever, and only while it is still fresh (within FRESH of its
   time), so a late or missed run never floods the channel.

   Follow-ups channel (REMIND_FOLLOWUP_WEBHOOK):
     new lead, not called yet   at +30, +60, +90 min (and at 9 AM / after
                                the Sabbath if he came in outside hours)
     cadence call or follow-up  when it is due
   Appointments channel (REMIND_APPT_WEBHOOK):
     booked call                15 minutes before, and at the time

   Every reminder @mentions Alicia. Only inside call hours (9 AM to
   7 PM Toronto, never in the Sabbath), except booked calls, which go
   when they are booked for.
   ------------------------------------------------------------------ */
const Z = require('../assets/crm-core.js');
const { firstTime, forget, lock } = require('./_store');
const { load } = require('./crm');
const { ALICIA_ID } = require('./lead');

const FOLLOWUP = process.env.REMIND_FOLLOWUP_WEBHOOK || '';
const APPT = process.env.REMIND_APPT_WEBHOOK || '';
const MIN = 60e3, FRESH = 40 * MIN;
const AT = '<@' + ALICIA_ID + '>';
const md = s => String(s || '').replace(/([\\*_~`|>])/g, '\\$1');

/* every reminder a lead should get right now: [{key, hook, text}] */
function plan(l, now) {
  const d = Z.derive(l, l.state, l.booking, now);
  if (d.stage === 'done' || !d.next) return [];
  const who = md(l.name || 'New lead'), ph = l.phone ? ' · ' + l.phone : '';
  const out = [];
  const add = (key, at, hook, text, anyHour) => {
    if (at > now || now - at > FRESH) return;
    if (!anyHour && Z.allowed(at) !== at) return;
    out.push({ key: l.id + ':' + key + ':' + at, hook, text });
  };

  if (d.kind === 'booked') {
    add('appt15', d.next - 15 * MIN, APPT, AT + ' 📅 ' + who + ' at ' + Z.time12(d.next) + ph, true);
    add('apptnow', d.next, APPT, AT + ' 📅 ' + who + ' now' + ph, true);
    return out;
  }
  const called = (d.calls || []).length > 0;
  if (!called && d.stage === 'new') {
    if (d.next > l.ts + 10 * MIN) add('first', d.next, FOLLOWUP, AT + ' 📞 Call ' + who + ' now · new lead' + ph);
    [30, 60, 90].forEach(m => add('wait' + m, d.next + m * MIN, FOLLOWUP, AT + ' ⏰ ' + who + ' not called · ' + m + ' min' + ph));
    return out;
  }
  if (d.kind === 'cadence') add('due', d.next, FOLLOWUP, AT + ' 📞 Call ' + who + ' · ' + (d.noAnswers + 1) + ' of ' + Z.TOTAL + ph);
  if (d.kind === 'followup') add('due', d.next, FOLLOWUP, AT + ' 📞 Follow up ' + who + ph);
  return out;
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
    if (!(await lock('remind', 50))) return res.status(200).json({ ok: true, busy: true });
    const now = Date.now();
    const leads = await load();
    let sent = 0, waiting = 0;
    for (const l of leads) {
      for (const r of plan(l, now)) {
        if (!r.hook) { waiting++; continue; }          // channel not set up yet
        if (!(await firstTime(r.key))) continue;
        const ok = await post(r.hook, r.text).catch(() => false);
        if (ok) sent++; else await forget(r.key);     // try again next run
      }
    }
    res.status(200).json({ ok: true, sent, waiting, followup: Boolean(FOLLOWUP), appt: Boolean(APPT) });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err && err.message || err) });
  }
};
module.exports.plan = plan;
