/* ------------------------------------------------------------------
   The call schedule. One file, used twice:
     - the browser calendar on the results page (window.ZSchedule)
     - api/book.js, which checks every booking against the same rules

   Everything is Ontario time (America/Toronto), whatever the
   visitor's own timezone.

   Hours: 15-minute calls, starting every 30 minutes, 10:00 AM to
   6:30 PM. Closed from Friday 5:00 PM to Sunday 10:00 AM, so Friday's
   last start is 4:30 PM, Saturday has nothing, and Sunday opens at 10.

   Busy slots: a real calendar is never empty. Each date gets one of
   14 fixed day-patterns of taken times (30 to 50% of the day), picked
   by the number of days since EPOCH, so the same date looks the same
   on every device and after every reload. Taken slots are not shown.
   ------------------------------------------------------------------ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ZSchedule = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TZ = 'America/Toronto';
  var DAYS_AHEAD = 14;               // today plus the next 13 days
  var MIN_NOTICE_MS = 2 * 3600e3;    // nothing less than 2 hours away
  var STEP_MIN = 30;

  /* First and last start time per weekday (0 = Sunday), in minutes
     after midnight. null = closed. */
  var HOURS = {
    0: [600, 1110],   // Sun 10:00 AM - 6:30 PM
    1: [600, 1110],
    2: [600, 1110],
    3: [600, 1110],
    4: [600, 1110],
    5: [600, 990],    // Fri 10:00 AM - 4:30 PM, closed from 5
    6: null           // Sat closed
  };

  var EPOCH = '2026-01-01';

  /* 14 day-patterns of taken start times. Each keeps 30-50% of a full
     day taken, and of a Friday too. Back-to-backs, a lunch block, a
     quiet afternoon: the shape of a real person's day. */
  var PATTERNS = [
    ['10:00', '10:30', '12:00', '12:30', '14:30', '15:00', '17:30'],
    ['11:00', '12:30', '13:00', '15:30', '16:00', '18:00'],
    ['10:30', '11:00', '11:30', '13:30', '14:00', '16:30', '17:00', '17:30'],
    ['10:00', '12:00', '13:00', '13:30', '15:00', '16:00', '18:30'],
    ['10:30', '11:30', '12:00', '12:30', '14:00', '15:30', '16:00', '17:00', '18:00'],
    ['11:00', '11:30', '13:00', '14:30', '16:30', '17:30'],
    ['10:00', '10:30', '11:00', '12:30', '14:00', '14:30', '17:00', '18:00'],
    ['11:30', '12:00', '13:30', '15:00', '15:30', '16:30', '18:30'],
    ['10:00', '11:00', '12:00', '12:30', '13:00', '15:00', '17:30'],
    ['10:30', '13:00', '13:30', '14:00', '16:00', '17:00', '17:30', '18:30'],
    ['10:00', '10:30', '11:30', '12:30', '14:30', '15:00', '15:30', '18:00'],
    ['11:00', '12:00', '14:00', '16:00', '16:30', '17:30'],
    ['10:30', '11:00', '12:30', '13:00', '15:30', '16:30', '17:00', '18:00', '18:30'],
    ['10:00', '11:30', '12:00', '13:30', '14:30', '17:00', '17:30']
  ];

  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  var pad = function (n) { return (n < 10 ? '0' : '') + n; };

  /* ---- calendar dates, as 'YYYY-MM-DD', with no timezone involved ---- */
  function ymdParts(ymd) { var p = ymd.split('-'); return [+p[0], +p[1], +p[2]]; }
  function ymdUTC(ymd) { var p = ymdParts(ymd); return Date.UTC(p[0], p[1] - 1, p[2]); }
  function addDays(ymd, n) {
    var d = new Date(ymdUTC(ymd) + n * 864e5);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function weekday(ymd) { return new Date(ymdUTC(ymd)).getUTCDay(); }
  function dayNumber(ymd) { return Math.round((ymdUTC(ymd) - ymdUTC(EPOCH)) / 864e5); }

  /* ---- Toronto wall time ---- */
  var fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
  function wall(ms) {
    var o = {};
    fmt.formatToParts(new Date(ms)).forEach(function (x) { o[x.type] = x.value; });
    var h = +o.hour % 24;
    return { ymd: o.year + '-' + o.month + '-' + o.day, hm: pad(h) + ':' + o.minute, y: +o.year, mo: +o.month, d: +o.day, h: h, mi: +o.minute };
  }
  /* minutes Toronto is ahead of UTC at that instant (-240 in summer) */
  function offsetMin(ms) {
    var w = wall(ms);
    return Math.round((Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi) - Math.floor(ms / 6e4) * 6e4) / 6e4);
  }
  /* the instant a Toronto date and time happens */
  function instant(ymd, hm) {
    var p = ymdParts(ymd), t = hm.split(':');
    var guess = Date.UTC(p[0], p[1] - 1, p[2], +t[0], +t[1]);
    var ms = guess - offsetMin(guess) * 6e4;
    var again = guess - offsetMin(ms) * 6e4;     // across a DST change
    return again;
  }
  /* '2026-10-09T14:30:00-04:00' */
  function iso(ymd, hm) {
    var off = offsetMin(instant(ymd, hm)), s = off < 0 ? '-' : '+', a = Math.abs(off);
    return ymd + 'T' + hm + ':00' + s + pad(Math.floor(a / 60)) + ':' + pad(a % 60);
  }
  function key(ymd, hm) { return ymd + 'T' + hm; }

  /* ---- the schedule ---- */
  function openTimes(ymd) {
    var h = HOURS[weekday(ymd)], out = [];
    if (!h) return out;
    for (var m = h[0]; m <= h[1]; m += STEP_MIN) out.push(pad(Math.floor(m / 60)) + ':' + pad(m % 60));
    return out;
  }
  function patternFor(ymd) {
    var n = dayNumber(ymd), i = ((n % PATTERNS.length) + PATTERNS.length) % PATTERNS.length;
    return PATTERNS[i];
  }
  function busy(ymd) {
    var p = patternFor(ymd), open = openTimes(ymd);
    return open.filter(function (t) { return p.indexOf(t) !== -1; });
  }
  function today(now) { return wall(now).ymd; }
  function days(now) {
    var first = today(now), out = [];
    for (var i = 0; i < DAYS_AHEAD; i++) out.push(addDays(first, i));
    return out;
  }

  /* Bookable times for one day: open, not in the day's pattern, not
     really booked (`taken` holds keys like '2026-10-09T14:30'), and at
     least 2 hours from now. */
  function slots(ymd, now, taken) {
    var b = busy(ymd), limit = now + MIN_NOTICE_MS;
    return openTimes(ymd).filter(function (hm) {
      if (b.indexOf(hm) !== -1) return false;
      if (taken && taken[key(ymd, hm)]) return false;
      return instant(ymd, hm) >= limit;
    }).map(function (hm) {
      return { ymd: ymd, hm: hm, key: key(ymd, hm), iso: iso(ymd, hm), ms: instant(ymd, hm) };
    });
  }

  /* The server's check of a requested slot. */
  function check(slotIso, now, taken) {
    var ms = Date.parse(String(slotIso || ''));
    if (isNaN(ms)) return { ok: false, reason: 'invalid' };
    var w = wall(ms);
    var res = { ymd: w.ymd, hm: w.hm, key: key(w.ymd, w.hm), ms: ms, iso: iso(w.ymd, w.hm) };
    if (instant(w.ymd, w.hm) !== ms || openTimes(w.ymd).indexOf(w.hm) === -1) return Object.assign(res, { ok: false, reason: 'closed' });
    if (ms <= now) return Object.assign(res, { ok: false, reason: 'past' });
    if (days(now).indexOf(w.ymd) === -1) return Object.assign(res, { ok: false, reason: 'too_far' });
    if (busy(w.ymd).indexOf(w.hm) !== -1 || (taken && taken[res.key])) return Object.assign(res, { ok: false, reason: 'taken' });
    return Object.assign(res, { ok: true });
  }

  /* ---- labels ---- */
  function time12(hm) {
    var t = hm.split(':'), h = +t[0];
    return ((h + 11) % 12 + 1) + ':' + t[1] + ' ' + (h < 12 ? 'AM' : 'PM');
  }
  function dayShort(ymd) { var p = ymdParts(ymd); return DOW[weekday(ymd)] + ', ' + MON[p[1] - 1] + ' ' + p[2]; }   // Thu, Oct 9
  function dayLong(ymd) { var p = ymdParts(ymd); return DOW_LONG[weekday(ymd)] + ', ' + MON_LONG[p[1] - 1] + ' ' + p[2]; } // Thursday, October 9

  return {
    TZ: TZ, DAYS_AHEAD: DAYS_AHEAD, MIN_NOTICE_MS: MIN_NOTICE_MS, HOURS: HOURS, PATTERNS: PATTERNS, EPOCH: EPOCH,
    addDays: addDays, weekday: weekday, wall: wall, instant: instant, iso: iso, key: key,
    openTimes: openTimes, busy: busy, today: today, days: days, slots: slots, check: check,
    time12: time12, dayShort: dayShort, dayLong: dayLong
  };
});
