var Model = (function () {
  'use strict';
  var isNum = Engine.isNum;

  function defaultTiers() {
    return { 'مدير إدارة': 979, 'مدير': 750, 'رئيس قسم': 534, 'عضو مميز': 494, 'شهادة عليا': 445, 'فوق متوسط': 400, 'متوسط': 356, 'معاون خدمة': 303 };
  }
  function defaultPools() {
    return {
      'طوابع المواليد': { gross: 185000, taxRate: 0.11 },
      'طوابع اللجان الطبية': { gross: 142000, taxRate: 0.240938 },
      'نماذج استمارات 111': { gross: 97500, taxRate: 0.240938 }
    };
  }
  function num(v, fallback) {
    if (isNum(v)) return v;
    var n = Fmt.parseNumber(v);
    return n == null ? fallback : n;
  }
  function str(v) { return v == null ? '' : String(v).trim(); }

  function person(p, id) {
    p = p || {};
    var out = {
      id: p.id != null && p.id !== '' ? p.id : id,
      code: str(p.code),
      name: str(p.name),
      job: str(p.job),
      dept: str(p.dept),
      tier: str(p.tier),
      daysWorked: num(p.daysWorked, null),
      penaltyRate: num(p.penaltyRate, null),
      manualFactor: num(p.manualFactor, null),
      overrideValue: num(p.overrideValue, null),
      pinnedPool: p.pinnedPool == null || p.pinnedPool === '' ? null : String(p.pinnedPool),
      excluded: p.excluded === true || p.excluded === 1 || (typeof p.excluded === 'string' && Fmt.parseBool(p.excluded)),
      notes: str(p.notes)
    };
    return out;
  }
  function people(list) {
    if (!Array.isArray(list)) return [];
    var seen = Object.create(null), maxId = 0;
    list.forEach(function (p) { if (p && typeof p.id === 'number' && p.id > maxId) maxId = p.id; });
    return list.filter(function (p) { return p && typeof p === 'object'; }).map(function (p, i) {
      var q = person(p, i + 1);
      var key = typeof q.id + ':' + q.id;
      if (seen[key]) { maxId++; q.id = maxId; key = 'number:' + q.id; }
      seen[key] = true;
      return q;
    });
  }
  function tiers(obj) {
    var out = {};
    if (!obj || typeof obj !== 'object') return out;
    Object.keys(obj).forEach(function (k) {
      var name = str(k);
      var v = num(obj[k], null);
      if (name && v != null && v >= 0) out[name] = v;
    });
    return out;
  }
  function pools(obj) {
    var out = {};
    if (!obj || typeof obj !== 'object') return out;
    Object.keys(obj).forEach(function (k) {
      var name = str(k), p = obj[k] || {};
      if (!name) return;
      var g = num(p.gross, 0), t = num(p.taxRate, 0);
      out[name] = { gross: g < 0 ? 0 : g, taxRate: Engine.clamp(t, 0, 0.9999) };
      if (p.note) out[name].note = str(p.note);
    });
    return out;
  }
  function options(o) {
    var n = Engine.normalizeOptions(o);
    return { roundingStep: n.roundingStep, roundingTarget: n.roundingTarget, allocation: n.allocation, weighting: n.weighting, attendance: n.attendance, capNet: n.capNet };
  }
  function aliases(obj) {
    var out = {};
    if (!obj || typeof obj !== 'object') return out;
    Object.keys(obj).forEach(function (k) { if (k && obj[k]) out[Engine.normalizeForTierMatch(k)] = String(obj[k]); });
    return out;
  }
  function periodDays(v) {
    var n = num(v, 30);
    n = Math.round(n);
    return n >= 1 && n <= 366 ? n : 30;
  }
  function ui(u) {
    u = u || {};
    var per = Number(u.rowsPerPage);
    return {
      density: u.density === 'compact' ? 'compact' : 'normal',
      rowsPerPage: [25, 50, 100, 250, 500].indexOf(per) !== -1 ? per : 100,
      tableDetail: u.tableDetail === 'full' ? 'full' : 'simple',
      theme: u.theme === 'light' || u.theme === 'dark' ? u.theme : 'system',
      motion: u.motion === 'reduced' ? 'reduced' : 'full',
      confirmDanger: u.confirmDanger !== false,
      hints: u.hints !== false
    };
  }
  return { defaultTiers: defaultTiers, defaultPools: defaultPools, person: person, people: people, tiers: tiers, pools: pools, options: options, aliases: aliases, periodDays: periodDays, ui: ui };
})();

var DemoData = (function () {
  'use strict';
  var FIRST = ['أحمد', 'محمد', 'محمود', 'مصطفى', 'خالد', 'عمر', 'يوسف', 'كريم', 'طارق', 'هاني', 'سمير', 'وليد', 'فادي', 'عادل', 'ماهر', 'إسلام', 'زياد', 'أنس', 'بلال', 'حسن', 'فاطمة', 'مريم', 'نور', 'سارة', 'هدى', 'أمنية', 'رنا', 'دينا', 'ياسمين', 'شيماء', 'منى', 'إيمان', 'ندى', 'سلمى', 'حبيبة'];
  var LAST = ['عبد الرحمن', 'السيد', 'حسين', 'إبراهيم', 'الشريف', 'منصور', 'فؤاد', 'الجندي', 'رشاد', 'زكي', 'العطار', 'شلبي', 'البهنساوي', 'الديب', 'قنديل', 'صابر', 'مرسي', 'الحلواني', 'نصار', 'عويس'];
  var DEPTS = ['الإدارة العامة', 'إدارة الحسابات', 'إدارة الشئون الطبية', 'إدارة الموارد البشرية', 'إدارة السجلات', 'إدارة المشتريات'];
  var TIERS = ['مدير إدارة', 'مدير', 'رئيس قسم', 'عضو مميز', 'شهادة عليا', 'فوق متوسط', 'متوسط', 'معاون خدمة'];
  var TIER_JOB = { 'مدير إدارة': 'مدير عام الإدارة', 'مدير': 'مدير الإدارة', 'رئيس قسم': 'رئيس قسم', 'عضو مميز': 'أخصائي أول', 'شهادة عليا': 'أخصائي', 'فوق متوسط': 'فني أول', 'متوسط': 'فني', 'معاون خدمة': 'معاون خدمة' };
  var TIER_SHARE = [0.02, 0.05, 0.09, 0.12, 0.18, 0.2, 0.22, 0.12];
  function pickTier(u) {
    var acc = 0;
    for (var i = 0; i < TIERS.length; i++) { acc += TIER_SHARE[i]; if (u < acc) return TIERS[i]; }
    return TIERS[TIERS.length - 1];
  }
  function makeRng(seed) {
    var s = seed || 20260807;
    return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  }
  function people(count, seed) {
    var rnd = makeRng(seed), out = [];
    for (var i = 0; i < count; i++) {
      var name = FIRST[Math.floor(rnd() * FIRST.length)] + ' ' + LAST[Math.floor(rnd() * LAST.length)];
      var tier = pickTier(rnd());
      var r = rnd();
      out.push({
        id: i + 1, code: String(10400 + i * 3), name: name, job: TIER_JOB[tier] || '',
        dept: DEPTS[Math.floor(rnd() * DEPTS.length)], tier: tier,
        daysWorked: r < 0.16 ? Math.floor(rnd() * 26) + 1 : null,
        penaltyRate: r > 0.9 ? Math.round(rnd() * 20) / 100 : null,
        manualFactor: null, overrideValue: null, pinnedPool: null, excluded: r > 0.97, notes: ''
      });
    }
    if (out.length > 6) {
      out[3].tier = 'درجة ثالثة'; out[3].job = '';
      out[4].overrideValue = 1800; out[4].notes = 'قيمة مخصصة بقرار اللجنة';
      out[5].manualFactor = 1.25;
    }
    return out;
  }
  return { people: people, DEPTS: DEPTS, TIERS: TIERS, TIER_JOB: TIER_JOB };
})();

