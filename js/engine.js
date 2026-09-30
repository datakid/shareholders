var Engine = (function () {
  'use strict';

  var ENGINE_VERSION = 4;
  var ROUNDING_STEPS = [1, 5, 10, 25, 50, 100, 500, 1000];
  var DEFAULT_OPTIONS = { roundingStep: 1, roundingTarget: 'gross', allocation: 'assign', weighting: 'tier', attendance: 'prorata', capNet: null };

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

  function normalizeArabic(input) {
    if (input == null) return '';
    var s = String(input), out = '';
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

  function normalizeLoose(input) { return normMap(input).norm; }

  function normalizeForTierMatch(input) {
    var raw = String(input == null ? '' : input).trim();
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

  function apportion(total, members) {
    var n = members.length, alloc = new Array(n), i;
    for (i = 0; i < n; i++) alloc[i] = 0;
    if (!(total > 0) || n === 0) return { alloc: alloc, left: total > 0 ? total : 0 };
    var active = [];
    for (i = 0; i < n; i++) {
      var m = members[i];
      if (m.weight > 0 && (m.cap == null || m.cap > 0)) active.push(i);
    }
    var remaining = total, W = 0, a;
    for (;;) {
      W = 0;
      for (a = 0; a < active.length; a++) W += members[active[a]].weight;
      if (!(W > 0)) break;
      var keep = [], fixedNow = 0;
      for (a = 0; a < active.length; a++) {
        var ix = active[a], mm = members[ix];
        if (mm.cap != null && remaining * mm.weight / W >= mm.cap) { alloc[ix] = mm.cap; fixedNow += mm.cap; }
        else keep.push(ix);
      }
      if (fixedNow === 0 && keep.length === active.length) break;
      remaining -= fixedNow;
      active = keep;
      if (!active.length) break;
    }
    if (!active.length || !(W > 0) || remaining <= 0) return { alloc: alloc, left: Math.max(0, remaining) };
    var parts = [], floorSum = 0;
    for (a = 0; a < active.length; a++) {
      var idx = active[a], mem = members[idx];
      var r = remaining * mem.weight / W;
      var f = Math.floor(r);
      if (mem.cap != null && f > mem.cap) f = mem.cap;
      alloc[idx] = f;
      floorSum += f;
      parts.push({ idx: idx, frac: r - f, weight: mem.weight, id: mem.id });
    }
    var rem = remaining - floorSum;
    parts.sort(function (x, y) {
      if (Math.abs(y.frac - x.frac) > 1e-9) return y.frac - x.frac;
      if (y.weight !== x.weight) return y.weight - x.weight;
      return compareIds(x.id, y.id);
    });
    var k = 0, guard = 0, limit = parts.length * 3 + 3;
    while (rem > 0 && guard < limit) {
      var e = parts[k % parts.length], cap = members[e.idx].cap;
      if (cap == null || alloc[e.idx] < cap) { alloc[e.idx]++; rem--; }
      k++; guard++;
    }
    return { alloc: alloc, left: rem };
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

  function assignItemsToPools(items, targets, opts) {
    opts = opts || {};
    var poolNames = Object.keys(targets);
    var eligible = poolNames.filter(function (p) { return targets[p] > 0; });
    var assignment = {}, current = {}, count = {};
    poolNames.forEach(function (p) { current[p] = 0; count[p] = 0; });
    var free = [];
    items.forEach(function (it) {
      if (it.pinnedPool != null) {
        assignment[it.id] = it.pinnedPool;
        current[it.pinnedPool] = (current[it.pinnedPool] || 0) + it.weight;
        count[it.pinnedPool] = (count[it.pinnedPool] || 0) + 1;
      } else free.push(it);
    });
    free.sort(function (a, b) { return (b.weight - a.weight) || compareIds(a.id, b.id); });
    if (!eligible.length) {
      free.forEach(function (it) {
        var fb = poolNames[0] || null;
        assignment[it.id] = fb;
        if (fb) { current[fb] += it.weight; count[fb]++; }
      });
      return { assignment: assignment, current: current, iterations: 0, converged: true, passes: 0 };
    }
    free.forEach(function (it) {
      var best = eligible[0], bestDef = targets[best] - current[best];
      for (var k = 1; k < eligible.length; k++) {
        var p = eligible[k], d = targets[p] - current[p];
        if (d > bestDef) { bestDef = d; best = p; }
      }
      assignment[it.id] = best;
      current[best] += it.weight;
      count[best]++;
    });
    var n = free.length;
    var swapWindow = opts.swapWindow != null ? opts.swapWindow : (n > 6000 ? 6 : (n > 1500 ? 12 : 24));
    var maxPasses = opts.maxPasses != null ? opts.maxPasses : 60;
    var iterations = 0, pass = 0, moved = true;
    function cost(p, v) { return Math.abs(v - targets[p]); }
    while (moved && pass < maxPasses) {
      pass++;
      moved = false;
      for (var fi = 0; fi < n; fi++) {
        iterations++;
        var it = free[fi], from = assignment[it.id];
        if (count[from] <= 1 && targets[from] > 0) continue;
        var bestGain = -1e-9, bestPool = null;
        var baseFrom = cost(from, current[from]);
        var afterFrom = cost(from, current[from] - it.weight);
        for (var pi = 0; pi < eligible.length; pi++) {
          var to = eligible[pi];
          if (to === from) continue;
          var delta = (afterFrom - baseFrom) + (cost(to, current[to] + it.weight) - cost(to, current[to]));
          if (delta < bestGain) { bestGain = delta; bestPool = to; }
        }
        if (bestPool) {
          current[from] -= it.weight; count[from]--;
          current[bestPool] += it.weight; count[bestPool]++;
          assignment[it.id] = bestPool;
          moved = true;
        }
      }
      for (var a = 0; a < n; a++) {
        var A = free[a], poolA = assignment[A.id];
        var lim = Math.min(n, a + 1 + swapWindow);
        for (var b = a + 1; b < lim; b++) {
          iterations++;
          var B = free[b], poolB = assignment[B.id];
          if (poolA === poolB || A.weight === B.weight) continue;
          var nA = current[poolA] - A.weight + B.weight;
          var nB = current[poolB] - B.weight + A.weight;
          if (cost(poolA, nA) + cost(poolB, nB) < cost(poolA, current[poolA]) + cost(poolB, current[poolB]) - 1e-9) {
            current[poolA] = nA; current[poolB] = nB;
            assignment[A.id] = poolB; assignment[B.id] = poolA;
            poolA = poolB;
            moved = true;
          }
        }
      }
    }
    return { assignment: assignment, current: current, iterations: iterations, converged: !moved, passes: pass };
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
    var seen = Object.create(null);
    (state.people || []).forEach(function (person) {
      var key = typeof person.id + ':' + person.id;
      if (seen[key]) errors.push({ code: 'DUPLICATE_ID', personId: person.id, message: 'رقم الصف ' + person.id + ' مكرر' });
      seen[key] = true;
      var pinned = normalizePinnedPool(person.pinnedPool);
      if (pinned != null && !hasOwn(pools, pinned)) {
        errors.push({ code: 'UNKNOWN_PINNED_POOL', personId: person.id, poolName: pinned, message: 'المجمع المثبّت "' + pinned + '" غير موجود لـ "' + (person.name || person.id) + '"' });
      }
    });
    return errors;
  }

  function collectRowWarnings(state, options) {
    var o = normalizeOptions(options || state.options);
    var warnings = [];
    var periodDays = state.periodDays;
    var tiers = state.tiers || {};
    var names = Object.create(null);
    var overrideIgnored = 0;
    (state.people || []).forEach(function (person) {
      var label = person.name || ('صف ' + person.id);
      var nm = normalizeLoose(person.name);
      if (!nm) warnings.push({ code: 'MISSING_NAME', personId: person.id, message: 'صف بدون اسم (رقم ' + person.id + ')' });
      else {
        if (names[nm]) warnings.push({ code: 'DUPLICATE_NAME', personId: person.id, message: 'الاسم "' + person.name + '" مكرر (صف ' + names[nm] + ' وصف ' + person.id + ')' });
        else names[nm] = person.id;
      }
      if (!person.excluded && o.weighting === 'tier' && !hasResolvableTier(person, tiers, o)) {
        warnings.push({ code: 'UNRESOLVED_TIER', personId: person.id, message: 'لا توجد فئة معروفة لـ "' + label + '"' + (person.tier ? ' (الفئة: ' + person.tier + ')' : '') + ' — خارج التوزيع' });
      }
      if (person.penaltyRate != null && !(person.penaltyRate >= 0 && person.penaltyRate <= 1)) {
        warnings.push({ code: 'BAD_PENALTY', personId: person.id, message: 'نسبة الجزاء خارج النطاق لـ "' + label + '" — ثُبّتت داخل 0–100%' });
      }
      if (person.daysWorked != null && !(person.daysWorked >= 0 && person.daysWorked <= periodDays)) {
        warnings.push({ code: 'BAD_DAYS', personId: person.id, message: 'أيام العمل خارج الفترة لـ "' + label + '" — ثُبّتت داخل 0–' + periodDays });
      }
      if (person.manualFactor != null && !(person.manualFactor >= 0)) {
        warnings.push({ code: 'BAD_MANUAL_FACTOR', personId: person.id, message: 'المعامل اليدوي غير صالح لـ "' + label + '" — استُخدم 1' });
      }
      if (person.overrideValue != null && person.overrideValue < 0) {
        warnings.push({ code: 'NEGATIVE_OVERRIDE', personId: person.id, message: 'القيمة المخصصة سالبة لـ "' + label + '" — اعتُبرت صفرًا' });
      }
      if (o.weighting === 'equal' && person.overrideValue != null) overrideIgnored++;
    });
    if (overrideIgnored) warnings.push({ code: 'OVERRIDE_IGNORED', message: Math.round(overrideIgnored) + ' قيمة مخصصة تم تجاهلها لأن طريقة الوزن «بالتساوي»' });
    return warnings;
  }

  function waterfill(participating, N, capPi) {
    var dist = Object.create(null), capped = Object.create(null), W = 0;
    participating.forEach(function (e) { dist[e.id] = e.weight; W += e.weight; });
    if (capPi == null || !(N > 0) || !(W > 0)) return { dist: dist, capped: capped, kPi: W > 0 ? N / W : 0, count: 0 };
    var active = participating.slice(), fixed = 0, count = 0;
    for (;;) {
      if (!active.length) break;
      var Wa = 0;
      active.forEach(function (e) { Wa += e.weight; });
      var k = (N - fixed) / Wa;
      var next = [];
      active.forEach(function (e) {
        if (k * e.weight > capPi) { capped[e.id] = true; fixed += capPi; count++; }
        else next.push(e);
      });
      if (next.length === active.length) break;
      active = next;
    }
    var kPi;
    if (active.length) {
      var Wr = 0;
      active.forEach(function (e) { Wr += e.weight; });
      kPi = (N - fixed) / Wr;
      if (!(kPi > 0)) kPi = capPi;
      Object.keys(capped).forEach(function (id) { dist[id] = capPi / kPi; });
    } else {
      kPi = capPi;
      participating.forEach(function (e) { dist[e.id] = 1; });
    }
    return { dist: dist, capped: capped, kPi: kPi, count: count };
  }

  function distributeNet(bd, members, step) {
    var n = members.length, rate = bd.rate;
    var units = Math.floor(bd.net / step);
    var retainedRound = bd.net - units * step;
    var ms = members.map(function (m) { return { id: m.id, weight: m.weight, cap: m.capPi == null ? null : Math.floor(m.capPi / step) }; });
    var ap = n ? apportion(units, ms) : { alloc: [], left: units };
    var net = ap.alloc.map(function (u) { return u * step; });
    var paid = net.reduce(function (s, x) { return s + x; }, 0);
    var retainedCap = ap.left * step;
    var retainedNet = retainedRound + retainedCap;
    var retainedTax = 0;
    if (paid === 0) retainedTax = bd.tax;
    else if (retainedNet > 0 && rate > 0) retainedTax = Math.min(bd.tax, Math.round(retainedNet * rate / (1 - rate)));
    var personTax = bd.tax - retainedTax;
    var tax = personTax > 0 ? apportion(personTax, members.map(function (m, i) { return { id: m.id, weight: net[i], cap: null }; })).alloc : net.map(function () { return 0; });
    var taxSum = tax.reduce(function (s, x) { return s + x; }, 0);
    if (taxSum !== personTax) { retainedTax += personTax - taxSum; }
    var gross = net.map(function (x, i) { return x + tax[i]; });
    var capped = ms.map(function (m, i) { return m.cap != null && ap.alloc[i] >= m.cap; });
    return {
      gross: gross, tax: tax, net: net, capped: capped,
      adjust: 0,
      retainedGross: retainedNet + retainedTax,
      retainedRoundNet: retainedRound, retainedCapNet: retainedCap
    };
  }

  function distributeGross(bd, members, step) {
    var rate = bd.rate;
    var effGross = Math.round(bd.declared / step) * step;
    var units = effGross / step;
    var ms = members.map(function (m) {
      var cap = null;
      if (m.capPi != null) {
        var capGross = rate > 0 ? Math.max(0, m.capPi - 1) / (1 - rate) : m.capPi;
        cap = Math.floor(capGross / step);
      }
      return { id: m.id, weight: m.weight, cap: cap };
    });
    var ap = members.length ? apportion(units, ms) : { alloc: [], left: units };
    var gross = ap.alloc.map(function (u) { return u * step; });
    var paidGross = gross.reduce(function (s, x) { return s + x; }, 0);
    var taxTarget = Math.round(paidGross * rate);
    var tax = taxTarget > 0 ? apportion(taxTarget, members.map(function (m, i) { return { id: m.id, weight: gross[i], cap: null }; })).alloc : gross.map(function () { return 0; });
    var net = gross.map(function (g, i) { return g - tax[i]; });
    var capped = ms.map(function (m, i) { return m.cap != null && ap.alloc[i] >= m.cap; });
    var retained = ap.left * step;
    return {
      gross: gross, tax: tax, net: net, capped: capped,
      adjust: effGross - bd.declared,
      retainedGross: retained,
      retainedRoundNet: 0, retainedCapNet: retained
    };
  }

  function sum(arr) { var s = 0; for (var i = 0; i < arr.length; i++) s += arr[i]; return s; }

  function runPipeline(state) {
    state = state || {};
    var t0 = now();
    var o = normalizeOptions(state.options);
    var errors = validateState(state);
    if (errors.length) return { ok: false, errors: errors, warnings: [], options: o };
    try {
      var tiers = state.tiers || {}, pools = state.pools, periodDays = state.periodDays, people = state.people || [];
      var warnings = collectRowWarnings(state, o);
      var poolNames = Object.keys(pools);
      var bi = poolBudgets(pools), budgets = bi.budgets, N = bi.N;
      var step = o.roundingStep;

      var entries = new Array(people.length), participating = [], unresolvedIds = [], W = 0, zeroWeight = 0;
      for (var i = 0; i < people.length; i++) {
        var p = people[i];
        var b = weightBreakdown(p, tiers, periodDays, o);
        entries[i] = { person: p, b: b };
        if (!b.excluded && b.unresolved) unresolvedIds.push(p.id);
        if (b.weight > 0) { participating.push({ id: p.id, weight: b.weight, person: p }); W += b.weight; }
        else if (!b.excluded && !b.unresolved) zeroWeight++;
      }
      if (zeroWeight) warnings.push({ code: 'ZERO_WEIGHT', message: zeroWeight + ' شخص داخل التوزيع بوزن صفر (أيام صفر أو جزاء كامل أو معامل صفر) — نصيبهم صفر' });

      if (!(W > 0) && N > 0) {
        return { ok: false, errors: [{ code: 'NO_ELIGIBLE_PEOPLE', message: 'لا يوجد أي شخص مؤهل للتوزيع (مجموع الأوزان صفر)', unresolvedCount: unresolvedIds.length }], warnings: warnings, options: o };
      }

      var capPi = o.capNet != null ? toPiastres(o.capNet) : null;
      var wf = waterfill(participating, N, capPi);
      var Wd = 0;
      participating.forEach(function (e) { Wd += wf.dist[e.id]; });

      var targets = {};
      poolNames.forEach(function (name) { targets[name] = (N > 0 && Wd > 0) ? Wd * budgets[name].net / N : 0; });

      var poolMembers = {}, assignMeta = { converged: true, passes: 0 };
      poolNames.forEach(function (n) { poolMembers[n] = []; });
      if (o.allocation === 'assign') {
        var items = participating.map(function (e) { return { id: e.id, weight: wf.dist[e.id], pinnedPool: normalizePinnedPool(e.person.pinnedPool) }; });
        assignMeta = assignItemsToPools(items, targets, {});
        items.forEach(function (it) {
          var pn = assignMeta.assignment[it.id];
          if (pn != null && poolMembers[pn]) poolMembers[pn].push({ id: it.id, weight: it.weight, capPi: capPi });
        });
      } else {
        var pinnedW = {}, free = [];
        poolNames.forEach(function (n) { pinnedW[n] = 0; });
        participating.forEach(function (e) {
          var pin = normalizePinnedPool(e.person.pinnedPool);
          if (pin != null) { pinnedW[pin] += wf.dist[e.id]; poolMembers[pin].push({ id: e.id, weight: wf.dist[e.id], capPi: capPi }); }
          else free.push(e);
        });
        var R = {}, sumR = 0;
        poolNames.forEach(function (n) { R[n] = Math.max(0, targets[n] - pinnedW[n]); sumR += R[n]; });
        if (!(sumR > 0)) { sumR = 0; poolNames.forEach(function (n) { R[n] = targets[n]; sumR += R[n]; }); }
        if (sumR > 0) {
          free.forEach(function (e) {
            var w = wf.dist[e.id];
            poolNames.forEach(function (n) {
              if (!(R[n] > 0)) return;
              var share = R[n] / sumR;
              poolMembers[n].push({ id: e.id, weight: w * share, capPi: capPi == null ? null : Math.floor(capPi * share) });
            });
          });
        }
      }

      var poolResults = {}, personParts = Object.create(null), cappedIds = Object.create(null);
      var kGlobal = (N > 0 && Wd > 0) ? N / Wd : 0;
      for (var pj = 0; pj < poolNames.length; pj++) {
        var name = poolNames[pj], bd = budgets[name], members = poolMembers[name];
        if (!members.length && bd.net > 0) {
          return { ok: false, errors: [{ code: 'EMPTY_POOL_WITH_BUDGET', poolName: name, message: 'مجمع "' + name + '" لديه مبلغ ولكن لا يوجد أي مستحق فيه' }], warnings: warnings, options: o };
        }
        var d = o.roundingTarget === 'gross' ? distributeGross(bd, members, step) : distributeNet(bd, members, step);
        var actualWeight = 0;
        members.forEach(function (m) { actualWeight += m.weight; });
        var gP = sum(d.gross), tP = sum(d.tax), nP = sum(d.net);
        var kPool = actualWeight > 0 ? bd.net / actualWeight : null;
        var deviation = (kPool != null && kGlobal > 0) ? (kPool / kGlobal - 1) : null;
        var cappedCount = 0;
        members.forEach(function (m, mi) {
          (personParts[m.id] || (personParts[m.id] = [])).push({ pool: name, grossPiastres: d.gross[mi], taxPiastres: d.tax[mi], netPiastres: d.net[mi], capped: d.capped[mi] });
          if (d.capped[mi]) { cappedIds[m.id] = true; cappedCount++; }
        });
        var roundingAdjusted = d.adjust !== 0 || d.retainedRoundNet > 0;
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
          roundingAdjusted: roundingAdjusted,
          roundingDifferencePiastres: d.adjust,
          targetWeight: o.allocation === 'assign' ? targets[name] : actualWeight,
          actualWeight: actualWeight,
          deviation: deviation,
          kPool: kPool == null ? null : kPool / 100,
          zeroBudgetWithMembers: bd.declared === 0 && members.length > 0,
          memberCount: members.length,
          cappedCount: cappedCount
        };
        if (d.adjust !== 0) warnings.push({ code: 'POOL_ROUNDED', poolName: name, message: 'عُدّل إجمالي مجمع "' + name + '" من ' + fromPiastres(bd.declared).toFixed(2) + ' إلى ' + fromPiastres(bd.declared + d.adjust).toFixed(2) + ' ليناسب وحدة التقريب' });
        if (d.retainedRoundNet > 0) warnings.push({ code: 'POOL_ROUNDED', poolName: name, message: 'بقي ' + fromPiastres(d.retainedRoundNet).toFixed(2) + ' ج.م صافٍ من مجمع "' + name + '" دون توزيع لأن كل نصيب من مضاعفات وحدة التقريب' });
        if (bd.declared === 0 && members.length) warnings.push({ code: 'ZERO_BUDGET_POOL', poolName: name, message: 'مجمع "' + name + '" بلا مبلغ — أعضاؤه المثبّتون لن يحصلوا على شيء منه' });
        if (d.retainedCapNet > 0) warnings.push({ code: 'CAP_RETAINED', poolName: name, message: 'بقي ' + fromPiastres(d.retainedCapNet).toFixed(2) + ' ج.م من مجمع "' + name + '" دون توزيع لأن كل أعضائه بلغوا الحد الأقصى' });
      }
      if (wf.count > 0) warnings.push({ code: 'CAP_APPLIED', message: wf.count + ' شخص بلغ الحد الأقصى للصافي، ووُزّع الفائض على الباقين' });

      var out = new Array(entries.length), tot = { declared: 0, gross: 0, tax: 0, net: 0, retained: 0, adjust: 0 };
      var assignment = {};
      for (var ei = 0; ei < entries.length; ei++) {
        var en = entries[ei], id = en.person.id, parts = personParts[id] || [];
        var g = 0, t = 0, nn = 0;
        parts.forEach(function (x) { g += x.grossPiastres; t += x.taxPiastres; nn += x.netPiastres; });
        var single = parts.length === 1 ? parts[0].pool : null;
        if (single) assignment[id] = single;
        var dw = wf.dist[id] || 0;
        out[ei] = {
          id: id,
          pool: single,
          pools: parts.map(function (x) { return x.pool; }),
          multi: parts.length > 1,
          parts: parts,
          weight: en.b.weight,
          distWeight: dw,
          capped: !!(wf.capped[id] || cappedIds[id]),
          shareOfPoolWeight: single && poolResults[single].actualWeight > 0 ? dw / poolResults[single].actualWeight : 0,
          grossPiastres: g,
          taxPiastres: t,
          netPiastres: nn,
          idealNetEGP: dw > 0 ? wf.kPi * dw / 100 : 0,
          unresolvedTier: !en.b.excluded && en.b.unresolved,
          excluded: en.b.excluded,
          breakdown: en.b
        };
        if (out[ei].netPiastres < 0 || out[ei].taxPiastres < 0) throw { code: 'NEGATIVE_AMOUNT', message: 'مبلغ سالب لصف ' + id };
        if (capPi != null && o.roundingTarget === 'net' && nn > capPi) throw { code: 'CAP_VIOLATED', message: 'تجاوز الحد الأقصى لصف ' + id };
      }

      poolNames.forEach(function (name) {
        var pr = poolResults[name], gs = 0, ts = 0, ns = 0;
        out.forEach(function (r) { r.parts.forEach(function (x) { if (x.pool === name) { gs += x.grossPiastres; ts += x.taxPiastres; ns += x.netPiastres; } }); });
        var bad = gs !== pr.grossPiastres || ts !== pr.taxPiastres || ns !== pr.netPiastres || gs - ts !== ns ||
          pr.grossPiastres + pr.retainedPiastres !== pr.declaredPiastres + pr.adjustPiastres || pr.retainedPiastres < 0;
        if (bad) throw { code: 'CONSERVATION_FAILED', message: 'فشل فحص حفظ القيمة في مجمع "' + name + '"' };
        tot.declared += pr.declaredPiastres; tot.gross += gs; tot.tax += ts; tot.net += ns; tot.retained += pr.retainedPiastres; tot.adjust += pr.adjustPiastres;
      });

      return {
        ok: true,
        engineVersion: ENGINE_VERSION,
        options: o,
        k: W > 0 ? (N / W) / 100 : 0,
        kEffective: wf.kPi / 100,
        W: W,
        Wd: Wd,
        N: fromPiastres(N),
        NPiastres: N,
        poolResults: poolResults,
        people: out,
        assignment: assignment,
        warnings: warnings,
        unresolvedTierIds: unresolvedIds,
        cappedCount: Object.keys(cappedIds).length || wf.count,
        totals: tot,
        meta: { timingMs: now() - t0, converged: assignMeta.converged, passes: assignMeta.passes }
      };
    } catch (e) {
      return { ok: false, errors: [{ code: (e && e.code) || 'INTERNAL_ERROR', message: (e && e.message) || 'خطأ داخلي غير متوقع في محرك الحساب', detail: String(e && e.stack || '') }], warnings: [], options: o };
    }
  }

  return {
    VERSION: ENGINE_VERSION,
    ROUNDING_STEPS: ROUNDING_STEPS,
    DEFAULT_OPTIONS: DEFAULT_OPTIONS,
    normalizeArabic: normalizeArabic,
    normalizeLoose: normalizeLoose,
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
