/* ------------------------------------------------------------------
   CRM rules, shared by the page (window.ZCRM) and api/crm.js, so the
   screen and the server always agree on when the next call is due.

   Everything is Ontario time (America/Toronto).

   Three call windows (Oct 26, Rehan): Morning 9–11, Lunch 12–2,
   Evening 5–7.

   The call plan. "No answer" moves the lead to the next call:
     Call 1     right when he opts in
     Calls 2–4  the next window: morning or lunch → that evening,
                evening → next morning (at least 2 hours after the last call)
     Calls 5–8  Day 3 lunch · Day 5 evening · Day 7 morning · Day 10 lunch
                (Day 1 = the day of the first call)
   That's 4 calls in the first 48 hours and 8 calls in total.

   Nags. A call stays open until she taps an outcome; until then:
     new lead     3 pings, 15 min apart, from 10 min after he opts in
                  (opted in at night: 9:00, 9:15, 9:30)
     other call   3 pings, 30 min apart, when it's due
     still open   3 pings, 30 min apart, in every window after that
   Nothing waits on her. The only quiet times are outside
   CALL_START..CALL_END (9 AM to 7 PM) and the Sabbath (Friday sunset
   to Saturday sunset); a ping that lands there is skipped.
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
  var MORNING = 10 * 60;                  // default follow-up time
  var MIN = 60e3, DAY = 864e5;

  /* The call windows, in the order they come in a day. */
  var WINDOWS = [
    { k: 'morning', s: 9 * 60, e: 11 * 60, label: 'Morning' },
    { k: 'lunch', s: 12 * 60, e: 14 * 60, label: 'Lunch' },
    { k: 'evening', s: 17 * 60, e: 19 * 60, label: 'Evening' }
  ];
  var WIN = {}; WINDOWS.forEach(function (w) { WIN[w.k] = w; });

  /* The plan: what each call is, by index (0 = first call). */
  var PLAN = [
    { now: true, label: 'Day 1 · right away' },
    { next: true },
    { next: true },
    { next: true },
    { day: 2, w: 'lunch' },
    { day: 4, w: 'evening' },
    { day: 6, w: 'morning' },
    { day: 9, w: 'lunch', label: 'Day 10 · last call' }
  ];
  var RESTART = PLAN;                     // a restarted lead runs the same plan
  var TOTAL = PLAN.length;
  var NEW_GAP = 15, NAG_GAP = 30, NAGS = 3, MIN_GAP = 120;

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

  /* ---------- windows ---------- */
  function winAt(d, k) { return at(d.y, d.m, d.d, WIN[k].s); }
  /* which window a moment belongs to: before noon = morning, before
     5 PM = lunch, later = evening; before 9 AM = 'night' */
  function slotOf(ts) {
    var p = parts(ts), m = p.h * 60 + p.mi;
    return m < CALL_START ? 'night' : m < 12 * 60 ? 'morning' : m < 17 * 60 ? 'lunch' : 'evening';
  }
  /* Every window start at or after t, in order (morning, lunch, evening, next day…). */
  function eachWindow(t, fn) {
    for (var i = 0; i < 400; i++) {
      var d = dateAfter(t, i);
      for (var j = 0; j < WINDOWS.length; j++) {
        var w = winAt(d, WINDOWS[j].k);
        if (w >= t && fn(w, WINDOWS[j]) === false) return;
      }
    }
  }
  /* The window a call goes to after a no answer at t: morning or lunch →
     that evening, evening → next morning. It must be at least MIN_GAP
     after t and outside the Sabbath, else the one after that. */
  function nextWindow(t) {
    var s = slotOf(t), d = dateAfter(t, 0), w;
    if (s === 'night') w = winAt(d, 'morning');
    else if (s === 'evening') w = winAt(dateAfter(t, 1), 'morning');
    else w = winAt(d, 'evening');
    for (var i = 0; i < 30; i++) {
      if (w >= t + MIN_GAP * MIN && allowed(w) === w) return w;
      w = slotOf(w) === 'evening' ? winAt(dateAfter(w, 1), 'morning') : winAt(dateAfter(w, 0), 'evening');
    }
    return allowed(w);
  }
  /* The first allowed window start at or after t. */
  function firstOpenWindow(t) {
    var out = null;
    eachWindow(t, function (w) { if (allowed(w) === w) { out = w; return false; } });
    return out || allowed(t);
  }

  /* When call number k (0-based) is due. startTs: when he filled the
     form (or the restart time). lastCall: when the last call was logged. */
  function dueAt(k, startTs, lastCall, plan) {
    plan = plan || PLAN;
    if (k >= plan.length) return null;
    var step = plan[k];
    if (step.now) return allowed(startTs);
    var base = lastCall || allowed(startTs);
    if (step.next) return nextWindow(base);
    var dd = dateAfter(allowed(startTs), step.day);      // day 1 = the day of the first call
    var t = winAt(dd, step.w);
    if (t < base + MIN_GAP * MIN) return nextWindow(base); // running late: next window instead
    return firstOpenWindow(t);
  }

  /* The pings for one open call, between from and to (ms).
     due: when the call is due. fresh: a brand-new lead (first call).
     leadTs: when he opted in. Returns [{t, n}] (n = ping number within its burst, 1..3). */
  function nagTimes(due, fresh, leadTs, from, to) {
    var out = [], s, gap;
    if (fresh) {
      gap = NEW_GAP;
      s = allowed(leadTs) === leadTs ? leadTs + 10 * MIN : allowed(leadTs);
    } else { gap = NAG_GAP; s = due; }
    var burst = function (b, g) {
      for (var i = 0; i < NAGS; i++) {
        var t = b + i * g * MIN;
        if (t >= from && t <= to && allowed(t) === t) out.push({ t: t, n: i + 1, first: b === s });
      }
    };
    burst(s, gap);
    var last = s + (NAGS - 1) * gap * MIN;
    var startAt = Math.max(last + 1, from - (NAGS - 1) * NAG_GAP * MIN);
    eachWindow(startAt, function (w) {
      if (w > to) return false;
      burst(w, NAG_GAP);
    });
    return out;
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
    var from = (st && st.restartAt) || 0;
    return (st && st.calls || []).filter(function (c) { return c.o === 'no_answer' && c.ts >= from; }).length;
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
      var k = noAnswers(st), plan = st.restartAt ? RESTART : PLAN;
      var lc = lastCallTs(st); if (st.restartAt && lc && lc < st.restartAt) lc = null;
      next = dueAt(k, st.restartAt || lead.ts, lc, plan);
      kind = next ? 'cadence' : 'finished';
      var step = plan[k] || null;
      if (k > 0 && stage === 'new') stage = 'calling';
      var fresh = kind === 'cadence' && k === 0 && !st.restartAt && !(st.calls || []).length;
      var label = '';
      if (step) {
        var day1 = dayStart(allowed(st.restartAt || lead.ts));
        var dn = Math.round((dayStart(next) - day1) / DAY) + 1;
        label = step.label || ('Day ' + dn + ' · ' + (WIN[slotOf(next)] || WIN.morning).label.toLowerCase());
        if (k === 0 && st.restartAt) label = 'Restart · first call';
      }
    } else if (stage === 'talked') { next = st.next || null; kind = 'followup'; }
    else if (stage === 'booked') { next = st.next || (booking && booking.at) || null; kind = 'booked'; }
    return {
      stage: stage,
      result: stage === 'done' ? (st.result || 'lost') : null,
      next: next, kind: kind,
      noAnswers: noAnswers(st),
      total: st.restartAt ? RESTART.length : PLAN.length,
      step: label || '',
      text: false,
      fresh: Boolean(fresh),
      restarted: Boolean(st.restartAt),
      calls: st.calls || [],
      notes: st.notes || '',
      overdue: Boolean(next && next < now - 5 * MIN),
      due: Boolean(next && next <= now + 15 * MIN)
    };
  }

  /* Every ping a lead will get between from and to if nobody taps
     anything: [{t, kind, n, label}] in time order.
     kind: 'new' (new lead) · 'call' · 'followup' · 'appt' */
  function nags(lead, st, booking, from, to) {
    var d = derive(lead, st, booking, from), out = [];
    if (!d.next || d.stage === 'done') return out;
    if (d.kind === 'booked') {
      [[60, 'Appointment in 1 hr'], [15, 'Appointment in 15 min']].forEach(function (a) {
        var t = d.next - a[0] * MIN;
        if (t >= from && t <= to) out.push({ t: t, kind: 'appt', n: 1, label: a[1] });
      });
      return out;
    }
    if (d.kind !== 'cadence' && d.kind !== 'followup') return out;
    var what = d.kind === 'followup' ? 'Follow-up' : 'Call ' + (d.noAnswers + 1) + '/' + d.total;
    nagTimes(d.next, d.fresh, (st && st.restartAt) || lead.ts, from, to).forEach(function (x) {
      var kind = d.fresh && x.first ? 'new' : d.kind === 'followup' ? 'followup' : 'call';
      var lbl = kind === 'new' ? 'New lead · ping ' + x.n + '/3'
        : x.first ? what + ' · ping ' + x.n + '/3'
        : what + ' · not called yet · ' + (WIN[slotOf(x.t)] || WIN.morning).label.toLowerCase() + ' ' + x.n + '/3';
      out.push({ t: x.t, kind: kind, n: x.n, label: lbl });
    });
    return out;
  }

  var ACTIONS = ['restart', 'no_answer', 'talked', 'booked', 'won', 'lost', 'stage', 'note', 'undo', 'reopen'];
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
      case 'restart': st.restartAt = a.at || now; st.stage = 'calling'; st.result = null; st.next = null; break;
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
    TZ: TZ, PLAN: PLAN, RESTART: RESTART, TOTAL: TOTAL, WINDOWS: WINDOWS, STAGES: STAGES, AD_LABELS: AD_LABELS, ACTIONS: ACTIONS,
    nags: nags, nagTimes: nagTimes, nextWindow: nextWindow, slotOf: slotOf,
    derive: derive, apply: apply, noAnswers: noAnswers, tomorrowMorning: tomorrowMorning, TOTAL: TOTAL, STAGES: STAGES, AD_LABELS: AD_LABELS,
    parts: parts, at: at, ymd: ymd, dayStart: dayStart, dateAfter: dateAfter,
    sunset: sunset, sabbath: sabbath, allowed: allowed, dueAt: dueAt,
    time12: time12, when: when, ago: ago, DOW: DOW, MON: MON, pad: pad
  };
});
