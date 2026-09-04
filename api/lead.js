const { push, readBody } = require('./_store');

const WEBHOOK = process.env.DISCORD_WEBHOOK_URL
  || 'https://discord.com/api/webhooks/1545510678142656623/hZOQ8Rsb23OaDsTINDGmWWnl-DQVY1d1zYBiPV89Ny23ZSjaUGuqO8bRDKfZWSKYVAP_';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const b = await readBody(req);
  const name = String(b.name || '').slice(0, 120);
  const email = String(b.email || '').slice(0, 160);
  const phone = String(b.phone || '').slice(0, 60);

  const content = [
    '**NEW FACEBOOK LEAD**',
    `name : ${name}`,
    `email : ${email}`,
    `phone : ${phone}`
  ].join('\n');

  // record first so a Discord outage never loses the lead
  try {
    await push({ type: 'lead', sid: String(b.sid || '').slice(0, 40), name, email, phone, answers: b.answers || null, ts: Date.now() });
  } catch (_) {}

  try {
    await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } })
    });
  } catch (_) {}

  res.status(200).json({ ok: true });
};
