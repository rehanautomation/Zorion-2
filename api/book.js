/* ------------------------------------------------------------------
   Book a call.

   GET   the slots really booked over the next 14 days, so every
         visitor's calendar hides them. Slot keys only, nothing personal.
   POST  { name, email, phone, slot, sid, nolog, event_id, fbp, fbc,
           source_url }  where slot is an ISO time in Ontario time,
         e.g. 2026-10-09T14:30:00-04:00.

   The slot is checked against the same schedule the calendar draws
   from (assets/schedule.js): not in the past, inside opening hours,
   not already taken. It is then held with HSETNX, so two people can
   never book the same time.

   Same rules as api/lead.js:
     test (name "test" or test@gmail.com)  no Discord, no record, no Meta
     our own traffic (nolog / ADMIN_IPS)   Discord yes, no record, no Meta
   ------------------------------------------------------------------ */
const S = require('../assets/schedule.js');
const { readBody, isAdmin, reserveSlot, allBookings } = require('./_store');
const { sendEvent } = require('./_meta');

const WEBHOOK = process.env.BOOKING_WEBHOOK_URL || require('./lead').WEBHOOK;

const COLOR = 0x22C55E;   // bright green: it should catch the eye in the channel

function isTest(name, email) {
  return String(name || '').trim().toLowerCase() === 'test'
      || String(email || '').trim().toLowerCase() === 'test@gmail.com';
}

function fmtPhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : '';
}

/* Discord markdown in a name would restyle the embed. */
const md = s => String(s || '').replace(/([\\*_~`|>])/g, '\\$1');

/* "Thu, Oct 9 · 2:30 PM ET" */
function whenLabel(ymd, hm) { return S.dayShort(ymd) + ' · ' + S.time12(hm) + ' ET'; }

/* The Discord message. Exported so the one-off TEST ping is built by
   exactly the same code as a real booking. */
function discordMessage(b, opts) {
  const test = opts && opts.test;
  return {
    content: '@here 📅 **CALL BOOKED**',
    allowed_mentions: { parse: ['everyone'] },     // lets @here ping
    embeds: [{
      title: '📅 Call booked' + (test ? ' · TEST' : ''),
      description: '**' + md(b.name) + '** booked a call',
      color: COLOR,
      fields: [
        { name: 'When', value: whenLabel(b.ymd, b.hm), inline: false },
        { name: 'Phone', value: b.phone || '—', inline: true },
        { name: 'Email', value: b.email || '—', inline: true }
      ],
      timestamp: new Date(b.ts || Date.now()).toISOString()
    }]
  };
}

async function postDiscord(msg) {
  const r = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(msg)
  });
  return r.status;
}

/* { '2026-10-09T14:30': true } for every real booking */
async function takenMap() {
  const map = {};
  try { for (const b of await allBookings()) map[b.slot] = true; } catch (_) {}
  return map;
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const now = Date.now();

  if (req.method === 'GET') {
    const window = S.days(now);
    const taken = Object.keys(await takenMap()).filter(k => window.indexOf(k.slice(0, 10)) !== -1);
    return res.status(200).json({ ok: true, taken });
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const b = await readBody(req);
  const name = String(b.name || '').trim().slice(0, 120);
  const email = String(b.email || '').trim().slice(0, 160);
  const phone = fmtPhone(b.phone);

  if (!name || !phone) return res.status(400).json({ ok: false, error: 'missing_contact' });

  const slot = S.check(b.slot, now, await takenMap());
  if (!slot.ok) {
    return res.status(slot.reason === 'taken' ? 409 : 400).json({ ok: false, error: slot.reason });
  }

  const test = isTest(name, email);
  const ours = test || isAdmin(req, b);
  const booking = {
    slot: slot.key, iso: slot.iso, ymd: slot.ymd, hm: slot.hm,
    name, email, phone,
    sid: String(b.sid || '').slice(0, 40),
    ts: now
  };

  /* Hold the slot first. Losing the race means someone else has it. */
  if (!ours) {
    let held = false;
    try { held = await reserveSlot(slot.key, booking); } catch (_) { held = false; }
    if (!held) return res.status(409).json({ ok: false, error: 'taken' });
  }

  const jobs = [];
  if (!test) jobs.push(postDiscord(discordMessage(booking)).catch(() => 0));
  if (!ours) {
    jobs.push(sendEvent({
      eventName: 'Schedule',
      name, email, phone,
      eventId: b.event_id,
      fbp: b.fbp, fbc: b.fbc,
      sourceUrl: b.source_url,
      sid: booking.sid,
      req
    }).catch(() => null));
  }
  await Promise.all(jobs);

  res.status(200).json({ ok: true, slot: slot.key, iso: slot.iso, test, recorded: !ours });
}

module.exports = handler;
module.exports.discordMessage = discordMessage;
module.exports.whenLabel = whenLabel;
module.exports.WEBHOOK = WEBHOOK;