var Importer = (function () {
  'use strict';
  var FIELDS = [
    { key: 'name', label: 'الاسم', required: true, hints: ['الاسم', 'اسم', 'name', 'الموظف', 'العامل', 'الاسم رباعي', 'اسم الموظف'] },
    { key: 'code', label: 'الرقم الوظيفي', hints: ['الرقم الوظيفي', 'رقم الموظف', 'الكود', 'كود', 'code', 'employee id', 'الرقم القومي', 'رقم الملف'] },
    { key: 'job', label: 'الوظيفة', hints: ['الوظيفة', 'الوظيفه', 'وظيفة', 'job', 'title', 'المسمى', 'المسمى الوظيفي'] },
    { key: 'dept', label: 'القسم', hints: ['القسم', 'قسم', 'dept', 'department', 'الاداره', 'الإدارة', 'الجهة'] },
    { key: 'tier', label: 'الفئة', required: true, requiredWhen: 'tier', hints: ['الفئة', 'فئة', 'tier', 'category', 'الدرجه', 'الدرجة', 'المستوى', 'grade'] },
    { key: 'daysWorked', label: 'أيام العمل', hints: ['ايام', 'أيام', 'days', 'الحضور', 'ايام العمل', 'عدد الايام'] },
    { key: 'penaltyRate', label: 'نسبة الجزاء', hints: ['نسبة الجزاء', 'جزاء', 'penalty', 'جزاءات', 'خصم العامل', 'خصم الموظف'] },
    { key: 'manualFactor', label: 'المعامل اليدوي', hints: ['معامل', 'factor', 'المعامل'] },
    { key: 'overrideValue', label: 'قيمة مخصصة', hints: ['قيمة مخصصة', 'قيمه مخصصه', 'override', 'قيمة خاصة'] },
    { key: 'pinnedPool', label: 'المجمع المثبّت', hints: ['المجمع', 'مجمع', 'pool', 'مقفول', 'مثبت'] },
    { key: 'excluded', label: 'مستبعد', hints: ['مستبعد', 'استبعاد', 'excluded', 'خارج'] },
    { key: 'notes', label: 'ملاحظات', hints: ['ملاحظات', 'ملاحظة', 'notes', 'note'] }
  ];

  function autoMap(headers) {
    var map = {}, used = {};
    var normHeaders = (headers || []).map(function (h) { return Engine.normalizeForTierMatch(h); });
    [true, false].forEach(function (exact) {
      FIELDS.forEach(function (f) {
        if (map[f.key] != null) return;
        for (var hi = 0; hi < normHeaders.length; hi++) {
          if (used[hi] || !normHeaders[hi]) continue;
          var match = f.hints.some(function (hint) {
            var h = Engine.normalizeForTierMatch(hint);
            return exact ? normHeaders[hi] === h : (' ' + normHeaders[hi] + ' ').indexOf(' ' + h + ' ') !== -1;
          });
          if (match) { map[f.key] = hi; used[hi] = true; return; }
        }
      });
    });
    return map;
  }

  function detectHeaderRow(grid) {
    var limit = Math.min(grid.length, 15), best = 0, bestScore = -1;
    for (var r = 0; r < limit; r++) {
      var row = grid[r] || [];
      var filled = row.filter(function (c) { return c != null && String(c).trim() !== ''; }).length;
      if (filled < 2) continue;
      var m = autoMap(row.map(function (c) { return c == null ? '' : String(c); }));
      var score = Object.keys(m).length * 10 + (m.name != null ? 25 : 0) + (m.tier != null ? 20 : 0) + filled;
      var numeric = row.filter(function (c) { return typeof c === 'number'; }).length;
      score -= numeric * 6;
      if (score > bestScore) { bestScore = score; best = r; }
    }
    return best;
  }

  function detectPenaltyScale(rows, column, preference) {
    if (preference === 'percent') return 100;
    if (preference === 'fraction') return 1;
    if (column == null) return 1;
    for (var i = 0; i < rows.length; i++) {
      var raw = rows[i] && rows[i][column];
      if (raw == null || String(raw).trim() === '') continue;
      if (typeof raw === 'string' && /[%\u066A]/.test(raw)) return 100;
      var n = Fmt.parseNumber(raw);
      if (n != null && Math.abs(n) > 1) return 100;
    }
    return 1;
  }

  function rowToPerson(row, mapping, id, tierNames, poolNames, penaltyScale, aliases) {
    function cell(key) {
      var idx = mapping[key];
      if (idx == null) return null;
      var v = row[idx];
      return (v == null || v === '') ? null : v;
    }
    var rawTier = cell('tier');
    var canonTier = rawTier == null ? null : Engine.canonicalizeTierName(rawTier, tierNames, aliases);
    var rawPool = cell('pinnedPool');
    var canonPool = rawPool == null ? null : Engine.canonicalizeTierName(rawPool, poolNames);
    var pen = Fmt.parseNumber(cell('penaltyRate'));
    return {
      id: id,
      code: cell('code') == null ? '' : String(cell('code')).trim(),
      name: cell('name') == null ? '' : String(cell('name')).replace(/\s+/g, ' ').trim(),
      job: cell('job') == null ? '' : String(cell('job')).trim(),
      dept: cell('dept') == null ? '' : String(cell('dept')).trim(),
      tier: canonTier != null ? canonTier : (rawTier == null ? '' : String(rawTier).trim()),
      daysWorked: Fmt.parseNumber(cell('daysWorked')),
      penaltyRate: pen == null ? null : pen / (penaltyScale || 1),
      manualFactor: Fmt.parseNumber(cell('manualFactor')),
      overrideValue: Fmt.parseNumber(cell('overrideValue')),
      pinnedPool: canonPool,
      unknownPool: rawPool != null && canonPool == null ? String(rawPool).trim() : null,
      excluded: Fmt.parseBool(cell('excluded')),
      notes: cell('notes') == null ? '' : String(cell('notes')).trim()
    };
  }

  function nonEmpty(r) {
    if (!r) return false;
    for (var i = 0; i < r.length; i++) if (r[i] != null && String(r[i]).trim() !== '') return true;
    return false;
  }

  function rowsToPeople(grid, state, mapping, headerRow) {
    var rows = grid || [];
    var hr = headerRow || 0;
    var headers = (rows[hr] || []).map(function (h) { return h == null ? '' : String(h); });
    var map = mapping || autoMap(headers);
    var tierNames = Object.keys((state && state.tiers) || {});
    var poolNames = Object.keys((state && state.pools) || {});
    var body = rows.slice(hr + 1).filter(nonEmpty);
    var penaltyScale = detectPenaltyScale(body, map.penaltyRate, state && state.penaltyScale);
    var people = body.map(function (row, i) {
      return rowToPerson(row, map, i + 1, tierNames, poolNames, penaltyScale, state && state.tierAliases);
    });
    return { headers: headers, mapping: map, people: people, penaltyScale: penaltyScale };
  }

  function readCsv(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    var counts = { ',': 0, ';': 0, '\t': 0 }, quoted = false;
    for (var h = 0; h < text.length && (quoted || text[h] !== '\n'); h++) {
      if (text[h] === '"') { if (quoted && text[h + 1] === '"') h++; else quoted = !quoted; }
      else if (!quoted && Object.prototype.hasOwnProperty.call(counts, text[h])) counts[text[h]]++;
    }
    var delimiter = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];
    var rows = [], row = [], cur = '', inQ = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQ) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
        else cur += ch;
        continue;
      }
      if (ch === '"' && cur === '') { inQ = true; continue; }
      if (ch === delimiter) { row.push(cur); cur = ''; continue; }
      if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; continue; }
      if (ch === '\r') continue;
      cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
  }

  function decodeText(buffer) {
    var bytes = new Uint8Array(buffer);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch (e) {
      try { return new TextDecoder('windows-1256').decode(bytes); }
      catch (e2) { return new TextDecoder('utf-8').decode(bytes); }
    }
  }

  function distinctTiers(grid, headerRow, col) {
    var out = Object.create(null), list = [];
    if (col == null) return list;
    for (var r = (headerRow || 0) + 1; r < grid.length; r++) {
      var row = grid[r];
      if (!nonEmpty(row)) continue;
      var v = row[col];
      var s = v == null ? '' : String(v).trim();
      var key = s ? Engine.normalizeForTierMatch(s) : '';
      if (!out[key]) { out[key] = { raw: s, key: key, count: 0 }; list.push(out[key]); }
      out[key].count++;
    }
    list.sort(function (a, b) { return b.count - a.count; });
    return list;
  }

  return { FIELDS: FIELDS, autoMap: autoMap, detectHeaderRow: detectHeaderRow, detectPenaltyScale: detectPenaltyScale, rowToPerson: rowToPerson, rowsToPeople: rowsToPeople, readCsv: readCsv, decodeText: decodeText, distinctTiers: distinctTiers, nonEmpty: nonEmpty };
})();

