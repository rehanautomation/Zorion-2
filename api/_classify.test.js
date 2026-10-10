/* ------------------------------------------------------------------
   node api/_classify.test.js

   Plain node, no test framework, no network, nothing sent anywhere.
   The duplicate check runs against an in-memory Set standing in for
   the store, exactly the way api/track.js calls it.
   ------------------------------------------------------------------ */
const assert = require('assert');
const crypto = require('crypto');
const { classify, classifyClick } = require('./_classify');

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  metaCrawler: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  instagramApp: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 345.0.0.32.97 (iPhone14,5; iOS 17_5; en_CA; en-CA; scale=3.00; 1170x2532; 634108168)',
  facebookApp: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/470.0.0.40.98;]'
};
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

/* the store's click set, in memory */
const seen = new Set();
const markClick = async h => { if (seen.has(h)) return false; seen.add(h); return true; };

/* what the browser + Vercel would hand track.js for a given URL */
function visit(ua, country, query) {
  const q = new URLSearchParams(query || '');
  const fbclid = q.get('fbclid') || '';
  return {
    ua, country, region: country === 'CA' ? 'ON' : '',
    a: q.get('a') || '',
    hasFbclid: Boolean(fbclid),
    fbclidHash: fbclid ? sha(fbclid) : ''
  };
}

const results = [];
async function run(name, input, expect) {
  const r = await classifyClick(input, markClick);
  const got = r.verified ? 'VERIFIED' : r.reason;
  results.push({ name, got, expect });
  assert.strictEqual(got, expect, name + ': expected ' + expect + ', got ' + got);
}

(async () => {
  /* (a) no params at all */
  await run('(a) no params', visit(UA.iphoneSafari, 'CA', ''), 'no_click_id');

  /* (b) Meta's crawler, even with a real ad tag */
  await run('(b) facebookexternalhit + a=widow', visit(UA.metaCrawler, 'CA', 'a=widow'), 'bot_ua');

  /* (c) the one real click */
  await run('(c) Instagram app, CA, a=widow&fbclid=x', visit(UA.instagramApp, 'CA', 'a=widow&fbclid=x'), 'VERIFIED');

  /* (d) the same fbclid twice: a reload, or the link opened again.
     Same person as (c), never a second one. */
  await run('(d) same fbclid again (1)', visit(UA.instagramApp, 'CA', 'a=widow&fbclid=x'), 'duplicate');
  await run('(d) same fbclid again (2)', visit(UA.iphoneSafari, 'CA', 'a=widow&fbclid=x'), 'duplicate');

  /* (e) a valid-looking click from a US IP */
  await run('(e) US IP, valid click', visit(UA.instagramApp, 'US', 'a=widow&fbclid=us-click'), 'outside_canada');

  /* ---- the rules underneath ---- */
  /* a bot carrying a click ID must not burn it for the real person */
  assert.strictEqual(seen.has(sha('us-click')), false, 'an unverified visit must not record its click hash');
  const botFirst = await classifyClick(visit(UA.metaCrawler, 'CA', 'a=widow&fbclid=y'), markClick);
  assert.strictEqual(botFirst.reason, 'bot_ua');
  assert.strictEqual(seen.has(sha('y')), false, 'a bot must not record the click hash');

  /* no ad tag: the plain link at the end of the story. A real click,
     counted, and flagged as a story click */
  const story = classify(visit(UA.facebookApp, 'CA', 'fbclid=z'));
  assert.strictEqual(story.verified, true, 'story-link click should count');
  assert.strictEqual(story.story, true, 'story-link click should be flagged');
  assert.strictEqual(classify(visit(UA.facebookApp, 'CA', 'a=widow&fbclid=z2')).story, false);
  assert.strictEqual(classify(visit(UA.iphoneSafari, 'CA', '')).reason, 'no_click_id', 'no Meta click is still filtered');
  assert.strictEqual(classify(visit(UA.facebookApp, 'US', 'fbclid=z3')).reason, 'outside_canada');

  /* every bot name on the list */
  for (const b of ['Facebot', 'meta-externalagent/1.1', 'meta-externalfetcher/1.1', 'Mozilla/5.0 HeadlessChrome/126.0',
                   'Googlebot/2.1', 'AhrefsCrawler', 'some-spider', 'curl/8.4.0', 'python-requests/2.31', 'Wget/1.21']) {
    assert.strictEqual(classify(visit(b, 'CA', 'a=widow&fbclid=q')).reason, 'bot_ua', b + ' should be a bot');
  }
  /* the in-app browser alone counts as a Meta click, even without fbclid */
  assert.strictEqual(classify(visit(UA.facebookApp, 'CA', 'a=widow')).verified, true);
  /* no geo header at all is not Canada */
  assert.strictEqual(classify(visit(UA.instagramApp, '', 'a=widow&fbclid=w')).reason, 'outside_canada');
  /* a junk hash is ignored rather than trusted */
  assert.strictEqual(classify({ ua: UA.instagramApp, country: 'CA', a: 'widow', fbclidHash: 'not-a-hash' }).clickId, false);

  const verified = results.filter(r => r.got === 'VERIFIED').map(r => r.name);
  assert.deepStrictEqual(verified, ['(c) Instagram app, CA, a=widow&fbclid=x'], 'only (c) may be VERIFIED');

  for (const r of results) console.log((r.got === r.expect ? 'pass  ' : 'FAIL  ') + r.name.padEnd(42) + r.got);
  console.log('\nall classifier tests passed — only (c) is VERIFIED');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
