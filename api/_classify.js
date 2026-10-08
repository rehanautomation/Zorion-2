/* ------------------------------------------------------------------
   Is this page view a real person who clicked one of our Meta ads?

   Pure: no I/O, no clock, no globals. Everything it needs comes in as
   arguments, so the same input always gives the same answer and it
   can be tested with plain node (api/_classify.test.js).

   VERIFIED needs all four:
     1. a Meta click   — an fbclid on the URL, or the Facebook /
                         Instagram in-app browser
     2. an ad tag      — a= on the URL (every ad carries one)
     3. Canada         — Vercel's geo header says CA
     4. not a bot      — user agent isn't a crawler or a script
   and the click must not have been counted already (a reload, or the
   same link reopened, is the same person, not a new one).

   Otherwise UNVERIFIED with the first reason that applies, in this
   order: bot_ua, no_click_id, no_ad_tag, outside_canada, duplicate.
   ------------------------------------------------------------------ */

/* Meta's own fetchers (ad review, link previews, the crawler that
   renders the landing page), headless browsers, and generic scripts. */
const BOT_RE = /facebookexternalhit|facebot|meta-externalagent|meta-externalfetcher|headlesschrome|bot|crawler|spider|curl|python|wget/i;

/* The Facebook and Instagram in-app browsers. */
const IN_APP_RE = /FBAN|FBAV|FB_IAB|Instagram/;

const HASH_RE = /^[0-9a-f]{64}$/;

const REASONS = ['bot_ua', 'no_click_id', 'no_ad_tag', 'outside_canada', 'duplicate'];

function isBot(ua) { return BOT_RE.test(String(ua || '')); }
function isInApp(ua) { return IN_APP_RE.test(String(ua || '')); }

/* A SHA-256 hex digest, or '' — anything else is thrown away. */
function cleanHash(h) {
  h = String(h || '').toLowerCase();
  return HASH_RE.test(h) ? h : '';
}

/**
 * @param {object} v
 *   ua         user-agent header
 *   country    x-vercel-ip-country header
 *   region     x-vercel-ip-country-region header
 *   a          the a= ad tag from the URL
 *   hasFbclid  the browser saw an fbclid on the URL
 *   fbclidHash SHA-256 hex of that fbclid (the raw value is never sent)
 *   seen       true when this fbclid hash was already counted
 * @returns {{verified:boolean, reason:string|null, bot:boolean,
 *            inApp:boolean, clickId:boolean, country:string, region:string}}
 */
function classify(v) {
  v = v || {};
  const ua = String(v.ua || '');
  const country = String(v.country || '').trim().toUpperCase();
  const region = String(v.region || '').trim().toUpperCase();
  const a = String(v.a || '').trim();
  const hash = cleanHash(v.fbclidHash);

  const bot = isBot(ua);
  const inApp = isInApp(ua);
  const clickId = Boolean(v.hasFbclid) || Boolean(hash);

  let reason = null;
  if (bot) reason = 'bot_ua';
  else if (!clickId && !inApp) reason = 'no_click_id';
  else if (!a) reason = 'no_ad_tag';
  else if (country !== 'CA') reason = 'outside_canada';
  else if (hash && v.seen) reason = 'duplicate';

  return { verified: reason === null, reason, bot, inApp, clickId, country, region };
}

/* The duplicate check needs to know whether a click hash was counted
   before, which means storage. The storage call is passed in, so this
   stays testable: track.js hands it the real store, the tests hand it
   a Set. Only a visit that would otherwise be VERIFIED records its
   hash — a crawler carrying a click ID must not be able to burn it
   before the real person arrives.

   markClick(hash) resolves true when the hash is new, false when it
   was already there. */
async function classifyClick(v, markClick) {
  const first = classify(Object.assign({}, v, { seen: false }));
  const hash = cleanHash(v && v.fbclidHash);
  if (!first.verified || !hash || !markClick) return first;
  let fresh = true;
  try { fresh = await markClick(hash); } catch (_) { /* storage down: count it */ }
  return fresh ? first : classify(Object.assign({}, v, { seen: true }));
}

module.exports = { classify, classifyClick, isBot, isInApp, cleanHash, REASONS };
