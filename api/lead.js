const crypto = require('crypto');
const { push, readBody, isAdmin, firstTime } = require('./_store');
const { sendEvent } = require('./_meta');

const WEBHOOK = process.env.DISCORD_WEBHOOK_URL
  || 'https://discord.com/api/webhooks/1545510678142656623/hZOQ8Rsb23OaDsTINDGmWWnl-DQVY1d1zYBiPV89Ny23ZSjaUGuqO8bRDKfZWSKYVAP_';

/* Alicia's Discord user ID. Every lead ping @mentions her, so it
   reaches her phone even when she has muted the channel. */
const ALICIA_ID = '1547709023212544013';
const MENTION = '<@' + ALICIA_ID + '>';

/* In the order he answers them. The keys are the form field names, which
   kept their old numbering when the debt list was dropped. */
const QUESTIONS = [
  { key: 'q2', label: 'Roughly, how much have you personally signed for?',
    options: { 'under-100':'Under $100,000','100-250':'$100,000 - $250,000','250-500':'$250,000 - $500,000','over-500':'Over $500,000','not-sure':'Not sure' } },
  { key: 'q4', label: "If something happened to you tomorrow, who'd be left holding it?",
    options: { 'wife':'My wife','partner':'My business partner','kids':'My kids','unsure':'Honestly, not sure' } },
  { key: 'q3', label: 'What have you got in place right now?', multi: true,
    options: { 'mortgage':'Mortgage insurance through the bank','personal':'A personal life insurance policy','spouse':"Something through my wife's work",'nothing':'Nothing','unsure':'Not sure' } },
  { key: 'q5', label: 'How old are you?',
    options: { '25-34':'25 - 34','35-44':'35 - 44','45-54':'45 - 54','55-64':'55 - 64','65+':'65+','55+':'55+' } }
];

function label(q, raw) {
  return (q.options && q.options[raw]) ? q.options[raw] : raw;
}

function formatAnswers(a) {
  if (!a) return '';
  const blocks = [];
  QUESTIONS.forEach((q, i) => {
    const raw = a[q.key];
    let text;
    if (q.multi) {
      const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
      text = list.length ? list.map(v => label(q, v)).join(', ') : 'No answer';
    } else {
      text = raw ? label(q, raw) : 'No answer';
    }
    blocks.push('Q' + (i + 1) + ' : ' + q.label + '\n**' + text + '**');
  });
  if (a.trade) blocks.push('Trade\n**' + a.trade + '**');
  return blocks.join('\n\n');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const b = await readBody(req);
  if (b.op === 'meta_form') return metaForm(req, res, b);
  const name = String(b.name || '').slice(0, 120);
  const email = String(b.email || '').slice(0, 160);
  const phone = String(b.phone || '').slice(0, 60);

  /* A test submission gets no Discord ping, no row in the report and
     no Meta Lead. /?nolog=1 keeps our own browsers out of Meta too. */
  const isTest = name.trim().toLowerCase() === 'test'
              || email.trim().toLowerCase() === 'test@gmail.com';

  let content = [MENTION + ' **NEW FACEBOOK LEAD**', 'name : ' + name, 'email : ' + email, 'phone : ' + phone].join('\n');
  const answerBlock = formatAnswers(b.answers);
  if (answerBlock) content += '\n\n' + answerBlock;
  if (content.length > 1990) content = content.slice(0, 1990) + '...';

  /* Record first, so nothing downstream can lose a real lead. Our own
     traffic and test submissions are the two things that never reach
     the report. */
  const ours = isAdmin(req, b) || isTest;
  if (!ours) {
    try {
      await push({ type: 'lead', sid: String(b.sid || '').slice(0, 40), name, email, phone, answers: b.answers || null, ts: Date.now() });
    } catch (_) {}
  }

  if (!isTest) {
    try {
      await fetch(WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content, allowed_mentions: { parse: [], users: [ALICIA_ID] } })
      });
    } catch (_) {}
  }

  /* The server half of the Meta Lead, the conversion. After the
     Discord ping, so Alicia hears first. Same event_id as the browser
     Pixel Lead, so Meta counts one. Never for our own
     traffic, a test submission, or a repeat submit from the same tab
     (the browser sends meta:false then). */
  let meta = null;
  if (!ours && b.meta !== false && b.event_id) {
    try {
      meta = await sendEvent({
        eventName: 'Lead',
        name, email, phone,
        eventId: String(b.event_id).slice(0, 80),
        fbp: b.fbp, fbc: b.fbc,
        sourceUrl: b.source_url,
        sid: b.sid,
        trade: '',
        req
      });
    } catch (err) { meta = { error: String(err && err.message) }; }
  }

  res.status(200).json({ ok: true, test: isTest, discord: !isTest, recorded: !ours, meta: meta ? true : false });
};

