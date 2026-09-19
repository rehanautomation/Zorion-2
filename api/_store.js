/* ------------------------------------------------------------------
   Tiny append-only event store.

   If KV_REST_API_URL + KV_REST_API_TOKEN are set (Vercel KV / Upstash
   Redis — free tier is plenty), events persist forever.
   If not, it falls back to a JSON file so everything still WORKS with
   zero config — on Vercel that file lives in /tmp and resets when the
   function goes cold, on a normal Node host it persists like any file.
   Moving hosts never breaks the page: worst case you lose stats, the
   funnel and the Discord leads keep working.
   ------------------------------------------------------------------ */
const fs = require('fs');
const path = require('path');

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = 'zorion_events';
const MAX = 20000;

const FILE = process.env.ZORION_DATA_FILE
  || path.join(process.env.VERCEL ? '/tmp' : process.cwd(), 'zorion-events.json');

async function kv(command) {
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  if (!res.ok) throw new Error('kv ' + res.status);
  return res.json();
}

async function push(event) {
  const row = JSON.stringify(event);
  if (KV_URL && KV_TOKEN) {
    await kv(['LPUSH', KEY, row]);
    kv(['LTRIM', KEY, 0, MAX - 1]).catch(() => {});
    return;
  }
  let list = [];
  try { list = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) {}
  list.unshift(event);
  if (list.length > MAX) list.length = MAX;
  fs.writeFileSync(FILE, JSON.stringify(list));
}

/* Wipe every stored event. Used by /api/reset. */
async function clear() {
  if (KV_URL && KV_TOKEN) {
    await kv(['DEL', KEY]);
    return;
  }
  try { fs.writeFileSync(FILE, '[]'); } catch (_) {}
}

/* ---- keeping our own traffic out of the numbers ----
   Two independent guards, because either one alone leaks:
   a home IP rotates, and a browser flag dies with site data.

   ADMIN_IPS is a comma-separated list set in Vercel. Vercel puts the
   real client IP first in x-forwarded-for; everything after it is
   proxy hops, so only the first entry is ever trusted. */
function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (!xf) return '';
  return String(xf).split(',')[0].trim();
}

function isAdmin(req, body) {
  if (body && body.nolog) return true;               // browser flag
  const list = String(process.env.ADMIN_IPS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  if (!list.length) return false;
  const ip = clientIp(req);
  return Boolean(ip) && list.indexOf(ip) !== -1;
}

async function all() {
  if (KV_URL && KV_TOKEN) {
    const out = await kv(['LRANGE', KEY, 0, MAX - 1]);
    return (out.result || []).map(r => { try { return JSON.parse(r); } catch (_) { return null; } }).filter(Boolean);
  }
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) { return []; }
}

function readBody(req) {
  return new Promise(resolve => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch (_) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

module.exports = {
  push, all, clear, readBody, isAdmin, clientIp,
  persistent: Boolean(KV_URL && KV_TOKEN)
};
