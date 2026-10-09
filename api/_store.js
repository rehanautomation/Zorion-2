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
/* Only the temporary file fallback is capped. The KV list is never
   trimmed: old data is kept for good. */
const MAX = 20000;
const PAGE = 5000;

/* v2 tracking keeps two small side tables next to the event list:
   CLICKS  every fbclid hash already counted (a set), so a reload or a
           reopened link isn't a new person
   DWELL   one entry per session holding its latest visible time. The
           browser reports it every 5 seconds; overwriting one entry
           instead of appending an event keeps the list from filling
           with heartbeats. */
const CLICKS = 'zorion_clicks_v2';
const DWELL = 'zorion_dwell_v2';
/* Booked calls: one entry per slot ('2026-10-09T14:30', Toronto time).
   Written with HSETNX, so two people can never hold the same slot. */
const BOOKINGS = 'zorion_bookings_v1';

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

/* An entry matches either exactly, or as a prefix when it ends in "*".
   Residential IPv6 usually keeps a stable /64 while the tail rotates,
   so "2001:db8:1:2:*" survives what an exact address will not.
   Compared lowercased, because IPv6 hex case is not significant. */
function ipMatches(ip, entry) {
  if (!ip || !entry) return false;
  ip = ip.toLowerCase(); entry = entry.toLowerCase();
  if (entry.slice(-1) === '*') return ip.indexOf(entry.slice(0, -1)) === 0;
  return ip === entry;
}

function adminIps() {
  return String(process.env.ADMIN_IPS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
}

function isAdmin(req, body) {
  if (body && body.nolog) return true;               // browser flag
  const ip = clientIp(req);
  return adminIps().some(entry => ipMatches(ip, entry));
}

/* Read in pages, so a long history never has to fit in one reply. */
async function all() {
  if (KV_URL && KV_TOKEN) {
    const rows = [];
    for (let start = 0; ; start += PAGE) {
      const out = await kv(['LRANGE', KEY, start, start + PAGE - 1]);
      const page = out.result || [];
      for (const r of page) { try { rows.push(JSON.parse(r)); } catch (_) {} }
      if (page.length < PAGE) break;
    }
    return rows;
  }
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) { return []; }
}

/* ---- file fallback for the side tables ---- */
function sideFile(name) { return FILE.replace(/\.json$/, '') + '-' + name + '.json'; }
function readSide(name) { try { return JSON.parse(fs.readFileSync(sideFile(name), 'utf8')); } catch (_) { return {}; } }
function writeSide(name, obj) { try { fs.writeFileSync(sideFile(name), JSON.stringify(obj)); } catch (_) {} }

/* true if the click hash is new, false if it was already counted */
async function markClick(hash) {
  if (KV_URL && KV_TOKEN) {
    const out = await kv(['SADD', CLICKS, hash]);
    return Number(out.result) === 1;
  }
  const seen = readSide('clicks');
  if (seen[hash]) return false;
  seen[hash] = 1; writeSide('clicks', seen);
  return true;
}

/* one overwrite per heartbeat; values are cumulative, so the latest
   one is the whole story */
async function setDwell(sid, value) {
  const row = JSON.stringify(value);
  if (KV_URL && KV_TOKEN) {
    await kv(['HSET', DWELL, sid, row]);
    return;
  }
  const d = readSide('dwell'); d[sid] = value; writeSide('dwell', d);
}

/* true if the slot was free and is now held by this booking, false if
   someone already has it */
async function reserveSlot(slotKey, booking) {
  const row = JSON.stringify(booking);
  if (KV_URL && KV_TOKEN) {
    const out = await kv(['HSETNX', BOOKINGS, slotKey, row]);
    return Number(out.result) === 1;
  }
  const b = readSide('bookings');
  if (b[slotKey]) return false;
  b[slotKey] = booking; writeSide('bookings', b);
  return true;
}

/* every booking, oldest slot first */
async function allBookings() {
  let map = {};
  if (KV_URL && KV_TOKEN) {
    const out = await kv(['HGETALL', BOOKINGS]);
    const r = out.result || [];
    if (Array.isArray(r)) {
      for (let i = 0; i + 1 < r.length; i += 2) { try { map[r[i]] = JSON.parse(r[i + 1]); } catch (_) {} }
    } else if (r && typeof r === 'object') {
      for (const k of Object.keys(r)) { try { map[k] = typeof r[k] === 'string' ? JSON.parse(r[k]) : r[k]; } catch (_) {} }
    }
  } else {
    map = readSide('bookings');
  }
  return Object.keys(map).sort().map(k => Object.assign({ slot: k }, map[k]));
}

/* { sid: {s, l, t} } */
async function allDwell() {
  if (KV_URL && KV_TOKEN) {
    const out = await kv(['HGETALL', DWELL]);
    const r = out.result || [];
    const map = {};
    if (Array.isArray(r)) {
      for (let i = 0; i + 1 < r.length; i += 2) { try { map[r[i]] = JSON.parse(r[i + 1]); } catch (_) {} }
    } else if (r && typeof r === 'object') {
      for (const k of Object.keys(r)) { try { map[k] = typeof r[k] === 'string' ? JSON.parse(r[k]) : r[k]; } catch (_) {} }
    }
    return map;
  }
  return readSide('dwell');
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
  push, all, clear, readBody, isAdmin, clientIp, adminIps,
  markClick, setDwell, allDwell, reserveSlot, allBookings,
  persistent: Boolean(KV_URL && KV_TOKEN)
};