var Reports = (function () {
  'use strict';
  function poolNamesOf(state) { return Object.keys(state.pools || {}); }
  function periodDaysOf(state) { return state.periodDays || 30; }
  function resultById(result) {
    var map = Object.create(null);
    ((result && result.people) || []).forEach(function (r) { map[r.id] = r; });
    return map;
  }
  function personById(state) {
    var map = Object.create(null);
    (state.people || []).forEach(function (p) { map[p.id] = p; });
    return map;
  }
  function isSpecial(person) {
    return !!(person.excluded || person.overrideValue != null || person.pinnedPool ||
      (person.manualFactor != null && person.manualFactor !== 1) ||
      (person.penaltyRate != null && person.penaltyRate > 0));
  }
  function specialReason(person, r) {
    var out = [];
    if (person.excluded) out.push('مستبعد');
    if (person.overrideValue != null) out.push('قيمة مخصصة ' + Fmt.egp(person.overrideValue));
    if (person.pinnedPool) out.push('مثبّت على ' + person.pinnedPool);
    if (person.manualFactor != null && person.manualFactor !== 1) out.push('معامل يدوي ' + Fmt.plain(person.manualFactor));
    if (person.penaltyRate != null && person.penaltyRate > 0) out.push('جزاء ' + Fmt.pctExact(person.penaltyRate));
    if (r && r.capped) out.push('بلغ الحد الأقصى');
    return out.join('، ');
  }
  var EMPTY = { netPiastres: 0, grossPiastres: 0, taxPiastres: 0, weight: 0, distWeight: 0, pool: null, pools: [], parts: [], idealNetEGP: 0, unresolvedTier: false, excluded: false, capped: false };

  function detailRows(state, result) {
    var rmap = resultById(result), pd = periodDaysOf(state);
    return (state.people || []).map(function (p) {
      var r = rmap[p.id] || EMPTY;
      var net = r.netPiastres / 100;
      var ideal = r.idealNetEGP || 0;
      return {
        id: p.id, code: p.code || '', name: p.name || '', job: p.job || '', dept: p.dept || '', tier: p.tier || '',
        pool: r.pools && r.pools.length > 1 ? r.pools.join(' + ') : (r.pool || ''),
        pools: r.pools || [], parts: r.parts || [],
        weight: r.weight, days: p.daysWorked == null ? pd : p.daysWorked,
        penalty: p.penaltyRate == null ? 0 : p.penaltyRate,
        manual: p.manualFactor == null ? 1 : p.manualFactor,
        override: p.overrideValue, pinned: p.pinnedPool || '',
        excluded: !!p.excluded, unresolvedTier: !!r.unresolvedTier, capped: !!r.capped,
        gross: r.grossPiastres / 100, tax: r.taxPiastres / 100, net: net,
        grossPiastres: r.grossPiastres, taxPiastres: r.taxPiastres, netPiastres: r.netPiastres,
        ideal: ideal, drift: r.netPiastres > 0 || ideal > 0 ? net - ideal : 0,
        special: isSpecial(p) || !!r.capped, reason: specialReason(p, r), notes: p.notes || ''
      };
    });
  }

  function unresolvedRows(state, result) {
    var pmap = personById(state), pd = periodDaysOf(state);
    return ((result && result.unresolvedTierIds) || []).map(function (id) {
      var p = pmap[id] || { id: id };
      return {
        id: id, code: p.code || '', name: p.name || '', dept: p.dept || '', tier: p.tier || '',
        days: p.daysWorked == null ? pd : p.daysWorked, notes: p.notes || '',
        cause: p.tier ? 'الفئة "' + p.tier + '" غير معرّفة في إعدادات الفئات' : 'لا توجد فئة مُدخلة ولا قيمة مخصصة'
      };
    });
  }
  function excludedRows(state) {
    return (state.people || []).filter(function (p) { return p.excluded; }).map(function (p) {
      return { id: p.id, code: p.code || '', name: p.name || '', dept: p.dept || '', tier: p.tier || '', notes: p.notes || '' };
    });
  }
  function specialCasePeople(state) { return (state.people || []).filter(isSpecial); }
  function specialRows(state, result) {
    var rmap = resultById(result);
    return (state.people || []).filter(function (p) { var r = rmap[p.id]; return isSpecial(p) || (r && r.capped); }).map(function (p) {
      var r = rmap[p.id] || EMPTY;
      return {
        id: p.id, code: p.code || '', name: p.name || '', dept: p.dept || '', tier: p.tier || '',
        pool: r.pools && r.pools.length > 1 ? r.pools.join(' + ') : (r.pool || ''),
        weight: r.weight, net: r.netPiastres / 100, reason: specialReason(p, r), notes: p.notes || ''
      };
    });
  }

  function executiveRows(state, result) {
    var rows = detailRows(state, result);
    var paid = rows.filter(function (r) { return r.netPiastres > 0; });
    var sumP = function (k) { return rows.reduce(function (s, r) { return s + r[k]; }, 0); };
    var totalNet = sumP('netPiastres') / 100, totalGross = sumP('grossPiastres') / 100, totalTax = sumP('taxPiastres') / 100;
    var maxDrift = rows.reduce(function (m, r) { return Math.max(m, Math.abs(r.drift)); }, 0);
    var pools = poolNamesOf(state);
    var declaredGross = pools.reduce(function (s, n) { return s + Engine.toPiastres(state.pools[n].gross); }, 0) / 100;
    var effectiveGross = pools.reduce(function (s, n) {
      var pr = result && result.poolResults && result.poolResults[n];
      return s + (pr ? pr.effectiveGrossPiastres : Engine.toPiastres(state.pools[n].gross));
    }, 0) / 100;
    var retained = pools.reduce(function (s, n) {
      var pr = result && result.poolResults && result.poolResults[n];
      return s + (pr ? pr.retainedPiastres : 0);
    }, 0) / 100;
    var unresolved = unresolvedRows(state, result);
    var nets = paid.map(function (r) { return r.net; }).sort(function (a, b) { return a - b; });
    var median = nets.length ? (nets.length % 2 ? nets[(nets.length - 1) / 2] : (nets[nets.length / 2 - 1] + nets[nets.length / 2]) / 2) : 0;
    var out = [
      { label: 'عدد الأشخاص في الملف', value: rows.length, kind: 'int' },
      { label: 'عدد المستحقين', value: paid.length, kind: 'int' },
      { label: 'عدد المستبعدين يدويًا', value: excludedRows(state).length, kind: 'int' },
      { label: 'عدد بدون فئة (خارج التوزيع)', value: unresolved.length, kind: 'int' },
      { label: 'عدد الحالات الخاصة', value: specialRows(state, result).length, kind: 'int' },
      { label: 'عدد المجمعات', value: pools.length, kind: 'int' },
      { label: 'أيام الفترة', value: periodDaysOf(state), kind: 'int' },
      { label: 'الإجمالي المُدخل', value: declaredGross, kind: 'money' },
      { label: 'الإجمالي بعد التقريب', value: effectiveGross, kind: 'money' },
      { label: 'إجمالي الخصومات', value: totalTax, kind: 'money' },
      { label: 'إجمالي الصافي الموزّع', value: totalNet, kind: 'money' },
      { label: 'مبلغ غير موزّع (تقريب أو حد أقصى)', value: retained, kind: 'money' },
      { label: 'فرق التقريب عن المُدخل', value: effectiveGross - declaredGross, kind: 'money' },
      { label: 'أعلى صافٍ فردي', value: nets.length ? nets[nets.length - 1] : 0, kind: 'money' },
      { label: 'أقل صافٍ فردي (للمستحقين)', value: nets.length ? nets[0] : 0, kind: 'money' },
      { label: 'الوسيط', value: median, kind: 'money' },
      { label: 'أقصى انحراف فردي عن المثالي', value: maxDrift, kind: 'money' },
      { label: 'نصيب وحدة الوزن k', value: (result && result.kEffective) || 0, kind: 'rate' },
      { label: 'مجموع الأوزان W', value: (result && result.W) || 0, kind: 'rate' }
    ];
    out.__totals = { totalNet: totalNet, totalGross: totalGross, totalTax: totalTax, effectiveGross: effectiveGross, declaredGross: declaredGross, retained: retained, unresolved: unresolved.length, paid: paid.length, median: median, maxDrift: maxDrift };
    return out;
  }

  function poolRows(state, result) {
    return poolNamesOf(state).map(function (name) {
      var pr = (result && result.poolResults && result.poolResults[name]) || {};
      var gross = state.pools[name].gross;
      return {
        name: name, gross: gross,
        effectiveGross: pr.effectiveGross == null ? gross : pr.effectiveGross,
        taxRate: state.pools[name].taxRate,
        tax: (pr.taxPiastres || 0) / 100,
        net: (pr.netPiastres || 0) / 100,
        retained: (pr.retainedPiastres || 0) / 100,
        members: pr.memberCount || 0,
        targetWeight: pr.targetWeight || 0,
        actualWeight: pr.actualWeight || 0,
        deviation: pr.deviation,
        kPool: pr.kPool,
        capped: pr.cappedCount || 0,
        zeroBudget: !!pr.zeroBudgetWithMembers,
        rounded: !!pr.roundingAdjusted
      };
    });
  }

  function groupRows(state, result, key, emptyLabel) {
    var rows = detailRows(state, result);
    var by = Object.create(null);
    rows.forEach(function (r) {
      var k = r[key] || emptyLabel;
      if (!by[k]) by[k] = { key: k, count: 0, paid: 0, weight: 0, gross: 0, tax: 0, net: 0, gP: 0, tP: 0, nP: 0, unresolved: 0, excluded: 0 };
      var b = by[k];
      b.count++;
      if (r.netPiastres > 0) b.paid++;
      if (r.unresolvedTier) b.unresolved++;
      if (r.excluded) b.excluded++;
      b.weight += r.weight;
      b.gP += r.grossPiastres; b.tP += r.taxPiastres; b.nP += r.netPiastres;
    });
    return Object.keys(by).map(function (k) {
      var b = by[k];
      b.gross = b.gP / 100; b.tax = b.tP / 100; b.net = b.nP / 100;
      b.avg = b.paid ? b.net / b.paid : 0;
      return b;
    }).sort(function (a, b) { return (b.nP - a.nP) || Sorter.compareValues(a.key, b.key); });
  }
  function deptRows(state, result) {
    return groupRows(state, result, 'dept', 'بدون قسم').map(function (b) { b.dept = b.key; return b; });
  }
  function tierRows(state, result) {
    var tiers = state.tiers || {};
    return groupRows(state, result, 'tier', 'بدون فئة').map(function (b) { b.tier = b.key; b.base = tiers[b.key] != null ? tiers[b.key] : null; return b; });
  }

  function methodologyRows(state, result) {
    var o = Engine.normalizeOptions(state.options);
    var pools = poolRows(state, result);
    var rows = [
      ['طريقة الوزن', o.weighting === 'equal' ? 'بالتساوي: كل شخص وزنه 1 × نسبة الحضور × (1 − الجزاء) × المعامل اليدوي' : 'حسب الفئة: قيمة الفئة (أو القيمة المخصصة) × نسبة الحضور × (1 − الجزاء) × المعامل اليدوي'],
      ['الحضور', o.attendance === 'ignore' ? 'لا يؤثر عدد الأيام على الوزن' : 'نسبة الحضور = أيام العمل ÷ أيام الفترة'],
      ['التوزيع على المجمعات', o.allocation === 'split' ? 'كل شخص يأخذ من كل المجمعات الممولة بنفس النسبة — نصيب الوحدة متساوٍ تمامًا' : 'كل شخص في مجمع واحد، والمحرك يوازن الأوزان بين المجمعات ليتقارب نصيب الوحدة'],
      ['وحدة الحساب', 'قرش صحيح — كل المبالغ أعداد صحيحة بلا كسور عائمة'],
      ['وحدة التقريب', String(o.roundingStep) + ' قرش — تُطبَّق على ' + (o.roundingTarget === 'net' ? 'الصافي المستلم' : 'الإجمالي قبل الخصم')],
      ['الحد الأقصى للصافي', o.capNet ? Fmt.egp(o.capNet) + ' ج.م للفرد، والفائض يُعاد توزيعه على الباقين' : 'بلا حد'],
      ['توزيع البواقي', 'أكبر باقٍ، ثم الوزن الأكبر، ثم رقم الصف — نتيجة واحدة ثابتة لنفس المدخلات'],
      ['حفظ القيمة', 'مجموع الإجمالي والخصم والصافي لكل مجمع يطابق المجمع بالقرش، وأي مبلغ غير موزّع يُسجَّل صراحةً'],
      ['الفئات غير المعروفة', 'يُستبعد الشخص من التوزيع ويظهر في ورقة «بدون فئة» ولا يحصل على أي مبلغ'],
      ['أيام الفترة', String(periodDaysOf(state)) + ' يوم'],
      ['نصيب وحدة الوزن k', Fmt.egp((result && result.kEffective) || 0, 4) + ' جنيه صافٍ لكل وحدة وزن'],
      ['مجموع الأوزان W', Fmt.egp((result && result.W) || 0, 4)],
      ['إصدار المحرك', String(Engine.VERSION)]
    ];
    pools.forEach(function (p) {
      rows.push(['مجمع: ' + p.name,
        'مُدخل ' + Fmt.egp(p.gross) + (p.effectiveGross !== p.gross ? ' → بعد التقريب ' + Fmt.egp(p.effectiveGross) : '') +
        ' | خصم ' + Fmt.pctExact(p.taxRate) + ' | صافٍ موزّع ' + Fmt.egp(p.net) + (p.retained ? ' | غير موزّع ' + Fmt.egp(p.retained) : '') +
        ' | أعضاء ' + Fmt.int(p.members) + (p.zeroBudget ? ' | بلا مبلغ' : '')]);
    });
    return rows;
  }

  var WARN_KIND = {
    MISSING_NAME: 'صف بدون اسم', DUPLICATE_NAME: 'اسم مكرر', UNRESOLVED_TIER: 'بدون فئة — خارج التوزيع',
    BAD_PENALTY: 'نسبة جزاء غير صالحة', BAD_DAYS: 'أيام عمل خارج النطاق', BAD_MANUAL_FACTOR: 'معامل يدوي غير صالح',
    NEGATIVE_OVERRIDE: 'قيمة مخصصة سالبة', OVERRIDE_IGNORED: 'قيم مخصصة متجاهلة', ZERO_WEIGHT: 'وزن صفر',
    POOL_ROUNDED: 'أثر التقريب', ZERO_BUDGET_POOL: 'مجمع بلا مبلغ', CAP_APPLIED: 'تطبيق الحد الأقصى', CAP_RETAINED: 'مبلغ محتجز بالحد الأقصى'
  };
  function warningRows(result) {
    return ((result && result.warnings) || []).map(function (w) {
      return { code: w.code, kind: WARN_KIND[w.code] || w.code, personId: w.personId, target: w.personId != null ? ('صف ' + w.personId) : (w.poolName || '—'), message: w.message };
    });
  }

  function conservationCheck(state, result) {
    var problems = [];
    poolNamesOf(state).forEach(function (name) {
      var pr = result && result.poolResults && result.poolResults[name];
      if (!pr) return;
      var gross = 0, tax = 0, net = 0;
      (result.people || []).forEach(function (r) {
        (r.parts || []).forEach(function (x) { if (x.pool === name) { gross += x.grossPiastres; tax += x.taxPiastres; net += x.netPiastres; } });
      });
      var expectedGross = pr.effectiveGrossPiastres - (pr.retainedPiastres || 0);
      if (gross !== expectedGross || tax !== pr.taxPiastres || net !== gross - tax) {
        problems.push({ pool: name, expected: expectedGross, actual: gross, expectedTax: pr.taxPiastres, actualTax: tax, actualNet: net });
      }
    });
    return { ok: problems.length === 0, problems: problems };
  }

  function compareToBaseline(state, result, baseline) {
    if (!baseline || !baseline.nets) return null;
    var rows = detailRows(state, result);
    var up = 0, down = 0, same = 0, added = 0, delta = 0, map = Object.create(null);
    rows.forEach(function (r) {
      var b = baseline.nets[r.id];
      if (b == null) { added++; map[r.id] = null; return; }
      var d = r.netPiastres - b;
      map[r.id] = d;
      delta += d;
      if (d > 0) up++; else if (d < 0) down++; else same++;
    });
    return { up: up, down: down, same: same, added: added, deltaPiastres: delta, byId: map, label: baseline.label, at: baseline.at, totalNet: baseline.totalNet };
  }

  return {
    detailRows: detailRows, executiveRows: executiveRows, poolRows: poolRows, deptRows: deptRows, tierRows: tierRows,
    specialRows: specialRows, specialCasePeople: specialCasePeople, unresolvedRows: unresolvedRows, excludedRows: excludedRows,
    methodologyRows: methodologyRows, warningRows: warningRows, conservationCheck: conservationCheck,
    isSpecial: isSpecial, specialReason: specialReason, compareToBaseline: compareToBaseline, WARN_KIND: WARN_KIND
  };
})();

