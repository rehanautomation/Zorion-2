/* ------------------------------------------------------------------
   Reports the IP this server actually sees for you, and whether that
   IP is currently being excluded from the report.

   Open /api/whoami on a device and copy what it says into ADMIN_IPS —
   that removes the guesswork of "what is my IP" sites, which show the
   address their own server saw, not the one Vercel sees.

   Returns nothing secret: your own IP, which you already sent, plus a
   yes/no. It never lists ADMIN_IPS back.
   ------------------------------------------------------------------ */
const { clientIp, isAdmin, adminIps } = require('./_store');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  const ip = clientIp(req);
  const excluded = isAdmin(req, null);

  res.status(200).json({
    yourIp: ip || '(none seen — running without a proxy?)',
    excludedFromReport: excluded,
    adminIpsConfigured: adminIps().length,
    hint: excluded
      ? 'This IP is already excluded.'
      : 'Add this exact value to ADMIN_IPS in Vercel, then redeploy. For IPv6 you can end it with * to cover a rotating tail.'
  });
};
