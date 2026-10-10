/* ------------------------------------------------------------------
   Meta Conversions API.

   One implementation for every event: QuizStart (question 1, no
   contact details yet, only the click identifiers), Lead (contact form
   submitted, with hashed name, email and phone) and Schedule (call
   booked). Every personal field is optional and omitted when absent.

   Set these in Vercel → Settings → Environment Variables. With the ID
   or token missing the call is skipped silently and the page is
   unaffected.
   ------------------------------------------------------------------ */
const crypto = require('crypto');

const META_PIXEL_ID = process.env.META_PIXEL_ID || '';
const META_CAPI_TOKEN = process.env.META_CAPI_TOKEN || '';
const META_TEST_CODE = process.env.META_TEST_EVENT_CODE || '';
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0';

/* Meta requires personal data normalised, then SHA-256 hashed. */
const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');
const hashEmail = v => v ? sha(String(v).trim().toLowerCase()) : null;
const hashName  = v => v ? sha(String(v).trim().toLowerCase().replace(/[^a-zÀ-ɏ]/g, '')) : null;
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

async function sendEvent({
  eventName = 'Lead',
  name, email, phone,
  eventId, fbp, fbc, sourceUrl, sid, trade, req
}) {
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
      event_name: eventName,
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

module.exports = { sendEvent, clientIp };
