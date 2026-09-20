/* ------------------------------------------------------------------
   The conversion event, fired the moment question 1 is answered.

   The browser fires the Pixel Lead at the same instant with the same
   event_id, so Meta counts one Lead, not two.

   No contact details exist yet — matching rests on fbc (from the ad
   click), fbp, IP and user agent. Our own traffic is excluded the same
   way it is everywhere else, since at question 1 there is no name or
   email to recognise us by.
   ------------------------------------------------------------------ */
const { readBody, isAdmin } = require('./_store');
const { sendEvent } = require('./_meta');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const b = await readBody(req);

  if (isAdmin(req, b)) {
    return res.status(200).json({ ok: true, skipped: 'our own traffic' });
  }

  let meta = null;
  try {
    meta = await sendEvent({
      eventName: 'Lead',
      eventId: b.event_id,
      fbp: b.fbp,
      fbc: b.fbc,
      sourceUrl: b.source_url,
      sid: b.sid,
      trade: '',
      req
    });
  } catch (err) {
    meta = { error: String(err && err.message) };
  }

  res.status(200).json({ ok: true, meta });
};