var Exporter = (function () {
  'use strict';
  var M2 = '#,##0.00', M4 = '#,##0.0000', PCT = '0.00%', INT = '#,##0';

  function sanitizeSheetName(name, used) {
    var s = String(name == null ? 'ورقة' : name).replace(/[\\\/\?\*\[\]:]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) s = 'ورقة';
    if (s.length > 31) s = s.slice(0, 31);
    if (!used) return s;
    var base = s, n = 2;
    while (used[s]) {
      var suffix = ' (' + n + ')';
      s = base.slice(0, Math.max(1, 31 - suffix.length)) + suffix;
      n++;
    }
    used[s] = true;
    return s;
  }
  function aoaSheet(rows, opts) {
    opts = opts || {};
    var ws = XLSX.utils.aoa_to_sheet(rows);
    if (!ws['!ref']) return ws;
    var range = XLSX.utils.decode_range(ws['!ref']);
    var headerRows = opts.headerRows == null ? 1 : opts.headerRows;
    var formats = opts.formats || {};
    for (var c = range.s.c; c <= range.e.c; c++) {
      var fmt = formats[c];
      if (!fmt) continue;
      for (var r = range.s.r + headerRows; r <= range.e.r; r++) {
        var cell = ws[XLSX.utils.encode_cell({ r: r, c: c })];
        if (cell && typeof cell.v === 'number') cell.z = fmt;
      }
    }
    if (opts.widths) ws['!cols'] = opts.widths.map(function (w) { return { wch: w }; });
    else {
      var cols = [];
      for (var cc = range.s.c; cc <= range.e.c; cc++) {
        var max = 8;
        for (var rr = range.s.r; rr <= Math.min(range.e.r, range.s.r + 400); rr++) {
          var a = ws[XLSX.utils.encode_cell({ r: rr, c: cc })];
          var len = String(a && a.v != null ? a.v : '').length;
          if (len > max) max = len;
        }
        cols.push({ wch: Math.min(44, max + 2) });
      }
      ws['!cols'] = cols;
    }
    if (opts.autofilter !== false && headerRows > 0 && range.e.r > range.s.r + headerRows - 1) {
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: range.s.r + headerRows - 1, c: range.s.c }, e: { r: range.e.r, c: range.e.c } }) };
    }
    return ws;
  }
  function addSheet(wb, used, name, rows, opts) {
    if (!rows || rows.length === 0) return;
    XLSX.utils.book_append_sheet(wb, aoaSheet(rows, opts), sanitizeSheetName(name, used));
  }
  function newWorkbook(meta) {
    var wb = XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] };
    wb.Props = { Title: (meta && meta.title) || APP_NAME, Author: APP_NAME_LATIN + ' ' + APP_VERSION, CreatedDate: new Date() };
    return wb;
  }
  function kindFormat(kind) { return kind === 'money' ? M2 : (kind === 'rate' ? M4 : INT); }

  function sheetExec(wb, used, state, result, meta) {
    var exec = Reports.executiveRows(state, result);
    var rows = [['البيان', 'القيمة']];
    if (meta && meta.title) rows.push(['العنوان', meta.title]);
    if (state.period) rows.push(['الفترة', state.period]);
    exec.forEach(function (r) { rows.push([r.label, r.value]); });
    rows.push([]);
    rows.push(['التقرير أُنتج في', Fmt.humanTime(meta && meta.at)]);
    rows.push(['إصدار التطبيق', (meta && meta.version) || APP_VERSION]);
    rows.push(['نطاق التقرير', 'كل الأشخاص في الملف — لا تتأثر أرقام هذا التقرير بأي بحث أو تصفية على الشاشة']);
    if (exec.__totals.unresolved > 0) {
      rows.push([]);
      rows.push(['تنبيه مسؤولية', 'يوجد ' + exec.__totals.unresolved + ' شخص بدون فئة معروفة. تم استبعادهم من التوزيع ولم يحصلوا على أي مبلغ. راجع ورقة «بدون فئة».']);
    }
    var ws = aoaSheet(rows, { widths: [40, 24], autofilter: false });
    exec.forEach(function (r, i) {
      var cell = ws[XLSX.utils.encode_cell({ r: i + 1 + (meta && meta.title ? 1 : 0) + (state.period ? 1 : 0), c: 1 })];
      if (cell && typeof cell.v === 'number') cell.z = kindFormat(r.kind);
    });
    XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName('الملخص التنفيذي', used));
  }
  function sheetPools(wb, used, state, result) {
    var hdr = ['المجمع', 'الإجمالي المُدخل', 'الإجمالي بعد التقريب', 'نسبة الخصم', 'الخصم', 'الصافي الموزّع', 'غير موزّع', 'عدد الأعضاء', 'نصيب وحدة الوزن', 'الانحراف', 'ملاحظة'];
    var body = Reports.poolRows(state, result).map(function (p) {
      var notes = [];
      if (p.zeroBudget) notes.push('بلا مبلغ');
      if (p.rounded) notes.push('تأثّر بالتقريب');
      if (p.capped) notes.push(p.capped + ' بلغوا الحد الأقصى');
      return [p.name, p.gross, p.effectiveGross, p.taxRate, p.tax, p.net, p.retained, p.members, p.kPool == null ? '' : p.kPool, p.deviation == null ? '' : p.deviation, notes.join(' | ')];
    });
    addSheet(wb, used, 'المجمعات', [hdr].concat(body), { formats: { 1: M2, 2: M2, 3: PCT, 4: M2, 5: M2, 6: M2, 7: INT, 8: M4, 9: PCT } });
  }
  var DET_HDR = ['#', 'الرقم الوظيفي', 'الاسم', 'الوظيفة', 'القسم', 'الفئة', 'المجمع', 'الوزن', 'الأيام', 'الجزاء', 'المعامل', 'قيمة مخصصة', 'مثبّت على', 'مستبعد', 'بدون فئة', 'الإجمالي', 'الخصم', 'الصافي', 'الصافي المثالي', 'الفرق', 'حالة خاصة', 'السبب', 'ملاحظات'];
  var DET_FMT = { 0: INT, 7: M4, 8: INT, 9: PCT, 10: M4, 11: M2, 15: M2, 16: M2, 17: M2, 18: M2, 19: M2 };
  function detRow(r) {
    return [r.id, r.code, r.name, r.job, r.dept, r.tier, r.pool, r.weight, r.days, r.penalty, r.manual,
      r.override == null ? '' : r.override, r.pinned, r.excluded ? 'نعم' : '', r.unresolvedTier ? 'نعم' : '',
      r.gross, r.tax, r.net, Math.round(r.ideal * 100) / 100, Math.round(r.drift * 100) / 100, r.special ? 'نعم' : '', r.reason, r.notes];
  }
  function totalRow(body, cols, width) {
    var t = [];
    for (var i = 0; i < width; i++) t.push('');
    t[0] = 'الإجمالي';
    cols.forEach(function (c) { t[c] = Math.round(body.reduce(function (s, r) { return s + (Number(r[c]) || 0) * 100; }, 0)) / 100; });
    return t;
  }
  function sheetDetail(wb, used, state, result) {
    var body = Reports.detailRows(state, result).map(detRow);
    addSheet(wb, used, 'التفصيل الكامل', [DET_HDR].concat(body).concat([totalRow(body, [15, 16, 17], DET_HDR.length)]), { formats: DET_FMT });
  }
  function sheetPayroll(wb, used, state, result) {
    var rows = Reports.detailRows(state, result).filter(function (r) { return r.netPiastres > 0; });
    var hdr = ['م', 'الرقم الوظيفي', 'الاسم', 'القسم', 'الصافي المستحق', 'التوقيع'];
    var body = rows.map(function (r, i) { return [i + 1, r.code, r.name, r.dept, r.net, '']; });
    var tot = ['', '', 'الإجمالي (' + rows.length + ')', '', Math.round(rows.reduce(function (s, r) { return s + r.netPiastres; }, 0)) / 100, ''];
    addSheet(wb, used, 'كشف الصرف', [hdr].concat(body).concat([tot]), { formats: { 0: INT, 4: M2 }, widths: [6, 14, 32, 24, 16, 22] });
  }
  function sheetUnresolved(wb, used, state, result) {
    var list = Reports.unresolvedRows(state, result);
    if (!list.length) return;
    var hdr = ['#', 'الرقم الوظيفي', 'الاسم', 'القسم', 'الفئة المُدخلة', 'الأيام', 'سبب الاستبعاد', 'ملاحظات', 'قرار المستخدم'];
    var body = list.map(function (r) { return [r.id, r.code, r.name, r.dept, r.tier, r.days, r.cause, r.notes, '']; });
    addSheet(wb, used, 'بدون فئة', [hdr].concat(body), { formats: { 0: INT, 5: INT } });
  }
  function sheetSpecial(wb, used, state, result) {
    var list = Reports.specialRows(state, result);
    if (!list.length) return;
    var hdr = ['#', 'الرقم الوظيفي', 'الاسم', 'القسم', 'الفئة', 'المجمع', 'الوزن', 'الصافي', 'سبب الحالة الخاصة', 'ملاحظات'];
    var body = list.map(function (r) { return [r.id, r.code, r.name, r.dept, r.tier, r.pool, r.weight, r.net, r.reason, r.notes]; });
    addSheet(wb, used, 'الحالات الخاصة', [hdr].concat(body), { formats: { 0: INT, 6: M4, 7: M2 } });
  }
  function groupSheet(wb, used, name, first, list) {
    var hdr = [first, 'العدد', 'المستحقون', 'مستبعدون', 'بدون فئة', 'مجموع الأوزان', 'الإجمالي', 'الخصم', 'الصافي', 'متوسط الصافي'];
    var body = list.map(function (d) { return [d.key, d.count, d.paid, d.excluded, d.unresolved, d.weight, d.gross, d.tax, d.net, d.avg]; });
    var tot = ['الإجمالي'];
    for (var c = 1; c <= 8; c++) tot.push(Math.round(body.reduce(function (s, r) { return s + r[c] * (c >= 6 ? 100 : 1); }, 0)) / (c >= 6 ? 100 : 1));
    tot.push('');
    addSheet(wb, used, name, [hdr].concat(body).concat([tot]), { formats: { 1: INT, 2: INT, 3: INT, 4: INT, 5: M4, 6: M2, 7: M2, 8: M2, 9: M2 } });
  }
  function sheetDept(wb, used, state, result) { groupSheet(wb, used, 'حسب القسم', 'القسم', Reports.deptRows(state, result)); }
  function sheetTier(wb, used, state, result) { groupSheet(wb, used, 'حسب الفئة', 'الفئة', Reports.tierRows(state, result)); }
  function sheetWarnings(wb, used, state, result) {
    var warns = Reports.warningRows(result);
    if (!warns.length) return;
    addSheet(wb, used, 'التنبيهات', [['النوع', 'الهدف', 'الرسالة', 'الرمز']].concat(warns.map(function (w) { return [w.kind, w.target, w.message, w.code]; })), { widths: [26, 14, 80, 22] });
  }
  function sheetMethodology(wb, used, state, result) {
    addSheet(wb, used, 'المنهجية', [['البند', 'التفصيل']].concat(Reports.methodologyRows(state, result)), { widths: [28, 110], autofilter: false });
  }
  function addPoolSheet(wb, used, state, result, poolName) {
    var rows = Reports.detailRows(state, result).filter(function (r) { return r.pools.indexOf(poolName) !== -1; });
    if (!rows.length) return;
    var hdr = ['#', 'الرقم الوظيفي', 'الاسم', 'القسم', 'الفئة', 'الوزن', 'الأيام', 'الجزاء', 'المعامل', 'قيمة مخصصة', 'مثبّت', 'الإجمالي من المجمع', 'الخصم', 'الصافي من المجمع', 'حالة خاصة', 'ملاحظات'];
    var body = rows.map(function (r) {
      var part = r.parts.filter(function (x) { return x.pool === poolName; })[0] || { grossPiastres: 0, taxPiastres: 0, netPiastres: 0 };
      return [r.id, r.code, r.name, r.dept, r.tier, r.weight, r.days, r.penalty, r.manual, r.override == null ? '' : r.override, r.pinned ? 'نعم' : '',
        part.grossPiastres / 100, part.taxPiastres / 100, part.netPiastres / 100, r.special ? r.reason : '', r.notes];
    });
    addSheet(wb, used, poolName, [hdr].concat(body).concat([totalRow(body, [11, 12, 13], hdr.length)]), { formats: { 0: INT, 5: M4, 6: INT, 7: PCT, 8: M4, 9: M2, 11: M2, 12: M2, 13: M2 } });
  }
  var BASE = [
    { key: 'exec', label: 'الملخص التنفيذي', run: sheetExec },
    { key: 'pools', label: 'المجمعات', run: sheetPools },
    { key: 'detail', label: 'التفصيل الكامل', run: sheetDetail },
    { key: 'payroll', label: 'كشف الصرف', run: sheetPayroll },
    { key: 'unresolved', label: 'بدون فئة', run: sheetUnresolved },
    { key: 'special', label: 'الحالات الخاصة', run: sheetSpecial },
    { key: 'dept', label: 'حسب القسم', run: sheetDept },
    { key: 'tier', label: 'حسب الفئة', run: sheetTier },
    { key: 'warnings', label: 'التنبيهات', run: sheetWarnings },
    { key: 'methodology', label: 'المنهجية', run: sheetMethodology }
  ];
  function sheetRegistry(state) {
    var reg = BASE.slice();
    Object.keys(state.pools || {}).forEach(function (poolName) {
      reg.push({ key: 'pool:' + poolName, label: poolName, pool: true, run: function (wb, used, st, result) { addPoolSheet(wb, used, st, result, poolName); } });
    });
    return reg;
  }
  function buildFullReport(state, result, meta) {
    var wb = newWorkbook(meta), used = Object.create(null);
    sheetRegistry(state).forEach(function (b) { b.run(wb, used, state, result, meta || {}); });
    return wb;
  }
  function buildSelectedReport(state, result, meta, keys) {
    var wb = newWorkbook(meta), used = Object.create(null);
    sheetRegistry(state).forEach(function (b) { if (keys.indexOf(b.key) !== -1) b.run(wb, used, state, result, meta || {}); });
    return wb;
  }
  function buildViewExport(view, meta) {
    var wb = newWorkbook(meta), used = Object.create(null);
    var hdr = view.columns.map(function (c) { return c.label; });
    var body = view.rows.map(function (r) { return view.columns.map(function (c) { var v = c.get(r); return v == null ? '' : v; }); });
    var formats = {};
    var head = [['عرض مخصص من ' + (meta.title || APP_NAME)], ['الفترة: ' + (meta.period || '—')], ['تاريخ التصدير: ' + Fmt.humanTime(meta.at)]];
    var lines = view.filterLines || [];
    if (!lines.length) head.push(['بلا تصفية — كامل البيانات']); else lines.forEach(function (L) { head.push([L]); });
    head.push([]);
    view.columns.forEach(function (c, i) { if (c.format) formats[i] = c.format; });
    var moneyCols = [];
    view.columns.forEach(function (c, i) { if (c.format === M2 && c.sum !== false) moneyCols.push(i); });
    var rows = head.concat([hdr]).concat(body);
    if (moneyCols.length) {
      var t = totalRow(body, moneyCols, hdr.length);
      t[0] = 'إجمالي هذا العرض (' + view.rows.length + ' صفًا)';
      rows.push(t);
    }
    rows.push(['للاطلاع — الإجماليات الرسمية في التقرير الكامل']);
    addSheet(wb, used, 'العرض الحالي', rows, { headerRows: head.length + 1, formats: formats });
    return wb;
  }
  var TEMPLATE_HDR = ['الرقم الوظيفي', 'الاسم', 'الوظيفة', 'القسم', 'الفئة', 'أيام العمل', 'نسبة الجزاء', 'المعامل اليدوي', 'قيمة مخصصة', 'المجمع المثبّت', 'مستبعد', 'ملاحظات'];
  function templateRows(state, mode) {
    var body;
    if (mode === 'current') {
      body = (state.people || []).map(function (p) {
        return [p.code || '', p.name || '', p.job || '', p.dept || '', p.tier || '',
          p.daysWorked == null ? '' : p.daysWorked, p.penaltyRate == null ? '' : p.penaltyRate,
          p.manualFactor == null ? '' : p.manualFactor, p.overrideValue == null ? '' : p.overrideValue,
          Engine.normalizePinnedPool(p.pinnedPool) || '', p.excluded ? 'نعم' : '', p.notes || ''];
      });
    } else if (mode === 'roster') {
      body = (state.people || []).map(function (p) {
        return [p.code || '', p.name || '', p.job || '', p.dept || '', p.tier || '', '', '', p.manualFactor == null ? '' : p.manualFactor, '', Engine.normalizePinnedPool(p.pinnedPool) || '', p.excluded ? 'نعم' : '', ''];
      });
    } else {
      var t = Object.keys(state.tiers || {});
      body = [
        ['1001', 'أحمد عبد الرحمن', 'مدير عام الإدارة', 'الإدارة العامة', t[0] || 'مدير إدارة', 26, 0, 1, '', '', '', ''],
        ['1002', 'مريم السيد', 'أخصائي', 'إدارة الحسابات', t[1] || 'مدير', 20, 0.1, 1, '', Object.keys(state.pools || {})[0] || '', '', 'نصف الشهر']
      ];
    }
    return [TEMPLATE_HDR].concat(body);
  }
  function buildTemplate(state, mode) {
    var wb = newWorkbook({ title: 'قالب ' + APP_NAME }), used = Object.create(null);
    addSheet(wb, used, 'البيانات', templateRows(state, mode), { formats: { 5: INT, 6: PCT, 7: M4, 8: M2 } });
    var guide = [
      ['العمود', 'مطلوب؟', 'الشرح'],
      ['الرقم الوظيفي', 'اختياري', 'يظهر في كشف الصرف ويسهل البحث'],
      ['الاسم', 'مطلوب', 'اسم الشخص كما سيظهر في التقارير'],
      ['الوظيفة', 'اختياري', 'وصف حر يُنقل كما هو'],
      ['القسم', 'اختياري', 'يُستخدم في تقرير «حسب القسم» وفي التصفية'],
      ['الفئة', 'مطلوب', 'يجب أن تطابق فئة معرّفة (أو اسمًا بديلًا لها)، وإلا خرج الشخص من التوزيع وظهر في ورقة «بدون فئة»'],
      ['أيام العمل', 'اختياري', 'فارغ = كل أيام الفترة'],
      ['نسبة الجزاء', 'اختياري', '0.1 أو 10% = خصم 10% من الوزن'],
      ['المعامل اليدوي', 'اختياري', 'فارغ أو 1 = بلا تعديل. 1.25 = زيادة 25% على الوزن'],
      ['قيمة مخصصة', 'اختياري', 'تحل محل قيمة الفئة لهذا الشخص'],
      ['المجمع المثبّت', 'اختياري', 'يثبّت الشخص في مجمع محدد بالاسم'],
      ['مستبعد', 'اختياري', 'نعم / 1 / صح = خارج التوزيع بقرار صريح'],
      ['ملاحظات', 'اختياري', 'نص حر يُنقل إلى التقارير']
    ];
    if (mode === 'roster') { guide.push([]); guide.push(['عن هذا القالب', '', 'قائمة الأشخاص جاهزة لفترة جديدة: الأيام والجزاءات والقيم المخصصة تُركت فارغة عمدًا لأنها تخص فترة بعينها.']); }
    addSheet(wb, used, 'دليل الأعمدة', guide, { widths: [18, 12, 100], autofilter: false });
    addSheet(wb, used, 'الفئات المعرّفة', [['الفئة', 'القيمة']].concat(Object.keys(state.tiers || {}).map(function (t) { return [t, state.tiers[t]]; })), { formats: { 1: M2 }, autofilter: false });
    addSheet(wb, used, 'المجمعات المعرّفة', [['المجمع', 'الإجمالي', 'نسبة الخصم']].concat(Object.keys(state.pools || {}).map(function (p) { return [p, state.pools[p].gross, state.pools[p].taxRate]; })), { formats: { 1: M2, 2: PCT }, autofilter: false });
    return wb;
  }
  function buildSettingsExport(state) {
    var wb = newWorkbook({ title: 'إعدادات ' + APP_NAME }), used = Object.create(null);
    var o = Engine.normalizeOptions(state.options);
    addSheet(wb, used, 'الفئات', [['الفئة', 'القيمة']].concat(Object.keys(state.tiers || {}).map(function (t) { return [t, state.tiers[t]]; })), { formats: { 1: M2 } });
    addSheet(wb, used, 'المجمعات', [['المجمع', 'الإجمالي', 'نسبة الخصم']].concat(Object.keys(state.pools || {}).map(function (p) { return [p, state.pools[p].gross, state.pools[p].taxRate]; })), { formats: { 1: M2, 2: PCT } });
    addSheet(wb, used, 'الحساب', [['الإعداد', 'القيمة'], ['أيام الفترة', state.periodDays], ['وحدة التقريب (قرش)', o.roundingStep], ['التقريب على', o.roundingTarget === 'net' ? 'الصافي' : 'الإجمالي'], ['طريقة الوزن', o.weighting === 'equal' ? 'بالتساوي' : 'حسب الفئة'], ['الحضور', o.attendance === 'ignore' ? 'لا يؤثر' : 'نسبي'], ['التوزيع على المجمعات', o.allocation === 'split' ? 'تقسيم على كل المجمعات' : 'مجمع واحد لكل شخص'], ['الحد الأقصى للصافي', o.capNet || 'بلا']], { autofilter: false, widths: [26, 26] });
    return wb;
  }
  function detailAoa(state, result) { return [DET_HDR].concat(Reports.detailRows(state, result).map(detRow)); }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 1500);
  }
  function safeName(s) { return String(s || APP_NAME_LATIN).replace(/[\\\/:\*\?"<>\|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120); }
  function write(wb, filename) {
    var arr = XLSX.write(wb, { bookType: 'xlsx', compression: true, type: 'array' });
    downloadBlob(new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), safeName(filename));
  }
  function available() { return typeof XLSX !== 'undefined' && !!XLSX.utils; }
  function toCsv(rows) {
    return (rows || []).map(function (row) {
      return (row || []).map(function (cell) {
        if (cell == null) return '';
        var s = String(cell);
        if (typeof cell === 'string' && /^\s*[=+\-@\t\r]/.test(s)) s = "'" + s;
        return /[",\r\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\r\n');
  }
  function writeCsv(rows, filename) { downloadBlob(new Blob(['\uFEFF' + toCsv(rows)], { type: 'text/csv;charset=utf-8' }), safeName(filename)); }
  function writeJson(payload, filename) { downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }), safeName(filename)); }

  return {
    buildFullReport: buildFullReport, buildSelectedReport: buildSelectedReport, buildViewExport: buildViewExport,
    buildTemplate: buildTemplate, templateRows: templateRows, buildSettingsExport: buildSettingsExport, detailAoa: detailAoa,
    addPoolSheet: addPoolSheet, sheetRegistry: sheetRegistry, write: write, writeCsv: writeCsv, writeJson: writeJson, toCsv: toCsv,
    available: available, sanitizeSheetName: sanitizeSheetName, newWorkbook: newWorkbook, kindFormat: kindFormat, safeName: safeName,
    FORMATS: { M2: M2, M4: M4, PCT: PCT, INT: INT }
  };
})();
