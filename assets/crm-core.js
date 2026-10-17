/* ------------------------------------------------------------------
   CRM rules, shared by the page (window.ZCRM) and api/crm.js, so the
   screen and the server always agree on when the next call is due.

   Everything is Ontario time (America/Toronto).

   The follow-up cadence (Sales/Lead handling §3):
     Day 0  call within 5 minutes, then 30 and 60 minutes later
     Day 1  morning and evening
     Day 2  morning
     Day 7  morning
   Seven calls in all. "No answer" moves a lead to the next one.

   Calls only happen between CALL_START and CALL_END (9 AM to 7 PM), and never during
   the Sabbath (Friday sunset to Saturday sunset). A call that would
   land there moves to the next allowed time.
   ------------------------------------------------------------------ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ZCRM = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TZ = 'America/Toronto';
  var LAT = 43.65, LON = -79.38;          // Toronto
  var CALL_START = 9 * 60;                // 9:00 AM
  var CALL_END = 19 * 60;                 // 7:00 PM (working hours 9 to 7)
  var MORNING = 10 * 60, EVENING = 18 * 60;
  var MIN = 60e3, DAY = 864e5;

  /* The plan: what each call is, by index (0 = first call). */
  var PLAN = [
    { day: 0, gap: 0,  label: 'Right away' },
    { day: 0, gap: 30, label: 'Day 0, 30 min later' },
    { day: 0, gap: 30, label: 'Day 0, 30 min later' },
    { day: 1, at: MORNING, label: 'Day 1 morning' },
    { day: 1, at: EVENING, label: 'Day 1 evening' },
    { day: 2, at: MORNING, label: 'Day 2' },
    { day: 7, at: MORNING, label: 'Day 7, last call' }
  ];
  var TOTAL = PLAN.length;

  var STAGES = [
    { k: 'new', label: 'New' },
    { k: 'calling', label: 'Calling' },
    { k: 'talked', label: 'Talked' },
    { k: 'booked', label: 'Booked' },
    { k: 'done', label: 'Done' }
  ];

  var AD_LABELS = {
    locked: 'Locked', widow: 'Fire sale', competitor: 'Competitor', debt: 'Signature',
    freeze: 'Probate Freeze', nosale: "Can't be sold", confront: 'She sells everything',
    story: 'Story link'
  };

  /* ---------- Toronto wall time ---------- */
  var fmt = null;
  function parts(ts) {
    if (!fmt) fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short'
    });
    var o = {};
    fmt.formatToParts(new Date(ts)).forEach(function (p) { o[p.type] = p.value; });
    var dows = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, dow: dows[o.weekday] };
  }
  /* ms timestamp of a Toronto wall-clock time */
  function at(y, m, d, minutes) {
    var guess = Date.UTC(y, m - 1, d, 0, minutes) + 5 * 3600e3;
    for (var i = 0; i < 2; i++) {
      var p = parts(guess);
      var wall = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
      var want = Date.UTC(y, m - 1, d, 0, minutes);
      guess += want - wall;
    }
    return guess;
  }
  function ymd(ts) { var p = parts(ts); return p.y + '-' + pad(p.m) + '-' + pad(p.d); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayStart(ts) { var p = parts(ts); return at(p.y, p.m, p.d, 0); }
  /* the calendar date n days after ts, as {y,m,d} (noon avoids DST edges) */
  function dateAfter(ts, n) { var p = parts(dayStart(ts) + 12 * 3600e3 + n * DAY); return { y: p.y, m: p.m, d: p.d }; }

  /* ---------- sunset (NOAA sunrise equation) ---------- */
  var RAD = Math.PI / 180;
  function sunset(y, m, d) {
    var jd = Date.UTC(y, m - 1, d, 12) / DAY + 2440587.5;
    var n = Math.round(jd - 2451545.0 + 0.0008);
    var js = n - LON / 360;
    var M = (357.5291 + 0.98560028 * js) % 360;
    var C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD);
    var L = (M + C + 180 + 102.9372) % 360;
    var jt = 2451545.0 + js + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * L * RAD);
    var dec = Math.asin(Math.sin(L * RAD) * Math.sin(23.4397 * RAD));
    var cosw = (Math.sin(-0.833 * RAD) - Math.sin(LAT * RAD) * Math.sin(dec)) / (Math.cos(LAT * RAD) * Math.cos(dec));
    var w = Math.acos(Math.max(-1, Math.min(1, cosw))) / RAD;
    return Math.round((jt + w / 360 - 2440587.5) * DAY);
  }

  /* If ts is inside a Sabbath, {start, end}; otherwise null. */
  function sabbath(ts) {
    var p = parts(ts);
    var fri = p.dow === 5 ? dateAfter(ts, 0) : p.dow === 6 ? dateAfter(ts, -1) : null;
    if (!fri) return null;
    var sat = dateAfter(at(fri.y, fri.m, fri.d, 720), 1);
    var start = sunset(fri.y, fri.m, fri.d), end = sunset(sat.y, sat.m, sat.d);
    return ts >= start && ts < end ? { start: start, end: end } : null;
  }

  /* The next moment Alicia can call, at or after ts. */
  function allowed(ts) {
    for (var guard = 0; guard < 6; guard++) {
      var p = parts(ts), mins = p.h * 60 + p.mi;
      if (mins < CALL_START) { ts = at(p.y, p.m, p.d, CALL_START); continue; }
      if (mins > CALL_END) { var n = dateAfter(ts, 1); ts = at(n.y, n.m, n.d, CALL_START); continue; }
      var s = sabbath(ts);
      if (s) { ts = s.end + 15 * MIN; continue; }
      return ts;
    }
    return ts;
  }

  /* When call number k (0-based) is due. leadTs: when he filled the
     form. lastCall: when the previous call was made (if any). */
  function dueAt(k, leadTs, lastCall) {
    if (k >= TOTAL) return null;
    var step = PLAN[k], t;
    if (step.day === 0) t = (k === 0 ? leadTs : (lastCall || leadTs)) + step.gap * MIN;
    else { var dd = dateAfter(leadTs, step.day); t = at(dd.y, dd.m, dd.d, step.at); }
    if (lastCall && t < lastCall + 30 * MIN) t = lastCall + 30 * MIN;
    return allowed(t);
  }

  /* ---------- labels ---------- */
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function time12(ts) {
    var p = parts(ts), h = p.h % 12 || 12;
    return h + ':' + pad(p.mi) + ' ' + (p.h < 12 ? 'AM' : 'PM');
  }
  /* "Today 6:40 PM", "Tomorrow 10:00 AM", "Wed 10:00 AM", "Oct 28, 10:00 AM" */
  function when(ts, now) {
    var a = dayStart(ts), b = dayStart(now), diff = Math.round((a - b) / DAY);
    var p = parts(ts);
    if (diff === 0) return 'Today ' + time12(ts);
    if (diff === 1) return 'Tomorrow ' + time12(ts);
    if (diff === -1) return 'Yesterday ' + time12(ts);
    if (diff > 1 && diff < 7) return DOW[p.dow] + ' ' + time12(ts);
    return MON[p.m - 1] + ' ' + p.d + ', ' + time12(ts);
  }
  function ago(ts, now) {
    var s = Math.max(0, (now - ts) / 1000);
    if (s < 60) return 'now';
    if (s < 3600) return Math.floor(s / 60) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h';
    return Math.floor(s / 86400) + 'd';
  }

  /* ---------- lead state ----------
     A lead's saved state: { stage, result, calls: [{ts, o}], next,
     notes, hist }. `next` is only stored for a follow-up or a booked
     call; cadence calls are worked out from the call log. */

  function noAnswers(st) {
    return (st && st.calls || []).filter(function (c) { return c.o === 'no_answer'; }).length;
  }
  function lastCallTs(st) {
    var c = (st && st.calls || []).filter(function (c) { return c.o === 'no_answer' || c.o === 'talked' || c.o === 'booked'; });
    return c.length ? c[c.length - 1].ts : null;
  }
  /* Tomorrow at 10:00 AM (or the next time calls are allowed). */
  function tomorrowMorning(now) { var d = dateAfter(now, 1); return allowed(at(d.y, d.m, d.d, MORNING)); }

  /* What the screen shows for a lead.
     lead: {ts}; st: saved state or null; booking: {at} or null. */
  function derive(lead, st, booking, now) {
    st = st || {};
    var stage = st.stage || 'new', next = null, kind = null;
    if (booking && (stage === 'new' || stage === 'calling')) { stage = 'booked'; st = Object.assign({}, st, { next: booking.at }); }
    if (stage === 'new' || stage === 'calling') {
      var k = noAnswers(st);
      next = dueAt(k, lead.ts, lastCallTs(st));
      kind = next ? 'cadence' : 'finished';
      if (k > 0 && stage === 'new') stage = 'calling';
    } else if (stage === 'talked') { next = st.next || null; kind = 'followup'; }
    else if (stage === 'booked') { next = st.next || (booking && booking.at) || null; kind = 'booked'; }
    return {
      stage: stage,
      result: stage === 'done' ? (st.result || 'lost') : null,
      next: next, kind: kind,
      noAnswers: noAnswers(st),
      calls: st.calls || [],
      notes: st.notes || '',
      overdue: Boolean(next && next < now - 5 * MIN),
      due: Boolean(next && next <= now + 15 * MIN)
    };
  }

  var ACTIONS = ['no_answer', 'talked', 'booked', 'won', 'lost', 'stage', 'note', 'undo', 'reopen'];
  var STAGE_KEYS = STAGES.map(function (s) { return s.k; });

  /* Apply one action to a saved state; returns the new state. The
     page runs it first so the screen changes at once, then the server
     runs the same code and saves. */
  function apply(st, a, now) {
    st = JSON.parse(JSON.stringify(st || {}));
    st.calls = st.calls || [];
    st.hist = st.hist || [];
    if (a.action === 'note') { st.notes = String(a.text || '').slice(0, 4000); return st; }
    if (a.action === 'undo') {
      var prev = st.hist.pop();
      if (!prev) return st;
      prev.hist = st.hist; prev.notes = st.notes;
      return prev;
    }
    var snap = JSON.parse(JSON.stringify(st)); delete snap.hist; delete snap.notes;
    st.hist.push(snap);
    if (st.hist.length > 12) st.hist.shift();
    var stage = st.stage || 'new';

    switch (a.action) {
      case 'no_answer':
        st.calls.push({ ts: now, o: 'no_answer' });
        if (stage === 'talked' || stage === 'booked') { st.stage = 'talked'; st.next = tomorrowMorning(now); }
        else st.stage = 'calling';
        break;
      case 'talked':
        st.calls.push({ ts: now, o: 'talked' });
        st.stage = 'talked'; st.next = a.at || tomorrowMorning(now);
        break;
      case 'booked':
        st.calls.push({ ts: now, o: 'booked', at: a.at || null });
        st.stage = 'booked'; st.next = a.at || tomorrowMorning(now);
        break;
      case 'won': st.calls.push({ ts: now, o: 'won' }); st.stage = 'done'; st.result = 'won'; st.next = null; break;
      case 'lost': st.calls.push({ ts: now, o: 'lost' }); st.stage = 'done'; st.result = 'lost'; st.next = null; break;
      case 'reopen': st.stage = noAnswers(st) ? 'calling' : 'new'; st.result = null; st.next = null; break;
      case 'stage':
        if (STAGE_KEYS.indexOf(a.stage) === -1) break;
        st.stage = a.stage;
        if (a.stage === 'done') st.result = a.result === 'won' ? 'won' : 'lost';
        if (a.stage === 'talked' || a.stage === 'booked') st.next = a.at || st.next || tomorrowMorning(now);
        if (a.stage === 'new' || a.stage === 'calling') st.next = null;
        break;
    }
    st.updated = now;
    return st;
  }

  return {
    CALL_START: CALL_START, CALL_END: CALL_END,
    TZ: TZ, PLAN: PLAN, TOTAL: TOTAL, STAGES: STAGES, AD_LABELS: AD_LABELS, ACTIONS: ACTIONS,
    derive: derive, apply: apply, noAnswers: noAnswers, tomorrowMorning: tomorrowMorning, TOTAL: TOTAL, STAGES: STAGES, AD_LABELS: AD_LABELS,
    parts: parts, at: at, ymd: ymd, dayStart: dayStart, dateAfter: dateAfter,
    sunset: sunset, sabbath: sabbath, allowed: allowed, dueAt: dueAt,
    time12: time12, when: when, ago: ago, DOW: DOW, MON: MON, pad: pad
  };
});
