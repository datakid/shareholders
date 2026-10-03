var Engine = (function () {
  'use strict';

  var ENGINE_VERSION = 5;
  var ROUNDING_STEPS = [1, 5, 10, 25, 50, 100, 500, 1000];
  var DEFAULT_OPTIONS = { roundingStep: 1, roundingTarget: 'gross', allocation: 'assign', weighting: 'tier', attendance: 'prorata', capNet: null };
  var WARN_LIMIT = 1000;

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }
  function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  function hasOwn(obj, key) { return obj != null && Object.prototype.hasOwnProperty.call(obj, key); }
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function compareIds(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    var sa = String(a), sb = String(b);
    return sa < sb ? -1 : (sa > sb ? 1 : 0);
  }

  var DIGITS_A = '\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669';
  var DIGITS_E = '\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9';
  var LIGATURES = { '\uFEFB': '\u0644\u0627', '\uFEF9': '\u0644\u0627', '\uFEF7': '\u0644\u0627', '\uFEF5': '\u0644\u0627', '\uFEFC': '\u0644\u0627', '\uFEFA': '\u0644\u0627', '\uFEF8': '\u0644\u0627', '\uFEF6': '\u0644\u0627' };
  var CHAR_MAP = {
    '\u0623': '\u0627', '\u0625': '\u0627', '\u0622': '\u0627', '\u0671': '\u0627',
    '\u0629': '\u0647', '\u0649': '\u064A', '\u0624': '\u0648', '\u0626': '\u064A',
    '\u06CC': '\u064A', '\u06A9': '\u0643'
  };

  function isMark(code) {
    return (code >= 0x064B && code <= 0x065F) || code === 0x0670 || code === 0x0640 || (code >= 0x06D6 && code <= 0x06ED);
  }

  function foldChar(ch) {
    var code = ch.charCodeAt(0);
    if (isMark(code)) return '';
    if (LIGATURES[ch]) return LIGATURES[ch];
    if (CHAR_MAP[ch]) return CHAR_MAP[ch];
    var d = DIGITS_A.indexOf(ch);
    if (d === -1) d = DIGITS_E.indexOf(ch);
    if (d !== -1) return String(d);
    return ch.toLowerCase();
  }

  var ASCII_RE = /^[\x00-\x7F]*$/;
  function normalizeArabic(input) {
    if (input == null) return '';
    var s = String(input), out = '';
    if (ASCII_RE.test(s)) return s.toLowerCase().replace(/\s+/g, ' ').trim();
    for (var i = 0; i < s.length; i++) out += foldChar(s[i]);
    return out.replace(/\s+/g, ' ').trim();
  }

  function isKeptLoose(ch) {
    var c = ch.charCodeAt(0);
    return (c >= 0x0600 && c <= 0x06FF) || (c >= 48 && c <= 57) || (c >= 97 && c <= 122) || ch === ' ';
  }

  function normMap(input) {
    var raw = input == null ? '' : String(input);
    var norm = '', idx = [];
    for (var i = 0; i < raw.length; i++) {
      var folded = foldChar(raw[i]);
      for (var j = 0; j < folded.length; j++) {
        var ch = folded[j];
        if (/\s/.test(ch)) ch = ' ';
        if (!isKeptLoose(ch)) continue;
        if (ch === ' ' && (norm.length === 0 || norm[norm.length - 1] === ' ')) continue;
        norm += ch;
        idx.push(i);
      }
    }
    while (norm.length && norm[norm.length - 1] === ' ') { norm = norm.slice(0, -1); idx.pop(); }
    return { norm: norm, idx: idx };
  }

  function isSpaceCode(c) {
    return c === 32 || (c >= 9 && c <= 13) || c === 160 || c === 0x1680 || (c >= 0x2000 && c <= 0x200A) || c === 0x2028 || c === 0x2029 || c === 0x202F || c === 0x205F || c === 0x3000 || c === 0xFEFF;
  }
  var LBUF = [];
  function looseFast(raw) {
    var n = raw.length, buf = LBUF, len = 0, lastSpace = true;
    for (var i = 0; i < n; i++) {
      var c = raw.charCodeAt(i);
      if (c < 128) {
        if (c >= 65 && c <= 90) c += 32;
        if ((c >= 97 && c <= 122) || (c >= 48 && c <= 57)) { buf[len++] = c; lastSpace = false; }
        else if (c === 32 || (c >= 9 && c <= 13)) { if (!lastSpace) { buf[len++] = 32; lastSpace = true; } }
        continue;
      }
      if (c >= 0x0600 && c <= 0x06FF) {
        if (isMark(c)) continue;
        if (c === 0x623 || c === 0x625 || c === 0x622 || c === 0x671) c = 0x627;
        else if (c === 0x629) c = 0x647;
        else if (c === 0x649 || c === 0x626 || c === 0x6CC) c = 0x64A;
        else if (c === 0x624) c = 0x648;
        else if (c === 0x6A9) c = 0x643;
        else if (c >= 0x660 && c <= 0x669) c = 48 + c - 0x660;
        else if (c >= 0x6F0 && c <= 0x6F9) c = 48 + c - 0x6F0;
        buf[len++] = c; lastSpace = false;
        continue;
      }
      if (c >= 0xFEF5 && c <= 0xFEFC) { buf[len++] = 0x644; buf[len++] = 0x627; lastSpace = false; continue; }
      if (isSpaceCode(c)) { if (!lastSpace) { buf[len++] = 32; lastSpace = true; } continue; }
      var low = String.fromCharCode(c).toLowerCase();
      for (var j = 0; j < low.length; j++) {
        var d = low.charCodeAt(j);
        if ((d >= 97 && d <= 122) || (d >= 48 && d <= 57) || (d >= 0x0600 && d <= 0x06FF)) { buf[len++] = d; lastSpace = false; }
      }
    }
    while (len && buf[len - 1] === 32) len--;
    if (!len) return '';
    if (len <= 2048) return String.fromCharCode.apply(null, len === buf.length ? buf : buf.slice(0, len));
    var out = '';
    for (var k = 0; k < len; k += 2048) out += String.fromCharCode.apply(null, buf.slice(k, Math.min(len, k + 2048)));
    return out;
  }

  var LOOSE = new Map(), TIERM = new Map(), MEMO_MAX = 200000;
  function normalizeLoose(input) {
    if (input == null || input === '') return '';
    var k = typeof input === 'string' ? input : String(input);
    var v = LOOSE.get(k);
    if (v !== undefined) return v;
    v = looseFast(k);
    if (LOOSE.size > MEMO_MAX) LOOSE.clear();
    LOOSE.set(k, v);
    return v;
  }

  var NAME_KEY = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function nameKey(p) {
    if (!p || typeof p !== 'object') return '';
    if (!NAME_KEY) return p.name ? looseFast(String(p.name)) : '';
    var v = NAME_KEY.get(p);
    if (v === undefined) { v = p.name ? looseFast(String(p.name)) : ''; NAME_KEY.set(p, v); }
    return v;
  }

  function normalizeForTierMatch(input) {
    var key = input == null ? '' : String(input);
    var hit = TIERM.get(key);
    if (hit !== undefined) return hit;
    hit = tierMatchRaw(key);
    if (TIERM.size > MEMO_MAX) TIERM.clear();
    TIERM.set(key, hit);
    return hit;
  }
  function tierMatchRaw(input) {
    var raw = input.trim();
    var tokens = raw.split(/\s+/);
    return normalizeLoose(tokens.map(function (token) {
      var loose = normalizeLoose(token);
      return (loose.indexOf('\u0627\u0644') === 0 && loose.length >= 4) ? loose.slice(2) : token;
    }).join(' '));
  }

  function canonicalizeTierName(raw, names, aliases) {
    var target = normalizeForTierMatch(raw);
    if (!target) return null;
    for (var i = 0; i < names.length; i++) {
      if (normalizeForTierMatch(names[i]) === target) return names[i];
    }
    if (aliases && hasOwn(aliases, target) && names.indexOf(aliases[target]) !== -1) return aliases[target];
    return null;
  }

  function toPiastres(egp) { return Math.round((isNum(egp) ? egp : 0) * 100); }
  function fromPiastres(pi) { return pi / 100; }
  function normalizePinnedPool(value) { return (value == null || value === '') ? null : value; }

  function normalizeOptions(o) {
    o = o || {};
    var step = Number(o.roundingStep);
    if (!(step >= 1) || Math.round(step) !== step) step = 1;
    return {
      roundingStep: step,
      roundingTarget: o.roundingTarget === 'net' ? 'net' : 'gross',
      allocation: o.allocation === 'split' ? 'split' : 'assign',
      weighting: o.weighting === 'equal' ? 'equal' : 'tier',
      attendance: o.attendance === 'ignore' ? 'ignore' : 'prorata',
      capNet: (isNum(o.capNet) && o.capNet > 0) ? o.capNet : null
    };
  }

  function weightBreakdown(person, tiers, periodDays, options) {
    var o = normalizeOptions(options);
    var pd = isNum(periodDays) && periodDays >= 1 ? periodDays : 1;
    var b = { base: null, baseSource: null, days: pd, attendance: 1, penalty: 0, manual: 1, weight: 0, excluded: !!person.excluded, unresolved: false };
    if (o.weighting === 'equal') {
      b.base = 1; b.baseSource = 'equal';
    } else if (isNum(person.overrideValue)) {
      b.base = Math.max(0, person.overrideValue); b.baseSource = 'override';
    } else if (person.tier != null && person.tier !== '' && hasOwn(tiers, person.tier) && isNum(tiers[person.tier])) {
      b.base = Math.max(0, tiers[person.tier]); b.baseSource = 'tier';
    }
    if (b.base == null) b.unresolved = true;
    var days = isNum(person.daysWorked) ? person.daysWorked : pd;
    b.days = clamp(days, 0, pd);
    b.attendance = o.attendance === 'ignore' ? 1 : clamp(days / pd, 0, 1);
    b.penalty = clamp(isNum(person.penaltyRate) ? person.penaltyRate : 0, 0, 1);
    b.manual = (isNum(person.manualFactor) && person.manualFactor >= 0) ? person.manualFactor : 1;
    if (!b.excluded && !b.unresolved) {
      var w = b.base * b.attendance * (1 - b.penalty) * b.manual;
      b.weight = w > 0 ? w : 0;
    }
    return b;
  }

  function resolveBaseValue(person, tiers, options) {
    var b = weightBreakdown(person, tiers || {}, 1, options);
    return b.base;
  }

  function hasResolvableTier(person, tiers, options) { return resolveBaseValue(person, tiers, options) != null; }

  function effectiveWeight(person, tiers, periodDays, options) {
    var b = weightBreakdown(person, tiers, periodDays, options);
    if (b.excluded) return 0;
    if (b.unresolved) return null;
    return b.weight;
  }

  function effectiveGrossPiastres(gross, roundingStep) {
    var step = (roundingStep && roundingStep > 0) ? roundingStep : 1;
    return Math.round(toPiastres(gross) / step) * step;
  }

  function poolBudgets(pools) {
    var out = {}, N = 0;
    Object.keys(pools || {}).forEach(function (name) {
      var p = pools[name];
      var declared = toPiastres(p.gross);
      var tax = Math.round(declared * p.taxRate);
      out[name] = { declared: declared, tax: tax, net: declared - tax, rate: p.taxRate };
      N += declared - tax;
    });
    return { budgets: out, N: N };
  }

  function computePoolBudgets(pools, roundingStep) {
    var budgets = {}, effective = {}, N = 0, names = Object.keys(pools || {});
    names.forEach(function (name) {
      var p = pools[name];
      var eff = fromPiastres(effectiveGrossPiastres(p.gross, roundingStep));
      effective[name] = eff;
      budgets[name] = eff * (1 - p.taxRate);
      N += budgets[name];
    });
    return { budgets: budgets, effectiveGross: effective, N: N, names: names };
  }

  var BUCKETS = new Int32Array(65537);
  function apportionT(total, w, cap, rank, alloc) {
    var n = w.length, i, a;
    alloc.fill(0);
    if (!(total > 0) || n === 0) return total > 0 ? total : 0;
    var active = new Int32Array(n), na = 0;
    for (i = 0; i < n; i++) if (w[i] > 0 && (!cap || cap[i] !== 0)) active[na++] = i;
    var remaining = total, W = 0;
    if (cap) {
      for (;;) {
        W = 0;
        for (a = 0; a < na; a++) W += w[active[a]];
        if (!(W > 0)) break;
        var keep = 0, fixedNow = 0;
        for (a = 0; a < na; a++) {
          var ix = active[a], c = cap[ix];
          if (c >= 0 && remaining * w[ix] / W >= c) { alloc[ix] = c; fixedNow += c; }
          else active[keep++] = ix;
        }
        if (fixedNow === 0 && keep === na) break;
        remaining -= fixedNow;
        na = keep;
        if (!na) break;
      }
    } else {
      for (a = 0; a < na; a++) W += w[active[a]];
    }
    if (!na || !(W > 0) || remaining <= 0) return Math.max(0, remaining);
    var frac = new Float64Array(na), floorSum = 0;
    for (a = 0; a < na; a++) {
      var idx = active[a];
      var r = remaining * w[idx] / W;
      var f = Math.floor(r);
      if (cap && cap[idx] >= 0 && f > cap[idx]) f = cap[idx];
      alloc[idx] = f;
      floorSum += f;
      frac[a] = r - f;
    }
    var rem = remaining - floorSum;
    if (rem <= 0) return rem;
    function better(x, y) {
      var fx = frac[x], fy = frac[y];
      if (Math.abs(fy - fx) > 1e-9) return fy - fx;
      var ax = active[x], ay = active[y];
      if (w[ay] !== w[ax]) return w[ay] - w[ax];
      return rank ? rank[ax] - rank[ay] : ax - ay;
    }
    function eligible(x) { var ix = active[x]; return !cap || !(cap[ix] >= 0) || alloc[ix] < cap[ix]; }
    if (rem >= na || cap) {
      var all = [];
      for (a = 0; a < na; a++) all.push(a);
      all.sort(better);
      var k = 0, guard = 0, limit = na * 3 + 3;
      while (rem > 0 && guard < limit) {
        var e = all[k % na];
        if (eligible(e)) { alloc[active[e]]++; rem--; }
        k++; guard++;
      }
      return rem;
    }
    var B = na < 2048 ? 64 : 65536, counts = BUCKETS;
    counts.fill(0, 0, B + 1);
    var bucketOf = new Uint32Array(na);
    for (a = 0; a < na; a++) {
      var bk = Math.floor((1 - frac[a]) * B);
      if (bk < 0) bk = 0; else if (bk >= B) bk = B - 1;
      bucketOf[a] = bk;
      counts[bk]++;
    }
    var cum = 0, tb = 0;
    for (tb = 0; tb < B; tb++) { if (cum + counts[tb] >= rem) break; cum += counts[tb]; }
    var tie = [];
    for (a = 0; a < na; a++) {
      var bb = bucketOf[a];
      if (bb < tb) { alloc[active[a]]++; rem--; }
      else if (bb === tb) tie.push(a);
    }
    tie.sort(better);
    for (var t = 0; t < tie.length && rem > 0; t++) {
      if (eligible(tie[t])) { alloc[active[tie[t]]]++; rem--; }
    }
    return rem;
  }

  function rankOfIds(ids) {
    var n = ids.length, rank = new Int32Array(n), mono = true;
    for (var i = 0; i < n; i++) {
      if (typeof ids[i] !== 'number' || (i && !(ids[i] > ids[i - 1]))) { mono = false; break; }
    }
    if (mono) { for (var j = 0; j < n; j++) rank[j] = j; return rank; }
    var order = new Array(n);
    for (var k = 0; k < n; k++) order[k] = k;
    order.sort(function (a, b) { return compareIds(ids[a], ids[b]) || a - b; });
    for (var m = 0; m < n; m++) rank[order[m]] = m;
    return rank;
  }

  function apportion(total, members) {
    var n = members.length, w = new Float64Array(n), cap = null, ids = new Array(n);
    for (var i = 0; i < n; i++) {
      w[i] = members[i].weight;
      ids[i] = members[i].id;
      if (members[i].cap != null) { if (!cap) { cap = new Float64Array(n); cap.fill(-1); } cap[i] = members[i].cap; }
    }
    var out = new Float64Array(n);
    var left = apportionT(total, w, cap, rankOfIds(ids), out);
    return { alloc: Array.prototype.slice.call(out), left: left };
  }

  function distributePoolPiastres(grossPiastres, members) {
    var W = 0;
    for (var i = 0; i < members.length; i++) W += members[i].weight;
    if (grossPiastres === 0) return members.map(function () { return 0; });
    if (!(W > 0)) throw { code: 'ZERO_WEIGHT_NONZERO_GROSS', message: 'distributePoolPiastres: zero total weight with nonzero amount' };
    var res = apportion(grossPiastres, members.map(function (m) { return { id: m.id, weight: m.weight, cap: null }; }));
    var sum = res.alloc.reduce(function (s, x) { return s + x; }, 0);
    if (sum !== grossPiastres) throw { code: 'CONSERVATION_FAILED', message: 'distributePoolPiastres conservation', expected: grossPiastres, actual: sum };
    return res.alloc;
  }

  function orderByWeightDesc(free, nf, w, rank) {
    var distinct = new Map(), list = [], i;
    for (i = 0; i < nf; i++) {
      var x = w[free[i]];
      if (!distinct.has(x)) { distinct.set(x, 0); list.push(x); if (list.length > 65536) break; }
    }
    var out = new Int32Array(nf);
    if (list.length > 65536) {
      var arr = Array.prototype.slice.call(free.subarray(0, nf));
      arr.sort(function (a, b) { return (w[b] - w[a]) || (rank[a] - rank[b]); });
      for (i = 0; i < nf; i++) out[i] = arr[i];
      return out;
    }
    list.sort(function (a, b) { return b - a; });
    for (i = 0; i < list.length; i++) distinct.set(list[i], i);
    var byRank = Array.prototype.slice.call(free.subarray(0, nf));
    var sortedAlready = true;
    for (i = 1; i < nf; i++) if (rank[byRank[i]] < rank[byRank[i - 1]]) { sortedAlready = false; break; }
    if (!sortedAlready) byRank.sort(function (a, b) { return rank[a] - rank[b]; });
    var start = new Int32Array(list.length + 1);
    var ord = new Int32Array(nf);
    for (i = 0; i < nf; i++) { ord[i] = distinct.get(w[byRank[i]]); start[ord[i] + 1]++; }
    for (i = 0; i < list.length; i++) start[i + 1] += start[i];
    for (i = 0; i < nf; i++) out[start[ord[i]]++] = byRank[i];
    return out;
  }

  function assignCore(w, pin, rank, targets) {
    var m = w.length, P = targets.length, i, p;
    var pool = new Int32Array(m), current = new Float64Array(P), count = new Int32Array(P);
    var eligible = [];
    for (p = 0; p < P; p++) if (targets[p] > 0) eligible.push(p);
    var E = eligible.length;
    var freeRaw = new Int32Array(m), nf = 0;
    for (i = 0; i < m; i++) {
      if (pin[i] >= 0) { pool[i] = pin[i]; current[pin[i]] += w[i]; count[pin[i]]++; }
      else freeRaw[nf++] = i;
    }
    var free = orderByWeightDesc(freeRaw, nf, w, rank);
    if (!E) {
      for (i = 0; i < nf; i++) { var it0 = free[i]; pool[it0] = P ? 0 : -1; if (P) { current[0] += w[it0]; count[0]++; } }
      return { pool: pool, current: current, iterations: 0, converged: true, passes: 0 };
    }
    for (i = 0; i < nf; i++) {
      var it = free[i], best = eligible[0], bestDef = targets[best] - current[best];
      for (var k = 1; k < E; k++) { var q = eligible[k], d = targets[q] - current[q]; if (d > bestDef) { bestDef = d; best = q; } }
      pool[it] = best; current[best] += w[it]; count[best]++;
    }
    var n = nf;
    var swapWindow = n > 400000 ? 3 : (n > 60000 ? 6 : (n > 6000 ? 8 : (n > 1500 ? 12 : 24)));
    var maxPasses = n > 400000 ? 8 : (n > 60000 ? 16 : 60);
    var iterations = 0, pass = 0, moved = true;
    while (moved && pass < maxPasses) {
      pass++;
      moved = false;
      for (var fi = 0; fi < n; fi++) {
        iterations++;
        var item = free[fi], from = pool[item], wi = w[item];
        if (count[from] <= 1 && targets[from] > 0) continue;
        var bestGain = -1e-9, bestPool = -1;
        var baseFrom = Math.abs(current[from] - targets[from]);
        var afterFrom = Math.abs(current[from] - wi - targets[from]);
        for (var e = 0; e < E; e++) {
          var to = eligible[e];
          if (to === from) continue;
          var delta = (afterFrom - baseFrom) + (Math.abs(current[to] + wi - targets[to]) - Math.abs(current[to] - targets[to]));
          if (delta < bestGain) { bestGain = delta; bestPool = to; }
        }
        if (bestPool >= 0) {
          current[from] -= wi; count[from]--;
          current[bestPool] += wi; count[bestPool]++;
          pool[item] = bestPool;
          moved = true;
        }
      }
      for (var a = 0; a < n; a++) {
        var A = free[a], poolA = pool[A], wA = w[A];
        var lim = Math.min(n, a + 1 + swapWindow);
        for (var b = a + 1; b < lim; b++) {
          iterations++;
          var Bi = free[b], poolB = pool[Bi], wB = w[Bi];
          if (poolA === poolB || wA === wB) continue;
          var nA = current[poolA] - wA + wB;
          var nB = current[poolB] - wB + wA;
          if (Math.abs(nA - targets[poolA]) + Math.abs(nB - targets[poolB]) < Math.abs(current[poolA] - targets[poolA]) + Math.abs(current[poolB] - targets[poolB]) - 1e-9) {
            current[poolA] = nA; current[poolB] = nB;
            pool[A] = poolB; pool[Bi] = poolA;
            poolA = poolB;
            moved = true;
          }
        }
      }
    }
    return { pool: pool, current: current, iterations: iterations, converged: !moved, passes: pass };
  }

  function assignItemsToPools(items, targets) {
    var names = Object.keys(targets), index = Object.create(null);
    names.forEach(function (nm, i) { index[nm] = i; });
    var m = items.length, w = new Float64Array(m), pin = new Int32Array(m), ids = new Array(m);
    var extra = names.slice();
    items.forEach(function (it, i) {
      w[i] = it.weight; ids[i] = it.id;
      if (it.pinnedPool != null) {
        if (!(it.pinnedPool in index)) { index[it.pinnedPool] = extra.length; extra.push(it.pinnedPool); }
        pin[i] = index[it.pinnedPool];
      } else pin[i] = -1;
    });
    var t = new Float64Array(extra.length);
    names.forEach(function (nm, i) { t[i] = targets[nm]; });
    var r = assignCore(w, pin, rankOfIds(ids), t);
    var assignment = {}, current = {};
    items.forEach(function (it, i) { assignment[it.id] = r.pool[i] >= 0 ? extra[r.pool[i]] : null; });
    extra.forEach(function (nm, i) { current[nm] = r.current[i]; });
    return { assignment: assignment, current: current, iterations: r.iterations, converged: r.converged, passes: r.passes };
  }

  function validateState(state) {
    var errors = [];
    var pools = state.pools || {};
    var names = Object.keys(pools);
    if (!names.length) errors.push({ code: 'NO_POOLS', message: 'لا يوجد أي مجمع معرّف' });
    names.forEach(function (name) {
      var p = pools[name] || {};
      if (!(isNum(p.taxRate) && p.taxRate >= 0 && p.taxRate < 1)) errors.push({ code: 'BAD_TAX_RATE', poolName: name, message: 'نسبة الخصم لمجمع "' + name + '" يجب أن تكون بين 0% وأقل من 100%' });
      if (!(isNum(p.gross) && p.gross >= 0)) errors.push({ code: 'BAD_GROSS', poolName: name, message: 'إجمالي مجمع "' + name + '" يجب أن يكون رقمًا غير سالب' });
    });
    if (!(isNum(state.periodDays) && state.periodDays >= 1)) errors.push({ code: 'BAD_PERIOD_DAYS', message: 'عدد أيام الفترة يجب أن يكون 1 على الأقل' });
    var seenN = new Set(), seenS = new Set(), people = state.people || [], dup = 0, unk = 0;
    for (var i = 0; i < people.length; i++) {
      var person = people[i], id = person.id;
      var set = typeof id === 'number' ? seenN : seenS, key = typeof id === 'number' ? id : typeof id + ':' + id;
      if (set.has(key)) { if (dup++ < 50) errors.push({ code: 'DUPLICATE_ID', personId: id, message: 'رقم الصف ' + id + ' مكرر' }); }
      else set.add(key);
      var pinned = person.pinnedPool;
      if (pinned != null && pinned !== '' && !hasOwn(pools, pinned)) {
        if (unk++ < 50) errors.push({ code: 'UNKNOWN_PINNED_POOL', personId: id, poolName: pinned, message: 'المجمع المثبّت "' + pinned + '" غير موجود لـ "' + (person.name || id) + '"' });
      }
    }
    if (dup > 50) errors.push({ code: 'DUPLICATE_ID', message: 'و' + (dup - 50) + ' رقم صف مكرر آخر' });
    if (unk > 50) errors.push({ code: 'UNKNOWN_PINNED_POOL', message: 'و' + (unk - 50) + ' تثبيت آخر على مجمع غير موجود' });
    return errors;
  }

  var FLAG_BITS = { MISSING_NAME: 1, DUPLICATE_NAME: 2, UNRESOLVED_TIER: 4, BAD_PENALTY: 8, BAD_DAYS: 16, BAD_MANUAL_FACTOR: 32, NEGATIVE_OVERRIDE: 64 };

  function scanRows(state, o) {
    var people = state.people || [], n = people.length;
    var periodDays = state.periodDays, tiers = state.tiers || {};
    var warnings = [], counts = Object.create(null), flags = new Uint8Array(n);
    var names = new Map(), overrideIgnored = 0, tierMode = o.weighting === 'tier';
    function push(code, i, msg) {
      flags[i] |= FLAG_BITS[code];
      var c = counts[code] = (counts[code] || 0) + 1;
      if (c <= WARN_LIMIT) warnings.push({ code: code, personId: people[i].id, message: msg() });
    }
    for (var i = 0; i < n; i++) {
      var person = people[i];
      var nm = nameKey(person);
      if (!nm) push('MISSING_NAME', i, function () { return 'صف بدون اسم (رقم ' + person.id + ')'; });
      else {
        var first = names.get(nm);
        if (first !== undefined) push('DUPLICATE_NAME', i, function () { return 'الاسم "' + person.name + '" مكرر (صف ' + first + ' وصف ' + person.id + ')'; });
        else names.set(nm, person.id);
      }
      if (!person.excluded && tierMode && !isNum(person.overrideValue)) {
        var t = person.tier;
        if (t == null || t === '' || !hasOwn(tiers, t) || !isNum(tiers[t])) push('UNRESOLVED_TIER', i, function () { return 'لا توجد فئة معروفة لـ "' + (person.name || ('صف ' + person.id)) + '"' + (person.tier ? ' (الفئة: ' + person.tier + ')' : '') + ' — خارج التوزيع'; });
      }
      var pr = person.penaltyRate;
      if (pr != null && !(pr >= 0 && pr <= 1)) push('BAD_PENALTY', i, function () { return 'نسبة الجزاء خارج النطاق لـ "' + (person.name || ('صف ' + person.id)) + '" — ثُبّتت داخل 0–100%'; });
      var dw = person.daysWorked;
      if (dw != null && !(dw >= 0 && dw <= periodDays)) push('BAD_DAYS', i, function () { return 'أيام العمل خارج الفترة لـ "' + (person.name || ('صف ' + person.id)) + '" — ثُبّتت داخل 0–' + periodDays; });
      var mf = person.manualFactor;
      if (mf != null && !(mf >= 0)) push('BAD_MANUAL_FACTOR', i, function () { return 'المعامل اليدوي غير صالح لـ "' + (person.name || ('صف ' + person.id)) + '" — استُخدم 1'; });
      var ov = person.overrideValue;
      if (ov != null && ov < 0) push('NEGATIVE_OVERRIDE', i, function () { return 'القيمة المخصصة سالبة لـ "' + (person.name || ('صف ' + person.id)) + '" — اعتُبرت صفرًا'; });
      if (!tierMode && ov != null) overrideIgnored++;
    }
    Object.keys(counts).forEach(function (code) {
      if (counts[code] > WARN_LIMIT) warnings.push({ code: code, message: 'و' + (counts[code] - WARN_LIMIT) + ' صفًا آخر بنفس الملاحظة' });
    });
    if (overrideIgnored) { counts.OVERRIDE_IGNORED = 1; warnings.push({ code: 'OVERRIDE_IGNORED', message: Math.round(overrideIgnored) + ' قيمة مخصصة تم تجاهلها لأن طريقة الوزن «بالتساوي»' }); }
    return { warnings: warnings, counts: counts, flags: flags };
  }

  function collectRowWarnings(state, options) {
    return scanRows(state, normalizeOptions(options || state.options)).warnings;
  }

  function waterfillT(w, N, capPi) {
    var m = w.length, dist = new Float64Array(w), capped = new Uint8Array(m), W = 0, i;
    for (i = 0; i < m; i++) W += w[i];
    if (capPi == null || !(N > 0) || !(W > 0)) return { dist: dist, capped: capped, kPi: W > 0 ? N / W : 0, count: 0 };
    var active = new Int32Array(m), na = m, fixed = 0, count = 0;
    for (i = 0; i < m; i++) active[i] = i;
    for (;;) {
      if (!na) break;
      var Wa = 0;
      for (i = 0; i < na; i++) Wa += w[active[i]];
      var k = (N - fixed) / Wa, keep = 0;
      for (i = 0; i < na; i++) {
        var ix = active[i];
        if (k * w[ix] > capPi) { capped[ix] = 1; fixed += capPi; count++; }
        else active[keep++] = ix;
      }
      if (keep === na) break;
      na = keep;
    }
    var kPi;
    if (na) {
      var Wr = 0;
      for (i = 0; i < na; i++) Wr += w[active[i]];
      kPi = (N - fixed) / Wr;
      if (!(kPi > 0)) kPi = capPi;
      var cd = capPi / kPi;
      for (i = 0; i < m; i++) if (capped[i]) dist[i] = cd;
    } else {
      kPi = capPi;
      dist.fill(1);
    }
    return { dist: dist, capped: capped, kPi: kPi, count: count };
  }

  function sumArr(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }

  function distributeNetT(bd, mem, step) {
    var m = mem.w.length, rate = bd.rate, i;
    var units = Math.floor(bd.net / step);
    var retainedRound = bd.net - units * step;
    var capU = null;
    if (mem.cap) { capU = new Float64Array(m); for (i = 0; i < m; i++) capU[i] = mem.cap[i] < 0 ? -1 : Math.floor(mem.cap[i] / step); }
    var alloc = new Float64Array(m);
    var left = m ? apportionT(units, mem.w, capU, mem.rank, alloc) : units;
    var net = new Float64Array(m), paid = 0;
    for (i = 0; i < m; i++) { net[i] = alloc[i] * step; paid += net[i]; }
    var retainedCap = left * step;
    var retainedNet = retainedRound + retainedCap;
    var retainedTax = 0;
    if (paid === 0) retainedTax = bd.tax;
    else if (retainedNet > 0 && rate > 0) retainedTax = Math.min(bd.tax, Math.round(retainedNet * rate / (1 - rate)));
    var personTax = bd.tax - retainedTax;
    var tax = new Float64Array(m);
    if (personTax > 0) apportionT(personTax, net, null, mem.rank, tax);
    var taxSum = sumArr(tax);
    if (taxSum !== personTax) retainedTax += personTax - taxSum;
    var gross = new Float64Array(m), capped = new Uint8Array(m);
    for (i = 0; i < m; i++) { gross[i] = net[i] + tax[i]; if (capU && capU[i] >= 0 && alloc[i] >= capU[i]) capped[i] = 1; }
    return { gross: gross, tax: tax, net: net, capped: capped, adjust: 0, retainedGross: retainedNet + retainedTax, retainedRoundNet: retainedRound, retainedCapNet: retainedCap };
  }

  function distributeGrossT(bd, mem, step) {
    var m = mem.w.length, rate = bd.rate, i;
    var effGross = Math.round(bd.declared / step) * step;
    var units = effGross / step;
    var capU = null;
    if (mem.cap) {
      capU = new Float64Array(m);
      for (i = 0; i < m; i++) {
        var c = mem.cap[i];
        if (c < 0) { capU[i] = -1; continue; }
        var capGross = rate > 0 ? Math.max(0, c - 1) / (1 - rate) : c;
        capU[i] = Math.floor(capGross / step);
      }
    }
    var alloc = new Float64Array(m);
    var left = m ? apportionT(units, mem.w, capU, mem.rank, alloc) : units;
    var gross = new Float64Array(m), paidGross = 0;
    for (i = 0; i < m; i++) { gross[i] = alloc[i] * step; paidGross += gross[i]; }
    var taxTarget = Math.round(paidGross * rate);
    var tax = new Float64Array(m);
    if (taxTarget > 0) apportionT(taxTarget, gross, null, mem.rank, tax);
    var net = new Float64Array(m), capped = new Uint8Array(m);
    for (i = 0; i < m; i++) { net[i] = gross[i] - tax[i]; if (capU && capU[i] >= 0 && alloc[i] >= capU[i]) capped[i] = 1; }
    var retained = left * step;
    return { gross: gross, tax: tax, net: net, capped: capped, adjust: effGross - bd.declared, retainedGross: retained, retainedRoundNet: 0, retainedCapNet: retained };
  }

  function lazy(obj, key, enumerable, build) {
    var cached;
    Object.defineProperty(obj, key, {
      configurable: true, enumerable: enumerable,
      get: function () { if (cached === undefined) cached = build(); return cached; },
      set: function (v) { cached = v; }
    });
  }

  function runPipeline(state) {
    state = state || {};
    var t0 = now();
    var o = normalizeOptions(state.options);
    var errors = validateState(state);
    if (errors.length) return { ok: false, errors: errors, warnings: [], options: o };
    try {
      var tiers = state.tiers || {}, pools = state.pools, periodDays = state.periodDays, people = state.people || [];
      var n = people.length, i;
      var scan = scanRows(state, o), warnings = scan.warnings;
      var poolNames = Object.keys(pools), P = poolNames.length, poolIndex = Object.create(null);
      poolNames.forEach(function (nm, k) { poolIndex[nm] = k; });
      var bi = poolBudgets(pools), budgets = bi.budgets, N = bi.N;
      var step = o.roundingStep;
      var pd = isNum(periodDays) && periodDays >= 1 ? periodDays : 1;
      var equal = o.weighting === 'equal', ignoreDays = o.attendance === 'ignore';

      var ids = new Array(n);
      for (i = 0; i < n; i++) ids[i] = people[i].id;
      var rank = rankOfIds(ids);
      var weight = new Float64Array(n), excludedF = new Uint8Array(n), unresolvedF = new Uint8Array(n);
      var partIdx = new Int32Array(n), m = 0, W = 0, zeroWeight = 0, unresolvedIds = [];
      for (i = 0; i < n; i++) {
        var p = people[i], base = null;
        if (equal) base = 1;
        else if (isNum(p.overrideValue)) base = p.overrideValue > 0 ? p.overrideValue : 0;
        else { var tn = p.tier; if (tn != null && tn !== '' && hasOwn(tiers, tn) && isNum(tiers[tn])) base = tiers[tn] > 0 ? tiers[tn] : 0; }
        var ex = !!p.excluded;
        if (ex) excludedF[i] = 1;
        if (base == null) { unresolvedF[i] = 1; if (!ex) unresolvedIds.push(p.id); continue; }
        if (ex) continue;
        var days = isNum(p.daysWorked) ? p.daysWorked : pd;
        var att = ignoreDays ? 1 : clamp(days / pd, 0, 1);
        var pen = clamp(isNum(p.penaltyRate) ? p.penaltyRate : 0, 0, 1);
        var man = (isNum(p.manualFactor) && p.manualFactor >= 0) ? p.manualFactor : 1;
        var wv = base * att * (1 - pen) * man;
        if (wv > 0) { weight[i] = wv; partIdx[m++] = i; W += wv; }
        else zeroWeight++;
      }
      if (zeroWeight) warnings.push({ code: 'ZERO_WEIGHT', message: zeroWeight + ' شخص داخل التوزيع بوزن صفر (أيام صفر أو جزاء كامل أو معامل صفر) — نصيبهم صفر' });

      if (!(W > 0) && N > 0) {
        return { ok: false, errors: [{ code: 'NO_ELIGIBLE_PEOPLE', message: 'لا يوجد أي شخص مؤهل للتوزيع (مجموع الأوزان صفر)', unresolvedCount: unresolvedIds.length }], warnings: warnings, options: o };
      }

      partIdx = partIdx.subarray(0, m);
      var pw = new Float64Array(m), prank = new Int32Array(m);
      for (i = 0; i < m; i++) { pw[i] = weight[partIdx[i]]; prank[i] = rank[partIdx[i]]; }
      var capPi = o.capNet != null ? toPiastres(o.capNet) : null;
      var wf = waterfillT(pw, N, capPi);
      var Wd = sumArr(wf.dist);

      var targets = new Float64Array(P);
      for (var tp = 0; tp < P; tp++) targets[tp] = (N > 0 && Wd > 0) ? Wd * budgets[poolNames[tp]].net / N : 0;

      var pin = new Int32Array(m);
      for (i = 0; i < m; i++) { var pp = people[partIdx[i]].pinnedPool; pin[i] = (pp == null || pp === '') ? -1 : poolIndex[pp]; }

      var members = new Array(P), assignMeta = { converged: true, passes: 0 }, assignPool = null;
      function makeMem(size, withCap) { return { pos: new Int32Array(size), w: new Float64Array(size), cap: withCap ? new Float64Array(size) : null, rank: new Int32Array(size), n: 0 }; }
      function addMem(mem, pos, wv2, cap) { var k2 = mem.n++; mem.pos[k2] = pos; mem.w[k2] = wv2; mem.rank[k2] = prank[pos]; if (mem.cap) mem.cap[k2] = cap == null ? -1 : cap; }
      if (o.allocation === 'assign') {
        var ar = assignCore(wf.dist, pin, prank, targets);
        assignMeta = ar; assignPool = ar.pool;
        var cnt = new Int32Array(P);
        for (i = 0; i < m; i++) if (ar.pool[i] >= 0) cnt[ar.pool[i]]++;
        for (var mp = 0; mp < P; mp++) members[mp] = makeMem(cnt[mp], capPi != null);
        for (i = 0; i < m; i++) if (ar.pool[i] >= 0) addMem(members[ar.pool[i]], i, wf.dist[i], capPi);
      } else {
        var pinnedW = new Float64Array(P), cntS = new Int32Array(P), freeCount = 0;
        for (i = 0; i < m; i++) { if (pin[i] >= 0) { pinnedW[pin[i]] += wf.dist[i]; cntS[pin[i]]++; } else freeCount++; }
        var R = new Float64Array(P), sumR = 0, q;
        for (q = 0; q < P; q++) { R[q] = Math.max(0, targets[q] - pinnedW[q]); sumR += R[q]; }
        if (!(sumR > 0)) { sumR = 0; for (q = 0; q < P; q++) { R[q] = targets[q]; sumR += R[q]; } }
        for (q = 0; q < P; q++) members[q] = makeMem(cntS[q] + (sumR > 0 && R[q] > 0 ? freeCount : 0), capPi != null);
        for (i = 0; i < m; i++) if (pin[i] >= 0) addMem(members[pin[i]], i, wf.dist[i], capPi);
        if (sumR > 0) {
          for (q = 0; q < P; q++) {
            if (!(R[q] > 0)) continue;
            var share = R[q] / sumR, capS = capPi == null ? null : Math.floor(capPi * share);
            for (i = 0; i < m; i++) if (pin[i] < 0) addMem(members[q], i, wf.dist[i] * share, capS);
          }
        }
      }

      var split = o.allocation === 'split';
      var G = new Float64Array(n), T = new Float64Array(n), NT = new Float64Array(n);
      var poolCol = new Int32Array(n).fill(-1), partCount = new Uint8Array(n), cappedDist = new Uint8Array(n);
      var mG = null, mT = null, mN = null, mC = null, mH = null;
      if (split) { mG = new Float64Array(n * P); mT = new Float64Array(n * P); mN = new Float64Array(n * P); mC = new Uint8Array(n * P); mH = new Uint8Array(n * P); }
      var poolResults = {}, cappedPeople = 0;
      var kGlobal = (N > 0 && Wd > 0) ? N / Wd : 0;
      for (var pj = 0; pj < P; pj++) {
        var name = poolNames[pj], bd = budgets[name], mem = members[pj];
        if (!mem.n && bd.net > 0) {
          return { ok: false, errors: [{ code: 'EMPTY_POOL_WITH_BUDGET', poolName: name, message: 'مجمع "' + name + '" لديه مبلغ ولكن لا يوجد أي مستحق فيه' }], warnings: warnings, options: o };
        }
        var d = o.roundingTarget === 'gross' ? distributeGrossT(bd, mem, step) : distributeNetT(bd, mem, step);
        var actualWeight = sumArr(mem.w);
        var gP = sumArr(d.gross), tP = sumArr(d.tax), nP = sumArr(d.net);
        var kPool = actualWeight > 0 ? bd.net / actualWeight : null;
        var deviation = (kPool != null && kGlobal > 0) ? (kPool / kGlobal - 1) : null;
        var cappedCount = 0;
        for (var mi = 0; mi < mem.n; mi++) {
          var pi2 = partIdx[mem.pos[mi]];
          G[pi2] += d.gross[mi]; T[pi2] += d.tax[mi]; NT[pi2] += d.net[mi];
          partCount[pi2]++;
          poolCol[pi2] = partCount[pi2] === 1 ? pj : -2;
          if (d.capped[mi]) { if (!cappedDist[pi2]) cappedPeople++; cappedDist[pi2] = 1; cappedCount++; }
          if (split) { var cell = pi2 * P + pj; mG[cell] = d.gross[mi]; mT[cell] = d.tax[mi]; mN[cell] = d.net[mi]; mC[cell] = d.capped[mi]; mH[cell] = 1; }
        }
        poolResults[name] = {
          gross: pools[name].gross,
          taxRate: bd.rate,
          declaredPiastres: bd.declared,
          adjustPiastres: d.adjust,
          effectiveGrossPiastres: bd.declared + d.adjust,
          effectiveGross: fromPiastres(bd.declared + d.adjust),
          grossPiastres: gP,
          taxPiastres: tP,
          netPiastres: nP,
          net: fromPiastres(nP),
          retainedPiastres: d.retainedGross,
          retainedRoundNetPiastres: d.retainedRoundNet,
          retainedCapNetPiastres: d.retainedCapNet,
          roundingAdjusted: d.adjust !== 0 || d.retainedRoundNet > 0,
          roundingDifferencePiastres: d.adjust,
          targetWeight: o.allocation === 'assign' ? targets[pj] : actualWeight,
          actualWeight: actualWeight,
          deviation: deviation,
          kPool: kPool == null ? null : kPool / 100,
          zeroBudgetWithMembers: bd.declared === 0 && mem.n > 0,
          memberCount: mem.n,
          cappedCount: cappedCount
        };
        if (d.adjust !== 0) warnings.push({ code: 'POOL_ROUNDED', poolName: name, message: 'عُدّل إجمالي مجمع "' + name + '" من ' + fromPiastres(bd.declared).toFixed(2) + ' إلى ' + fromPiastres(bd.declared + d.adjust).toFixed(2) + ' ليناسب وحدة التقريب' });
        if (d.retainedRoundNet > 0) warnings.push({ code: 'POOL_ROUNDED', poolName: name, message: 'بقي ' + fromPiastres(d.retainedRoundNet).toFixed(2) + ' ج.م صافٍ من مجمع "' + name + '" دون توزيع لأن كل نصيب من مضاعفات وحدة التقريب' });
        if (bd.declared === 0 && mem.n) warnings.push({ code: 'ZERO_BUDGET_POOL', poolName: name, message: 'مجمع "' + name + '" بلا مبلغ — أعضاؤه المثبّتون لن يحصلوا على شيء منه' });
        if (d.retainedCapNet > 0) warnings.push({ code: 'CAP_RETAINED', poolName: name, message: 'بقي ' + fromPiastres(d.retainedCapNet).toFixed(2) + ' ج.م من مجمع "' + name + '" دون توزيع لأن كل أعضائه بلغوا الحد الأقصى' });
      }
      if (wf.count > 0) warnings.push({ code: 'CAP_APPLIED', message: wf.count + ' شخص بلغ الحد الأقصى للصافي، ووُزّع الفائض على الباقين' });

      var dist = new Float64Array(n), cappedAny = new Uint8Array(n);
      for (i = 0; i < m; i++) { dist[partIdx[i]] = wf.dist[i]; if (wf.capped[i]) cappedAny[partIdx[i]] = 1; }
      var paidCount = 0, poolSum = new Float64Array(P * 3);
      for (i = 0; i < n; i++) {
        if (cappedDist[i]) cappedAny[i] = 1;
        if (NT[i] < 0 || T[i] < 0) throw { code: 'NEGATIVE_AMOUNT', message: 'مبلغ سالب لصف ' + ids[i] };
        if (capPi != null && o.roundingTarget === 'net' && NT[i] > capPi) throw { code: 'CAP_VIOLATED', message: 'تجاوز الحد الأقصى لصف ' + ids[i] };
        if (NT[i] > 0) paidCount++;
        if (!split && poolCol[i] >= 0) { var b3 = poolCol[i] * 3; poolSum[b3] += G[i]; poolSum[b3 + 1] += T[i]; poolSum[b3 + 2] += NT[i]; }
      }
      if (split) {
        for (i = 0; i < n * P; i++) if (mH[i]) { var b4 = (i % P) * 3; poolSum[b4] += mG[i]; poolSum[b4 + 1] += mT[i]; poolSum[b4 + 2] += mN[i]; }
      }
      var tot = { declared: 0, gross: 0, tax: 0, net: 0, retained: 0, adjust: 0 };
      poolNames.forEach(function (nm, k) {
        var pr = poolResults[nm], gs = poolSum[k * 3], ts = poolSum[k * 3 + 1], ns = poolSum[k * 3 + 2];
        var bad = gs !== pr.grossPiastres || ts !== pr.taxPiastres || ns !== pr.netPiastres || gs - ts !== ns ||
          pr.grossPiastres + pr.retainedPiastres !== pr.declaredPiastres + pr.adjustPiastres || pr.retainedPiastres < 0;
        if (bad) throw { code: 'CONSERVATION_FAILED', message: 'فشل فحص حفظ القيمة في مجمع "' + nm + '"' };
        tot.declared += pr.declaredPiastres; tot.gross += gs; tot.tax += ts; tot.net += ns; tot.retained += pr.retainedPiastres; tot.adjust += pr.adjustPiastres;
      });

      var kPi = wf.kPi;
      var cols = {
        n: n, ids: ids, poolNames: poolNames, split: split,
        gross: G, tax: T, net: NT, weight: weight, dist: dist, pool: poolCol,
        capped: cappedAny, excluded: excludedF, unresolved: unresolvedF, warnFlags: scan.flags, kPi: kPi,
        mG: mG, mT: mT, mN: mN, mC: mC, mH: mH, cappedDist: cappedDist
      };
      function partsAt(i2) {
        var pc = poolCol[i2];
        if (pc === -1) return [];
        if (!split) return [{ pool: poolNames[pc], grossPiastres: G[i2], taxPiastres: T[i2], netPiastres: NT[i2], capped: !!cappedDist[i2] }];
        var out = [];
        for (var k3 = 0; k3 < P; k3++) {
          var c3 = i2 * P + k3;
          if (mH[c3]) out.push({ pool: poolNames[k3], grossPiastres: mG[c3], taxPiastres: mT[c3], netPiastres: mN[c3], capped: !!mC[c3] });
        }
        return out;
      }
      function poolsAt(i2) {
        var pc = poolCol[i2];
        if (pc === -1) return [];
        if (pc >= 0) return [poolNames[pc]];
        var out = [];
        for (var k4 = 0; k4 < P; k4++) if (mH[i2 * P + k4]) out.push(poolNames[k4]);
        return out;
      }
      cols.partsAt = partsAt;
      cols.poolsAt = poolsAt;
      function personAt(i2) {
        var parts = partsAt(i2), single = parts.length === 1 ? parts[0].pool : null, dw = dist[i2];
        var b = weightBreakdown(people[i2], tiers, periodDays, o);
        return {
          id: ids[i2], pool: single, pools: parts.map(function (x) { return x.pool; }), multi: parts.length > 1, parts: parts,
          weight: weight[i2], distWeight: dw, capped: !!cappedAny[i2],
          shareOfPoolWeight: single && poolResults[single].actualWeight > 0 ? dw / poolResults[single].actualWeight : 0,
          grossPiastres: G[i2], taxPiastres: T[i2], netPiastres: NT[i2],
          idealNetEGP: dw > 0 ? kPi * dw / 100 : 0,
          unresolvedTier: !excludedF[i2] && !!unresolvedF[i2], excluded: !!excludedF[i2], breakdown: b
        };
      }
      cols.personAt = personAt;

      var res = {
        ok: true,
        engineVersion: ENGINE_VERSION,
        options: o,
        k: W > 0 ? (N / W) / 100 : 0,
        kEffective: kPi / 100,
        W: W,
        Wd: Wd,
        N: fromPiastres(N),
        NPiastres: N,
        poolResults: poolResults,
        warnings: warnings,
        warningCounts: scan.counts,
        unresolvedTierIds: unresolvedIds,
        cappedCount: cappedPeople || wf.count,
        paidCount: paidCount,
        insideCount: m,
        totals: tot,
        meta: { timingMs: 0, converged: assignMeta.converged, passes: assignMeta.passes, rows: n }
      };
      Object.defineProperty(res, 'cols', { value: cols, enumerable: false, configurable: true });
      lazy(res, 'people', true, function () { var arr = new Array(n); for (var z = 0; z < n; z++) arr[z] = personAt(z); return arr; });
      lazy(res, 'assignment', false, function () { var a = {}; for (var z = 0; z < n; z++) if (poolCol[z] >= 0) a[ids[z]] = poolNames[poolCol[z]]; return a; });
      res.meta.timingMs = now() - t0;
      return res;
    } catch (e) {
      return { ok: false, errors: [{ code: (e && e.code) || 'INTERNAL_ERROR', message: (e && e.message) || 'خطأ داخلي غير متوقع في محرك الحساب', detail: String(e && e.stack || '') }], warnings: [], options: o };
    }
  }

  return {
    VERSION: ENGINE_VERSION,
    ROUNDING_STEPS: ROUNDING_STEPS,
    DEFAULT_OPTIONS: DEFAULT_OPTIONS,
    FLAG_BITS: FLAG_BITS,
    normalizeArabic: normalizeArabic,
    normalizeLoose: normalizeLoose,
    nameKey: nameKey,
    normMap: normMap,
    normalizeForTierMatch: normalizeForTierMatch,
    canonicalizeTierName: canonicalizeTierName,
    normalizeOptions: normalizeOptions,
    toPiastres: toPiastres,
    fromPiastres: fromPiastres,
    weightBreakdown: weightBreakdown,
    effectiveWeight: effectiveWeight,
    effectiveGrossPiastres: effectiveGrossPiastres,
    resolveBaseValue: resolveBaseValue,
    hasResolvableTier: hasResolvableTier,
    computePoolBudgets: computePoolBudgets,
    poolBudgets: poolBudgets,
    apportion: apportion,
    assignItemsToPools: assignItemsToPools,
    distributePoolPiastres: distributePoolPiastres,
    validateState: validateState,
    collectRowWarnings: collectRowWarnings,
    normalizePinnedPool: normalizePinnedPool,
    runPipeline: runPipeline,
    clamp: clamp,
    compareIds: compareIds,
    hasOwn: hasOwn,
    isNum: isNum
  };
})();
