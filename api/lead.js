const crypto = require('crypto');
const { push, readBody, isAdmin } = require('./_store');

const WEBHOOK = process.env.DISCORD_WEBHOOK_URL
  || 'https://discord.com/api/webhooks/1545510678142656623/hZOQ8Rsb23OaDsTINDGmWWnl-DQVY1d1zYBiPV89Ny23ZSjaUGuqO8bRDKfZWSKYVAP_';

/* ---- Meta Conversions API ----
   Set these three in Vercel → Settings → Environment Variables.
   If the ID or token is missing, the CAPI call is skipped silently and
   everything else still works. */
const META_PIXEL_ID = process.env.META_PIXEL_ID || '';
const META_CAPI_TOKEN = process.env.META_CAPI_TOKEN || '';
const META_TEST_CODE = process.env.META_TEST_EVENT_CODE || '';
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0';

const QUESTIONS = [
  { key: 'q1', label: 'Which of these have you signed for personally?', multi: true },
  { key: 'q2', label: 'Roughly, what do those add up to?',
    options: { 'under-100':'Under $100,000','100-250':'$100,000 - $250,000','250-500':'$250,000 - $500,000','over-500':'Over $500,000','not-sure':'Not sure' } },
  { key: 'q3', label: 'What have you got in place right now?', multi: true,
    options: { 'mortgage':'Mortgage insurance through the bank','personal':'A personal life insurance policy','spouse':"Something through my wife's work",'nothing':'Nothing','unsure':'Not sure' } },
  { key: 'q4', label: "If something happened to you tomorrow, who'd be left holding it?",
    options: { 'wife':'My wife','partner':'My business partner','kids':'My kids','unsure':'Honestly, not sure' } },
  { key: 'q5', label: 'How old are you?',
    options: { '25-34':'25 - 34','35-44':'35 - 44','45-54':'45 - 54','55+':'55+' } }
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

/* ---- Meta requires personal data normalised, then SHA-256 hashed ---- */
const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');
const hashEmail = v => v ? sha(String(v).trim().toLowerCase()) : null;
const hashName  = v => v ? sha(String(v).trim().toLowerCase().replace(/[^a-z\u00C0-\u024F]/g, '')) : null;
function hashPhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 10) d = '1' + d;            // Canada / US
  return sha(d);
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (!xf) return undefined;
  return String(xf).split(',')[0].trim();
}

async function sendToMeta({ name, email, phone, eventId, fbp, fbc, sourceUrl, sid, trade, req }) {
  if (!META_PIXEL_ID || !META_CAPI_TOKEN) return { skipped: 'no credentials' };

  const parts = String(name || '').trim().split(/\s+/);
  const first = parts[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1] : '';

  const user_data = {
    em: hashEmail(email) ? [hashEmail(email)] : undefined,
    ph: hashPhone(phone) ? [hashPhone(phone)] : undefined,
    fn: hashName(first) ? [hashName(first)] : undefined,
    ln: hashName(last) ? [hashName(last)] : undefined,
    external_id: sid ? [sha(String(sid))] : undefined,
    // fbp and fbc must be sent raw. Hashing them breaks matching.
    fbp: fbp || undefined,
    fbc: fbc || undefined,
    client_ip_address: clientIp(req),
    client_user_agent: req.headers['user-agent'] || undefined
  };
  Object.keys(user_data).forEach(k => user_data[k] === undefined && delete user_data[k]);

  const payload = {
    data: [{
      event_name: 'Lead',
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId || undefined,          // matches the browser event
      event_source_url: sourceUrl || undefined,
      action_source: 'website',
      user_data,
      custom_data: { content_name: 'Zorion quiz', content_category: trade || '' }
    }]
  };
  if (META_TEST_CODE) payload.test_event_code = META_TEST_CODE;

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(META_CAPI_TOKEN)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res.json();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const b = await readBody(req);
  const name = String(b.name || '').slice(0, 120);
  const email = String(b.email || '').slice(0, 160);
  const phone = String(b.phone || '').slice(0, 60);

  /* A lead named exactly "test" is you. It still goes to Meta so you can
     verify tracking, and it's still recorded, but no Discord ping. */
  const isTest = name.trim().toLowerCase() === 'test';

  let content = ['**NEW FACEBOOK LEAD**', 'name : ' + name, 'email : ' + email, 'phone : ' + phone].join('\n');
  const answerBlock = formatAnswers(b.answers);
  if (answerBlock) content += '\n\n' + answerBlock;
  if (content.length > 1990) content = content.slice(0, 1990) + '...';

  /* Record first, so nothing downstream can lose the lead — unless it
     is one of our own test submissions, which must not reach the
     report. Discord and Meta still fire so testing stays end-to-end. */
  const ours = isAdmin(req, b);
  if (!ours) {
    try {
      await push({ type: 'lead', sid: String(b.sid || '').slice(0, 40), name, email, phone, answers: b.answers || null, ts: Date.now() });
    } catch (_) {}
  }

  let meta = null;
  try {
    meta = await sendToMeta({
      name, email, phone,
      eventId: b.event_id,
      fbp: b.fbp,
      fbc: b.fbc,
      sourceUrl: b.source_url,
      sid: b.sid,
      trade: b.answers && b.answers.trade,
      req
    });
  } catch (err) {
    meta = { error: String(err && err.message) };
  }

  if (!isTest) {
    try {
      await fetch(WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content, allowed_mentions: { parse: [] } })
      });
    } catch (_) {}
  }

  res.status(200).json({ ok: true, discord: !isTest, recorded: !ours, meta });
};