/* ------------------------------------------------------------------
   Meta lead form leads (the Batch 3 video ads), sent by Make.com
   scenario "Zorion: Meta lead form -> CRM + Discord DM":
   Facebook Lead Ads "New Lead" -> Get Lead Details -> Transform to
   JSON -> HTTP POST here (op:'meta_form'). This endpoint posts the
   lead to the sales channel in the same format as website leads.

   - The key Make sends must hash to MAKE_KEY_SHA256 (the key itself
     lives only in the Make scenario; the repo is public).
   - Stored as type 'formlead' (not 'lead'), so the CRM and Alicia's
     call reminders get it but the website funnel numbers in /report
     stay clean.
   - Meta's Lead Ads Testing Tool leads ("dummy data") and empty leads
     are ignored: no post, no CRM row.
   - The same Meta lead ID is only stored once (Make retries).
   ------------------------------------------------------------------ */
const MAKE_KEY_SHA256 = '66d5e2b28a58b0a4a0936597154aa0e1b85b8723b318d9117b141beb3fb882f4';
const pretty = s => {
  s = String(s || '').replace(/_/g, ' ').replace(/\s+/g, ' ').replace(/\bi\b/g, 'I').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
};
function shortQ(q) {
  if (/worr/i.test(q)) return 'Worries most';
  if (/business account|name is on|name on/i.test(q)) return 'Business account';
  return q.length > 40 ? q.slice(0, 38) + '…' : q;
}
function keyOk(given) {
  const h = crypto.createHash('sha256').update(String(given || '')).digest();
  return crypto.timingSafeEqual(h, Buffer.from(MAKE_KEY_SHA256, 'hex'));
}

async function metaForm(req, res, b) {
  if (!keyOk(b.key)) return res.status(401).json({ ok: false });

  let fd = b.field_data;
  if (typeof fd === 'string') { try { fd = JSON.parse(fd); } catch (_) { fd = []; } }
  /* Make sends the lead's "data" collection as JSON: { field: [values] } */
  let dj = b.data_json;
  if (typeof dj === 'string') { try { dj = JSON.parse(dj); } catch (_) { dj = null; } }
  if ((!Array.isArray(fd) || !fd.length) && dj && typeof dj === 'object') {
    fd = Object.keys(dj).map(k => ({ name: k, values: dj[k] }));
  }
  if (!Array.isArray(fd)) fd = [];
  const f = {};
  const qa = [];
  for (const x of fd) {
    if (!x || !x.name) continue;
    const vals = Array.isArray(x.values) ? x.values : (x.values != null ? [x.values] : []);
    const v = vals.map(String).join(', ');
    const k = String(x.name).toLowerCase();
    f[k] = v;
    if (!/^(full_name|first_name|last_name|email|phone_number|phone)$/.test(k)) {
      const q = pretty(x.name).replace(/\s*\?$/, '?');
      qa.push({ q: shortQ(q), full: q, a: pretty(v) || '—' });
    }
  }
  const name = String(f.full_name || [f.first_name, f.last_name].filter(Boolean).join(' ')).slice(0, 120);
  const email = String(f.email || '').slice(0, 160);
  const phone = String(f.phone_number || f.phone || '').slice(0, 60);
  const leadId = String(b.lead_id || '').slice(0, 40);
  const ad = String(b.ad_name || '').slice(0, 120);
  const isTest = /dummy data|test lead/i.test(name + ' ' + email) || b.test === true || b.test === 'true';

  /* Meta's testing tool, or a lead with nothing in it: no post, no CRM row */
  if (isTest || !(name || email || phone)) return res.status(200).json({ ok: true, test: isTest, recorded: false });

  if (leadId) {
    let first = true;
    try { first = await firstTime('formlead:' + leadId); } catch (_) {}
    if (!first) return res.status(200).json({ ok: true, duplicate: true });
  }

  await push({
    type: 'formlead', ts: Date.now(), name, email, phone, qa,
    ad, campaign: String(b.campaign_name || '').slice(0, 120),
    lead_id: leadId, form_id: String(b.form_id || '').slice(0, 40),
    platform: String(b.platform || '').slice(0, 20)
  });

  /* Same post and format as the website leads, in the sales channel */
  let content = [MENTION + ' **NEW FACEBOOK LEAD**', 'name : ' + name, 'email : ' + email, 'phone : ' + phone].join('\n');
  const blocks = qa.map((x, i) => 'Q' + (i + 1) + ' : ' + x.full + '\n**' + x.a + '**');
  if (blocks.length) content += '\n\n' + blocks.join('\n\n');
  if (content.length > 1990) content = content.slice(0, 1990) + '...';
  let discord = false;
  try {
    const r = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, allowed_mentions: { parse: [], users: [ALICIA_ID] } })
    });
    discord = r.ok;
  } catch (_) {}

  res.status(200).json({ ok: true, recorded: true, discord });
}

/* api/book.js posts call bookings to the same channel unless
   BOOKING_WEBHOOK_URL is set. */
module.exports.WEBHOOK = WEBHOOK;
module.exports.QUESTIONS = QUESTIONS;
module.exports.ALICIA_ID = ALICIA_ID;
