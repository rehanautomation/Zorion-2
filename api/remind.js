/* ------------------------------------------------------------------
   Discord call reminders. Run often: GitHub Actions every 5 min (in
   practice less often), a Vercel cron every hour of the call day, and
   the CRM page while open. Each reminder is sent
   once, ever, and only while it is still fresh (within FRESH of its
   time), so a late or missed run never floods the channel.

   Call reminders channel (REMIND_FOLLOWUP_WEBHOOK):
     new lead, not called yet   one nudge 30 min after it was due (plus the
                                first call itself if it came in after hours)
     each call in the plan      when it is due (one message per call)
     follow-up                  at the time she picked
   Appointments channel (REMIND_APPT_WEBHOOK):
     booked call                1 hour and 15 minutes before

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
const MIN = 60e3, FRESH = 90 * MIN;   // runs can be late (GitHub, hourly Vercel crons)
const AT = '<@' + ALICIA_ID + '>';
const md = s => String(s || '').replace(/([\\*_~`|>])/g, '\\$1');

/* Every reminder starts with the same bell line so it reads at a glance:
     🔔 New lead · call now         a lead came in outside hours (first call)
     🔔 New lead · not called yet   one nudge, 30 min after a new lead
     🔔 Call · <name>               next call in the plan is due
     🔔 Follow-up · <name>          a follow-up time she picked is here
     🔔 Appointment in 1 hr / 15 min
   Line 2: name · phone · what. Line 3: the link opens that lead's card. */
const CRM = 'https://www.zorionlife.com/crm?lead=';
function msg(head, l, what) {
  const who = md(l.name || 'Lead'), ph = l.phone ? ' · ' + l.phone : '';
  return '🔔 **' + head + '** ' + AT + '\n' + who + ph + (what ? ' · ' + what : '') + '\n<' + CRM + encodeURIComponent(l.id) + '>';
}

/* every reminder a lead should get right now: [{key, hook, text}] */
function plan(l, now) {
  const d = Z.derive(l, l.state, l.booking, now);
  if (d.stage === 'done' || !d.next) return [];
  const out = [];
  const add = (key, at, hook, text, anyHour) => {
    if (at > now || now - at > FRESH) return;
    if (!anyHour && Z.allowed(at) !== at) return;
    out.push({ key: l.id + ':' + key + ':' + at, hook, text });
  };

  if (d.kind === 'booked') {
    add('appt60', d.next - 60 * MIN, APPT, msg('Appointment in 1 hr', l, Z.time12(d.next)), true);
    add('appt15', d.next - 15 * MIN, APPT, msg('Appointment in 15 min', l, Z.time12(d.next)), true);
    return out;
  }
  const called = (d.calls || []).length > 0;
  if (!called && d.stage === 'new' && !d.restarted) {
    /* in hours, the #leads ping is the first call reminder */
    if (d.next > l.ts + 10 * MIN) add('first', d.next, FOLLOWUP, msg('New lead · call now', l, 'double dial'));
    add('nudge', d.next + 30 * MIN, FOLLOWUP, msg('New lead · not called yet', l, 'double dial'));
    return out;
  }
  if (d.kind === 'cadence') {
    const what = 'call ' + (d.noAnswers + 1) + '/' + d.total + (d.text ? ' + text' : '');
    add('due', d.next, FOLLOWUP, msg('Call · ' + (l.name || 'lead').split(' ')[0], l, what));
    /* not logged by the next lunch/evening slot: one more nudge, then quiet */
    add('again', Z.rollToSlot(d.next + 60 * MIN), FOLLOWUP, msg('Call · ' + (l.name || 'lead').split(' ')[0], l, what + ' · still open'));
  }
  if (d.kind === 'followup') add('due', d.next, FOLLOWUP, msg('Follow-up · ' + (l.name || 'lead').split(' ')[0], l, 'they asked for this time'));
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
    for (const l of leads) {
      for (const r of plan(l, now)) {
        if (!r.hook) { waiting++; continue; }          // channel not set up yet
        if (!(await firstTime(r.key))) continue;
        const ok = await post(r.hook, r.text).catch(() => false);
        if (ok) sent++; else await forget(r.key);     // try again next run
      }
    }
    /* One-off (Oct 25, Rehan): call reminder for Michael DelFuego at
       Sun Oct 25 2026, 6:50 PM Toronto (EDT = UTC-4). Sent once, same
       freshness window as every other reminder. Safe to delete after. */
    const ONEOFF = Date.UTC(2026, 9, 25, 22, 50);
    if (FOLLOWUP && now >= ONEOFF && now - ONEOFF < FRESH) {
      const mk = leads.find(x => String(x.phone || '').replace(/\D/g, '').slice(-10) === '2896529248');
      const key = 'oneoff:michael:' + ONEOFF;
      if (mk && await firstTime(key)) {
        const ok = await post(FOLLOWUP, msg('Call · Michael', { id: mk.id, name: 'Michael DelFuego', phone: '(289) 652-9248' }, 'call 1/5')).catch(() => false);
        if (ok) sent++; else await forget(key);
      }
    }
    res.status(200).json({ ok: true, sent, waiting, followup: Boolean(FOLLOWUP), appt: Boolean(APPT) });
  } catch (err) {
    console.error('remind failed', err);
    res.status(200).json({ ok: false, error: String(err && err.message || err) });
  }
};
module.exports.plan = plan;
