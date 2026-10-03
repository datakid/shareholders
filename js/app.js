var Q = (function () {
  'use strict';
  var el = UI.el, append = UI.append, clearNode = UI.clear, btn = UI.btn;
  var Q = { state: null, hosts: {}, bootAt: Date.now(), autosaveArmed: false };

  var SCREENS = [
    { key: 'upload', label: 'الملف', icon: 'upload' },
    { key: 'map', label: 'الأعمدة', icon: 'table' },
    { key: 'amounts', label: 'المبالغ', icon: 'coins' },
    { key: 'allocate', label: 'المراجعة', icon: 'people' },
    { key: 'dashboard', label: 'اللوحة', icon: 'chart' },
    { key: 'export', label: 'التصدير', icon: 'download' }
  ];
  Q.SCREENS = SCREENS;

  var MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  function defaultPeriod() { var d = new Date(); return MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  function emptyFilters() { return { q: '', dept: '', tier: '', pool: '', flags: [] }; }
  Q.emptyFilters = emptyFilters;

  function makeState() {
    return {
      __app: true,
      screen: 'upload',
      title: 'توزيع الحوافز',
      period: defaultPeriod(),
      periodDays: 30,
      tiers: Model.defaultTiers(),
      pools: Model.defaultPools(),
      options: { roundingStep: 1, roundingTarget: 'net', allocation: 'assign', weighting: 'tier', attendance: 'prorata', capNet: null },
      tierAliases: {},
      people: [],
      sourceGrid: [],
      headerRow: 0,
      headers: [],
      rawRows: [],
      mapping: {},
      penaltyScale: 'auto',
      fileName: '',
      sheetName: '',
      workbook: null,
      result: null,
      filters: emptyFilters(),
      sort: { key: null, dir: null },
      page: { dashboard: 1, allocate: 1, grid: 1 },
      selection: {},
      undoStack: [],
      redoStack: [],
      ui: Model.ui({ rowsPerPage: (window.innerWidth && window.innerWidth < 760) ? 50 : 100 }),
      baseline: null,
      mappedFromGrid: false,
      __recomputeCount: 0
    };
  }
  Q.makeState = makeState;
  function S() { return Q.state; }

  function deriveGrid() {
    var st = S();
    var grid = st.sourceGrid || [];
    var hr = Math.min(st.headerRow || 0, Math.max(0, grid.length - 1));
    st.headerRow = hr;
    var head = grid[hr] || [];
    var width = head.length;
    for (var g = 0; g < grid.length; g++) { var gl = grid[g] ? grid[g].length : 0; if (gl > width) width = gl; }
    var headers = [];
    for (var i = 0; i < width; i++) {
      var h = head[i];
      headers.push(String(h == null || String(h).trim() === '' ? 'عمود ' + (i + 1) : h).replace(/\s+/g, ' ').trim());
    }
    st.headers = headers;
    var body = [];
    for (var b = hr + 1; b < grid.length; b++) if (Importer.nonEmpty(grid[b])) body.push(grid[b]);
    st.rawRows = body;
  }
  Q.deriveGrid = deriveGrid;

  function persistableSettings() {
    var st = S();
    if (!st || !st.__app) return null;
    return { tiers: st.tiers, pools: st.pools, options: st.options, ui: st.ui, periodDays: st.periodDays, tierAliases: st.tierAliases };
  }
  function persistableSession() {
    var st = S();
    if (!st || !st.__app) return null;
    if (!st.people.length && !(st.sourceGrid && st.sourceGrid.length)) return null;
    return {
      title: st.title, period: st.period, periodDays: st.periodDays,
      sourceGrid: st.sourceGrid, headerRow: st.headerRow, mapping: st.mapping, penaltyScale: st.penaltyScale,
      people: st.people, fileName: st.fileName, sheetName: st.sheetName, screen: st.screen,
      tiers: st.tiers, pools: st.pools, options: st.options, tierAliases: st.tierAliases, baseline: st.baseline
    };
  }
  Q.persistableSettings = persistableSettings;
  Q.persistableSession = persistableSession;

  var save = { failures: Object.create(null), failure: '', warned: false, lastAt: 0, lean: false, dirty: false };
  Q.save = save;
  function paintSaveStatus() {
    var h = Q.hosts.saveStatus;
    if (!h) return;
    clearNode(h);
    var st = S(), tone = 'idle', label;
    if (save.failure) { tone = 'danger'; label = 'غير محفوظ'; }
    else if (save.dirty) { tone = 'pending'; label = 'جارٍ الحفظ…'; }
    else if (save.lastAt) { tone = save.lean ? 'warn' : 'ok'; label = save.lean ? 'محفوظ جزئيًا' : 'محفوظ'; }
    else label = st && st.people.length ? 'بانتظار الحفظ' : 'لا بيانات';
    h.className = 'save-status is-' + tone;
    h.appendChild(el('span', 'save-dot'));
    h.appendChild(el('span', 'save-text', label));
    h.title = save.failure ? save.failure + ' — نزّل نسخة من مركز التصدير' : (save.lean ? 'مساحة المتصفح لا تتسع للملف الأصلي؛ حُفظت البيانات والتعديلات دون الملف الأصلي' : (save.lastAt ? 'آخر حفظ محلي ' + Fmt.relTime(save.lastAt) : label));
  }
  Q.paintSaveStatus = paintSaveStatus;
  setInterval(function () { if (save.lastAt && !save.failure) paintSaveStatus(); }, 30000);

  function onSaveResult(res, name) {
    if (name === 'session') save.dirty = false;
    if (res && res.ok) {
      delete save.failures[name];
      if (name === 'session') { save.lastAt = Date.now(); save.lean = !!res.lean; }
      if (!Object.keys(save.failures).length && save.failure) { save.failure = ''; save.warned = false; Q.renderNotices(); }
      paintSaveStatus();
      return;
    }
    save.failures[name] = res && res.quota ? 'مساحة المتصفح ممتلئة' : 'التخزين غير متاح';
    save.failure = save.failures.session || save.failures.settings;
    paintSaveStatus();
    Q.renderNotices();
    if (save.warned) return;
    save.warned = true;
    UI.toast('تعذّر الحفظ محليًا. نزّل نسخة كاملة الآن.', 'danger', { label: 'تنزيل نسخة', onClick: function () { Q.exportSessionBundle(); } });
  }
  function scheduleSave() {
    var st = S();
    if (!Q.autosaveArmed || !st || !st.__app) return;
    save.dirty = true;
    paintSaveStatus();
    Store.debouncedSave('settings', persistableSettings, 700, function (res) { onSaveResult(res, 'settings'); });
    Store.debouncedSave('session', function () {
      var p = persistableSession();
      if (p == null) { if (!S().__restore) Store.clear('session'); save.dirty = false; paintSaveStatus(); }
      return p;
    }, 1000, function (res) { onSaveResult(res, 'session'); });
  }
  Q.scheduleSave = scheduleSave;

  var recomputeTimer = null;
  function recompute() {
    var st = S();
    st.__recomputeCount = (st.__recomputeCount || 0) + 1;
    st.result = Engine.runPipeline({ people: st.people, tiers: st.tiers, pools: st.pools, periodDays: st.periodDays, options: st.options });
    if (st.__app) scheduleSave();
    return st.result;
  }
  function recomputeDebounced(after, delay) {
    if (recomputeTimer) clearTimeout(recomputeTimer);
    var n = S().people.length;
    var d = delay == null ? (n > 200000 ? 650 : (n > 30000 ? 320 : 140)) : delay;
    recomputeTimer = setTimeout(function () { recomputeTimer = null; recompute(); if (after) after(); }, d);
  }
  function recomputeBusy(text, after) {
    var n = S().people.length;
    if (n < 30000) { recompute(); if (after) after(); return; }
    Busy.run(text || ('جارٍ حساب ' + Fmt.int(n) + ' صف…'), function () { recompute(); if (after) after(); });
  }
  Q.recomputeBusy = recomputeBusy;
  function recomputeNow(after) {
    if (recomputeTimer) { clearTimeout(recomputeTimer); recomputeTimer = null; }
    recompute();
    if (after) after();
  }
  Q.recompute = recompute;
  Q.recomputeDebounced = recomputeDebounced;
  Q.recomputeNow = recomputeNow;
  function ok() { var st = S(); return !!(st.result && st.result.ok); }
  Q.ok = ok;

  function resultIndex() {
    var st = S(), res = st.result;
    if (st.__resultIndex && st.__resultIndexFor === res) return st.__resultIndex;
    var m;
    if (res && res.ok && res.cols) {
      var c = res.cols, pos = idPos(), memo = Object.create(null);
      m = new Proxy(memo, { get: function (t, k) {
        if (typeof k !== 'string') return undefined;
        if (k in t) return t[k];
        var i = pos.get(k);
        if (i === undefined) i = pos.get(Number(k));
        if (i === undefined || i >= c.n || c.ids[i] !== st.people[i].id) return undefined;
        return (t[k] = c.personAt(i));
      } });
    } else {
      m = Object.create(null);
      if (res && res.ok) res.people.forEach(function (r) { m[r.id] = r; });
    }
    st.__resultIndex = m;
    st.__resultIndexFor = res;
    return m;
  }
  function idPos() {
    var st = S();
    if (st.__idPos && st.__idPosFor === st.people) return st.__idPos;
    var m = new Map(), ppl = st.people;
    for (var i = 0; i < ppl.length; i++) m.set(ppl[i].id, i);
    st.__idPos = m;
    st.__idPosFor = ppl;
    return m;
  }
  Q.idPos = idPos;
  function rowsCache() {
    var st = S();
    if (st.__rows && st.__rowsFor === st.result && st.__rowsPeople === st.people) return st.__rows;
    st.__rows = Reports.detailRows(st, st.result && st.result.ok ? st.result : null);
    st.__rowsFor = st.result;
    st.__rowsPeople = st.people;
    st.__rowById = null;
    return st.__rows;
  }
  function byIdView(list) {
    var pos = idPos();
    return new Proxy(Object.create(null), {
      get: function (t, k) {
        if (typeof k !== 'string') return undefined;
        var i = pos.get(k);
        if (i === undefined && k !== '' && !isNaN(k)) i = pos.get(Number(k));
        return i === undefined ? undefined : list[i];
      },
      has: function (t, k) { return pos.has(k) || (!isNaN(k) && pos.has(Number(k))); }
    });
  }
  function rowById() {
    var st = S(), rows = rowsCache();
    if (st.__rowById && st.__rowByIdFor === rows) return st.__rowById;
    st.__rowById = byIdView(rows);
    st.__rowByIdFor = rows;
    return st.__rowById;
  }
  function personById() {
    var st = S();
    if (st.__personById && st.__personByIdFor === st.people) return st.__personById;
    st.__personById = byIdView(st.people);
    st.__personByIdFor = st.people;
    return st.__personById;
  }
  function searchIndex() {
    var st = S(), rows = rowsCache();
    if (st.__searchIndex && st.__searchIndexFor === rows) return st.__searchIndex;
    st.__searchIndex = Search.buildIndex(rows);
    st.__searchIndexFor = rows;
    return st.__searchIndex;
  }
  function problemIds() {
    var st = S();
    if (st.__problemIds && st.__problemIdsFor === st.result) return st.__problemIds;
    var ids = Object.create(null);
    var c = st.result && st.result.ok && st.result.cols;
    if (c && c.warnFlags) {
      var size = 0;
      for (var i = 0; i < c.n; i++) if (c.warnFlags[i]) { ids[c.ids[i]] = true; size++; }
      Object.defineProperty(ids, '__size', { value: size });
    } else
    ((st.result && st.result.warnings) || []).forEach(function (w) { if (w.personId != null) ids[w.personId] = true; });
    ((st.result && st.result.errors) || []).forEach(function (w) { if (w.personId != null) ids[w.personId] = true; });
    st.__problemIds = ids;
    st.__problemIdsFor = st.result;
    return ids;
  }
  function baselineDiff() {
    var st = S();
    if (!st.baseline || !ok()) return null;
    if (st.__baseDiff && st.__baseDiffFor === st.result && st.__baseDiffBase === st.baseline) return st.__baseDiff;
    st.__baseDiff = Reports.compareToBaseline(st, st.result, st.baseline);
    st.__baseDiffFor = st.result;
    st.__baseDiffBase = st.baseline;
    return st.__baseDiff;
  }
  Q.resultIndex = resultIndex;
  Q.rowsCache = rowsCache;
  Q.rowById = rowById;
  Q.personById = personById;
  Q.searchIndex = searchIndex;
  Q.problemIds = problemIds;
  Q.baselineDiff = baselineDiff;

  var FLAGS = [
    { key: 'problems', label: 'بها ملاحظات', tone: 'warn', test: function (r) { return !!problemIds()[r.id] || r.unresolvedTier; } },
    { key: 'unresolved', label: 'بدون فئة', tone: 'danger', test: function (r) { return r.unresolvedTier; } },
    { key: 'special', label: 'حالات خاصة', test: function (r) { return r.special; } },
    { key: 'excluded', label: 'مستبعدون', test: function (r) { return r.excluded; } },
    { key: 'penalty', label: 'عليهم جزاء', test: function (r) { return r.penalty > 0; } },
    { key: 'partial', label: 'أيام ناقصة', test: function (r) { return r.days < S().periodDays; } },
    { key: 'pinned', label: 'مثبّتون', test: function (r) { return !!r.pinned; } },
    { key: 'capped', label: 'بلغوا الحد', test: function (r) { return r.capped; } },
    { key: 'zero', label: 'صافيهم صفر', test: function (r) { return !r.excluded && !r.unresolvedTier && r.netPiastres === 0; } },
    { key: 'changed', label: 'تغيّروا عن المرجع', test: function (r) { var d = baselineDiff(); return !!d && d.byId[r.id] !== 0; } }
  ];
  Q.FLAGS = FLAGS;
  function flagDef(key) { for (var i = 0; i < FLAGS.length; i++) if (FLAGS[i].key === key) return FLAGS[i]; return null; }
  Q.flagDef = flagDef;

  var F = Exporter.FORMATS;
  var COLUMNS = [
    { key: 'name', label: 'الاسم', cls: 'name-col', sortable: true, width: 210, get: function (r) { return r.name; } },
    { key: 'code', label: 'الرقم', sortable: true, width: 90, detail: true, get: function (r) { return r.code; } },
    { key: 'dept', label: 'القسم', sortable: true, width: 160, get: function (r) { return r.dept; } },
    { key: 'tier', label: 'الفئة', sortable: true, width: 120, get: function (r) { return r.tier; } },
    { key: 'pool', label: 'المجمع', sortable: true, width: 160, get: function (r) { return r.pool; } },
    { key: 'weight', label: 'الوزن', numeric: true, sortable: true, width: 96, detail: true, get: function (r) { return r.weight; }, format: F.M4 },
    { key: 'days', label: 'الأيام', numeric: true, sortable: true, width: 72, detail: true, get: function (r) { return r.days; }, format: F.INT },
    { key: 'gross', label: 'الإجمالي', numeric: true, sortable: true, width: 110, get: function (r) { return r.gross; }, format: F.M2 },
    { key: 'tax', label: 'الخصم', numeric: true, sortable: true, width: 100, get: function (r) { return r.tax; }, format: F.M2 },
    { key: 'net', label: 'الصافي', numeric: true, sortable: true, width: 116, get: function (r) { return r.net; }, format: F.M2 },
    { key: 'drift', label: 'الفرق عن المثالي', numeric: true, sortable: true, width: 110, detail: true, get: function (r) { return Math.round(r.drift * 100) / 100; }, format: F.M2, sum: false }
  ];
  Q.COLUMNS = COLUMNS;
  function colDef(key) { for (var i = 0; i < COLUMNS.length; i++) if (COLUMNS[i].key === key) return COLUMNS[i]; return null; }
  Q.colDef = colDef;

  function activeFilterList() {
    var st = S(), f = st.filters, out = [];
    if (f.q) out.push({ kind: 'q', label: 'بحث: ' + f.q });
    if (f.dept) out.push({ kind: 'dept', label: 'القسم: ' + f.dept });
    if (f.tier) out.push({ kind: 'tier', label: 'الفئة: ' + f.tier });
    if (f.pool) out.push({ kind: 'pool', label: 'المجمع: ' + f.pool });
    (f.flags || []).forEach(function (k) { var d = flagDef(k); if (d) out.push({ kind: 'flag:' + k, label: d.label }); });
    return out;
  }
  Q.activeFilterList = activeFilterList;
  function filterSummaryText() {
    var st = S(), list = activeFilterList();
    var sortTxt = '';
    if (st.sort.key && st.sort.dir) { var c = colDef(st.sort.key); sortTxt = 'ترتيب: ' + (c ? c.label : st.sort.key) + ' ' + (st.sort.dir === 'desc' ? 'تنازليًا' : 'تصاعديًا'); }
    if (!list.length) return 'بلا تصفية — كل الصفوف' + (sortTxt ? ' | ' + sortTxt : '');
    return list.map(function (f) { return f.label; }).join(' | ') + (sortTxt ? ' | ' + sortTxt : '');
  }
  Q.filterSummaryText = filterSummaryText;
  function activeFilterLines() {
    var st = S(), lines = activeFilterList().map(function (f) { return f.kind === 'q' ? f.label : 'تصفية: ' + f.label; });
    if (st.sort.key && st.sort.dir) { var c = colDef(st.sort.key); if (c) lines.push('ترتيب: ' + c.label + ' ' + (st.sort.dir === 'desc' ? 'تنازليًا' : 'تصاعديًا')); }
    return lines;
  }
  Q.activeFilterLines = activeFilterLines;

  var lastSearch = { rows: null, q: null, res: null };
  function searchFor(rows, q) {
    if (lastSearch.rows === rows && lastSearch.q === q) return lastSearch.res;
    var res = Search.run(searchIndex(), q);
    lastSearch = { rows: rows, q: q, res: res };
    return res;
  }
  function viewRows(opts) {
    var st = S(), rows = rowsCache(), f = st.filters || emptyFilters();
    var noSort = !!(opts && opts.noSort);
    var sortKey = noSort ? '' : (st.sort && st.sort.key && st.sort.dir ? st.sort.key + ':' + st.sort.dir : '');
    var sig = JSON.stringify([f.q, f.dept, f.tier, f.pool, f.flags, sortKey, st.baseline ? st.baseline.at : 0]);
    if (st.__view && st.__viewRows === rows && st.__viewSig === sig && st.__viewResult === st.result) { st.__lastNeedle = st.__viewNeedle; return st.__view; }
    var res = null;
    if (f.q) { res = searchFor(rows, f.q); st.__lastNeedle = res ? res.needle : ''; }
    else st.__lastNeedle = '';
    var defs = (f.flags || []).map(flagDef).filter(Boolean);
    var n = rows.length, out = [], hitRows = res && res.rows;
    for (var i = 0; i < n; i++) {
      var r = rows[i];
      if (hitRows && !hitRows[i]) continue;
      if (f.dept && r.dept !== f.dept) continue;
      if (f.tier && r.tier !== f.tier) continue;
      if (f.pool && r.pinned !== f.pool && r.pools.indexOf(f.pool) === -1) continue;
      var ok2 = true;
      for (var k = 0; k < defs.length; k++) if (!defs[k].test(r)) { ok2 = false; break; }
      if (ok2) out.push(r);
    }
    if (sortKey) {
      var col = colDef(st.sort.key);
      if (col) out = Sorter.sortRows(out, col.key, st.sort.dir, function (r) { return col.get(r); });
      else if (st.sort.key === 'delta') {
        var d = baselineDiff();
        if (d) out = Sorter.sortRows(out, 'delta', st.sort.dir, function (r) { return d.byId[r.id]; });
      }
    } else if (res) {
      var pos = idPos(), rank = res.rank;
      out.sort(function (a, b) { return rank[pos.get(a.id)] - rank[pos.get(b.id)]; });
    }
    st.__view = out; st.__viewRows = rows; st.__viewSig = sig; st.__viewResult = st.result; st.__viewNeedle = st.__lastNeedle;
    return out;
  }
  function flagCounts() {
    var st = S(), rows = rowsCache();
    var sig = st.baseline ? st.baseline.at : 0;
    if (st.__flagCounts && st.__flagCountsFor === rows && st.__flagCountsSig === sig) return st.__flagCounts;
    var counts = {};
    FLAGS.forEach(function (fl) { counts[fl.key] = 0; });
    for (var i = 0; i < rows.length; i++) for (var j = 0; j < FLAGS.length; j++) if (FLAGS[j].test(rows[i])) counts[FLAGS[j].key]++;
    st.__flagCounts = counts; st.__flagCountsFor = rows; st.__flagCountsSig = sig;
    return counts;
  }
  Q.flagCounts = flagCounts;
  function groupCounts(key) {
    var st = S(), rows = rowsCache();
    st.__groupCounts = st.__groupCounts && st.__groupCountsFor === rows ? st.__groupCounts : {};
    st.__groupCountsFor = rows;
    if (st.__groupCounts[key]) return st.__groupCounts[key];
    var counts = Object.create(null);
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (key === 'pool') { var ps = r.pools; if (!ps.length && r.pinned) ps = [r.pinned]; for (var k = 0; k < ps.length; k++) counts[ps[k]] = (counts[ps[k]] || 0) + 1; }
      else if (r[key]) counts[r[key]] = (counts[r[key]] || 0) + 1;
    }
    st.__groupCounts[key] = counts;
    return counts;
  }
  Q.groupCounts = groupCounts;
  Q.viewRows = viewRows;

  function uniqueValues(key) {
    return Object.keys(groupCounts(key)).sort(Sorter.compareValues);
  }
  Q.uniqueValues = uniqueValues;

  function snapshot() {
    var st = S();
    return { people: st.people, tiers: Object.assign({}, st.tiers), pools: JSON.parse(JSON.stringify(st.pools)), options: Object.assign({}, st.options), periodDays: st.periodDays, tierAliases: Object.assign({}, st.tierAliases) };
  }
  function restoreSnap(s) {
    var st = S();
    st.people = s.people; st.tiers = s.tiers; st.pools = s.pools; st.options = s.options; st.periodDays = s.periodDays; st.tierAliases = s.tierAliases;
  }
  function sameSnap(a, b) {
    return a.people === b.people && JSON.stringify([a.tiers, a.pools, a.options, a.periodDays, a.tierAliases]) === JSON.stringify([b.tiers, b.pools, b.options, b.periodDays, b.tierAliases]);
  }
  function pushUndo(label, snap) {
    var st = S();
    if (!st.undoStack) st.undoStack = [];
    st.undoStack.push({ label: label, snap: snap || snapshot(), at: Date.now() });
    var size = st.people.length, cap = size > 500000 ? 6 : (size > 100000 ? 15 : (size > 20000 ? 40 : 80));
    while (st.undoStack.length > cap) st.undoStack.shift();
    st.redoStack = [];
    paintUndoButtons();
  }
  function trackUndo(input, label) {
    var snap = null;
    input.addEventListener('focus', function () { snap = snapshot(); });
    input.addEventListener('change', function () {
      if (!snap) return;
      var s = snap;
      snap = null;
      if (!sameSnap(s, snapshot())) pushUndo(typeof label === 'function' ? label() : label, s);
    });
    return input;
  }
  function afterHistory() {
    var st = S();
    if (st.filters.pool && !st.pools[st.filters.pool]) st.filters.pool = '';
    recompute();
    if (!st.__app) return;
    Q.renderScreen();
    Q.renderStepper();
  }
  function undo() {
    var st = S();
    if (!st.undoStack.length) return;
    var e = st.undoStack.pop();
    st.redoStack.push({ label: e.label, snap: snapshot(), at: Date.now() });
    restoreSnap(e.snap);
    afterHistory();
    if (st.__app) UI.toast('تم التراجع عن: ' + e.label, 'ok', { label: 'إعادة', onClick: redo });
  }
  function redo() {
    var st = S();
    if (!st.redoStack.length) return;
    var e = st.redoStack.pop();
    st.undoStack.push({ label: e.label, snap: snapshot(), at: Date.now() });
    restoreSnap(e.snap);
    afterHistory();
    if (st.__app) UI.toast('تمت إعادة: ' + e.label, 'ok', { label: 'تراجع', onClick: undo });
  }
  function paintUndoButtons() {
    var st = S();
    if (!st.__app) return;
    (Q.hosts.undoBtns || []).forEach(function (b) {
      if (!b.isConnected) return;
      b.disabled = !st.undoStack.length;
      b.setAttribute('aria-label', st.undoStack.length ? 'تراجع عن: ' + st.undoStack[st.undoStack.length - 1].label : 'لا شيء للتراجع');
    });
    (Q.hosts.redoBtns || []).forEach(function (b) {
      if (!b.isConnected) return;
      b.disabled = !st.redoStack.length;
      b.setAttribute('aria-label', st.redoStack.length ? 'إعادة: ' + st.redoStack[st.redoStack.length - 1].label : 'لا شيء للإعادة');
    });
  }
  function undoButtons() {
    var st = S();
    var u = UI.iconBtn('undo', 'تراجع (Ctrl+Z)', undo, 'sm');
    var r = UI.iconBtn('redo', 'إعادة (Ctrl+Y)', redo, 'sm');
    u.disabled = !st.undoStack.length; r.disabled = !st.redoStack.length;
    Q.hosts.undoBtns = (Q.hosts.undoBtns || []).filter(function (b) { return b.isConnected; }).concat([u]);
    Q.hosts.redoBtns = (Q.hosts.redoBtns || []).filter(function (b) { return b.isConnected; }).concat([r]);
    return append(el('div', 'btn-group'), [u, r]);
  }
  Q.pushUndo = pushUndo;
  Q.trackUndo = trackUndo;
  Q.undo = undo;
  Q.redo = redo;
  Q.undoButtons = undoButtons;
  Q.snapshot = snapshot;
  Q.paintUndoButtons = paintUndoButtons;

  function applyPatch(p, patch) {
    var changed = false;
    for (var k in patch) if (p[k] !== patch[k]) { changed = true; break; }
    return changed ? Object.assign({}, p, patch) : null;
  }
  function updatePeople(ids, patchFn) {
    var st = S(), touched = 0, next = null, ppl = st.people, i;
    if (ids !== null && ids.length * 8 < ppl.length) {
      var pos = idPos();
      for (var j = 0; j < ids.length; j++) {
        i = pos.get(ids[j]);
        if (i === undefined) continue;
        var patch = patchFn(ppl[i]);
        if (!patch) continue;
        var np = applyPatch(ppl[i], patch);
        if (!np) continue;
        if (!next) next = ppl.slice();
        next[i] = np; touched++;
      }
    } else {
      var set = null;
      if (ids !== null) set = new Set(ids);
      for (i = 0; i < ppl.length; i++) {
        var p = ppl[i];
        if (set && !set.has(p.id)) continue;
        var pt = patchFn(p);
        if (!pt) continue;
        var q = applyPatch(p, pt);
        if (!q) continue;
        if (!next) next = ppl.slice();
        next[i] = q; touched++;
      }
    }
    if (next) {
      st.people = next;
      if (st.__idPos && st.__idPosFor === ppl) st.__idPosFor = next;
    }
    return touched;
  }
  Q.updatePeople = updatePeople;
  function nextPersonId() {
    var max = 0, ppl = S().people;
    for (var i = 0; i < ppl.length; i++) { var id = ppl[i].id; if (typeof id === 'number' && id > max) max = id; }
    return max + 1;
  }
  Q.nextPersonId = nextPersonId;

  function hasData() { var st = S(); return st.people.length > 0; }
  function hasGrid() { var st = S(); return !!(st.sourceGrid && st.sourceGrid.length > 1); }
  function screenEnabled(key) {
    if (key === 'upload') return true;
    if (key === 'map') return hasGrid() || hasData();
    return hasData();
  }
  Q.hasData = hasData;
  Q.hasGrid = hasGrid;
  Q.screenEnabled = screenEnabled;

  function stepStatus(key) {
    var st = S(), r = st.result;
    if (key === 'upload') return (hasGrid() || hasData()) ? 'done' : 'todo';
    if (key === 'map') return hasData() ? 'done' : (hasGrid() ? 'todo' : 'todo');
    if (key === 'amounts') {
      if (!hasData()) return 'todo';
      var total = Object.keys(st.pools).reduce(function (s, n) { return s + (st.pools[n].gross || 0); }, 0);
      if (!total) return 'todo';
      return r && !r.ok && r.errors.some(function (e) { return /POOL|TAX|GROSS/.test(e.code); }) ? 'danger' : 'done';
    }
    if (key === 'allocate') {
      if (!hasData() || !r) return 'todo';
      if (!r.ok) return 'danger';
      if ((r.unresolvedTierIds || []).length) return 'warn';
      return 'done';
    }
    return 'none';
  }

  function goto(screen, opts) {
    opts = opts || {};
    var st = S();
    if (!screenEnabled(screen)) screen = 'upload';
    var fromIdx = SCREENS.findIndex(function (s) { return s.key === st.screen; });
    var toIdx = SCREENS.findIndex(function (s) { return s.key === screen; });
    var same = st.screen === screen;
    st.screen = screen;
    UI.closePanel();
    UI.dismissTip();
    if ((screen === 'allocate' || screen === 'dashboard' || screen === 'export') && hasData() && !st.result) recompute();
    function update() { Q.renderStepper(); Q.renderScreen(); Q.renderNotices(); }
    if (document.startViewTransition && !same && !UI.reduceMotion() && st.ui.motion !== 'reduced') {
      document.documentElement.style.setProperty('--vt-dir', toIdx >= fromIdx ? '1' : '-1');
      try { document.startViewTransition(update); } catch (e) { update(); }
    } else update();
    if (!opts.keepScroll) window.scrollTo({ top: 0, behavior: 'auto' });
    scheduleSave();
    setTimeout(function () {
      var heading = Q.hosts.screen && Q.hosts.screen.querySelector('h1');
      if (heading && !opts.noFocus) heading.focus({ preventScroll: true });
    }, 90);
  }
  Q.goto = goto;

  function captureFocus() {
    var a = document.activeElement;
    if (!a || !a.id || a === document.body) return null;
    return { id: a.id, start: a.selectionStart, end: a.selectionEnd };
  }
  function restoreFocus(snap) {
    if (!snap) return;
    var n = document.getElementById(snap.id);
    if (!n || n === document.activeElement) return;
    n.focus({ preventScroll: true });
    if (snap.start != null && n.setSelectionRange) { try { n.setSelectionRange(snap.start, snap.end); } catch (e) {} }
  }
  Q.captureFocus = captureFocus;
  Q.restoreFocus = restoreFocus;

  var THEME_ICON = { light: 'sun', dark: 'moon' };
  var THEME_LABEL = { light: 'فاتح', dark: 'داكن', system: 'حسب النظام' };
  function setTheme(v) {
    var st = S();
    st.ui.theme = v;
    Theme.set(v);
    scheduleSave();
    paintThemeBtn();
  }
  Q.setTheme = setTheme;
  function paintThemeBtn() {
    var b = Q.hosts.themeBtn;
    if (!b) return;
    clearNode(b);
    b.appendChild(Icons.svg(THEME_ICON[Theme.resolve()]));
    b.setAttribute('aria-label', 'المظهر: ' + THEME_LABEL[Theme.get()]);
  }
  function openThemeMenu() {
    UI.menu(Q.hosts.themeBtn, [
      { label: 'حسب النظام', icon: 'monitor', checked: Theme.get() === 'system', onClick: function () { setTheme('system'); } },
      { label: 'فاتح', icon: 'sun', checked: Theme.get() === 'light', onClick: function () { setTheme('light'); } },
      { label: 'داكن', icon: 'moon', checked: Theme.get() === 'dark', onClick: function () { setTheme('dark'); } }
    ]);
  }

  function renderShell() {
    var snap = captureFocus();
    var root = Q.hosts.root;
    clearNode(root);
    Q.hosts.stepperPills = null;

    var bar = el('header', 'topbar');
    var inner = el('div', 'topbar-inner');
    var brand = el('a', 'brand');
    brand.href = '#';
    brand.setAttribute('aria-label', APP_NAME + ' — العودة لخطوة الملف');
    brand.addEventListener('click', function (e) { e.preventDefault(); goto(hasData() ? 'dashboard' : 'upload'); });
    var mark = Icons.brandMark();
    if (Date.now() - Q.bootAt < 1500) {
      mark.classList.add('boot-reveal');
      mark.addEventListener('animationend', function () { mark.classList.remove('boot-reveal'); }, { once: true });
    }
    brand.appendChild(mark);
    var bt = el('div', 'brand-text');
    var nm = el('div', 'brand-name', APP_NAME);
    nm.appendChild(el('span', null, APP_NAME_LATIN));
    bt.appendChild(nm);
    bt.appendChild(el('div', 'brand-tag', APP_TAGLINE));
    brand.appendChild(bt);
    inner.appendChild(brand);

    Q.hosts.stepper = el('nav', 'topbar-steps');
    Q.hosts.stepper.setAttribute('aria-label', 'خطوات العمل');
    inner.appendChild(Q.hosts.stepper);
    inner.appendChild(el('div', 'topbar-spacer'));

    Q.hosts.saveStatus = el('span', 'save-status');
    Q.hosts.saveStatus.setAttribute('role', 'status');
    inner.appendChild(Q.hosts.saveStatus);
    paintSaveStatus();

    var actions = el('div', 'topbar-actions');
    var cmd = btn('', { icon: 'search', variant: 'ghost', size: 'sm', title: 'الأوامر السريعة (Ctrl+K)', onClick: function () { Q.openPalette(); } });
    cmd.classList.add('cmd-btn');
    actions.appendChild(cmd);
    var mizan = document.createElement('a');
    mizan.className = 'topbar-link';
    mizan.href = 'https://m-izan.vercel.app/';
    mizan.target = '_blank';
    mizan.rel = 'noopener noreferrer';
    mizan.setAttribute('aria-label', 'ميزان — أداة شقيقة، تفتح في تبويب جديد');
    mizan.appendChild(el('span', 'link-text', 'ميزان'));
    mizan.appendChild(Icons.svg('external', 'icon-ext'));
    actions.appendChild(mizan);
    Q.hosts.themeBtn = UI.iconBtn(THEME_ICON[Theme.resolve()], 'المظهر', openThemeMenu, 'sm');
    Q.hosts.themeBtn.setAttribute('aria-haspopup', 'menu');
    paintThemeBtn();
    actions.appendChild(Q.hosts.themeBtn);
    var sb = btn('الإعدادات', { icon: 'settings', variant: 'ghost', size: 'sm', onClick: function () { Q.openSettings(); } });
    sb.setAttribute('aria-label', 'الإعدادات');
    actions.appendChild(sb);
    inner.appendChild(actions);
    bar.appendChild(inner);
    root.appendChild(bar);
    Q.hosts.topbar = bar;
    if (typeof ResizeObserver !== 'undefined') {
      if (Q.hosts.topRO) Q.hosts.topRO.disconnect();
      Q.hosts.topRO = new ResizeObserver(function (entries) {
        document.documentElement.style.setProperty('--topbar-h', Math.round(entries[0].target.getBoundingClientRect().height) + 'px');
      });
      Q.hosts.topRO.observe(bar);
      if (Q.hosts.fitRO) Q.hosts.fitRO.disconnect();
      var lastW = 0;
      Q.hosts.fitRO = new ResizeObserver(function (entries) {
        var w = Math.round(entries[0].contentRect.width);
        if (w !== lastW) { lastW = w; fitStepper(); }
      });
      Q.hosts.fitRO.observe(inner);
    } else window.addEventListener('resize', fitStepper, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitStepper);

    var shell = el('div', 'shell');
    Q.hosts.notices = el('div', 'global-notices');
    shell.appendChild(Q.hosts.notices);
    Q.hosts.screen = document.createElement('main');
    Q.hosts.screen.id = 'main';
    Q.hosts.screen.setAttribute('tabindex', '-1');
    shell.appendChild(Q.hosts.screen);
    var foot = el('footer', 'app-foot');
    foot.appendChild(el('span', null, APP_NAME + ' ' + APP_VERSION));
    foot.appendChild(el('span', 'dotsep', '·'));
    foot.appendChild(el('span', null, 'يعمل بالكامل داخل متصفحك — لا يُرسل أي شيء لأي خادم'));
    foot.appendChild(el('span', 'dotsep', '·'));
    var kb = el('button', 'link-btn', 'اختصارات لوحة المفاتيح');
    kb.type = 'button';
    kb.addEventListener('click', function () { Q.openShortcuts(); });
    foot.appendChild(kb);
    shell.appendChild(foot);
    root.appendChild(shell);

    renderStepper();
    renderNotices();
    renderScreen();
    restoreFocus(snap);
  }
  Q.renderShell = renderShell;

  function renderStepper() {
    var host = Q.hosts.stepper;
    var st = S();
    if (!host || !st || !st.__app) return;
    var currentIdx = SCREENS.findIndex(function (s) { return s.key === st.screen; });
    if (!Q.hosts.stepperPills) {
      clearNode(host);
      var wrap = el('ol', 'stepper');
      Q.hosts.stepperPills = SCREENS.map(function (s, i) {
        var li = el('li');
        var b = el('button', 'step-pill');
        b.type = 'button';
        b.appendChild(el('span', 'step-dot'));
        b.appendChild(el('span', 'step-label', s.label));
        b.addEventListener('click', function () { if (!b.getAttribute('aria-disabled')) goto(s.key); else UI.toast(b.dataset.lockReason || 'غير متاح بعد', 'warn'); });
        li.appendChild(b);
        wrap.appendChild(li);
        return b;
      });
      host.appendChild(wrap);
    }
    var currentPill = null;
    SCREENS.forEach(function (s, i) {
      var b = Q.hosts.stepperPills[i];
      var status = stepStatus(s.key);
      var enabled = screenEnabled(s.key);
      var isCur = i === currentIdx;
      b.className = 'step-pill' + (status === 'done' ? ' done' : '') + (status === 'warn' ? ' is-warn' : '') + (status === 'danger' ? ' is-danger' : '');
      if (isCur) { b.setAttribute('aria-current', 'step'); currentPill = b; } else b.removeAttribute('aria-current');
      var dot = b.firstChild, key = status + ':' + (isCur ? 1 : 0);
      if (dot.dataset.k !== key) {
        dot.dataset.k = key;
        clearNode(dot);
        if (status === 'done' && !isCur) dot.appendChild(Icons.svg('check'));
        else if ((status === 'warn' || status === 'danger') && !isCur) dot.appendChild(document.createTextNode('!'));
        else dot.appendChild(document.createTextNode(String(i + 1)));
      }
      var statusText = status === 'done' ? ' (مكتملة)' : (status === 'warn' ? ' (تحتاج مراجعة)' : (status === 'danger' ? ' (بها خطأ)' : ''));
      b.setAttribute('aria-label', 'الخطوة ' + (i + 1) + ': ' + s.label + statusText);
      if (!enabled) {
        b.setAttribute('aria-disabled', 'true');
        b.dataset.lockReason = s.key === 'map' ? 'ارفع ملفًا أولًا' : (hasGrid() ? 'أكّد ربط الأعمدة أولًا' : 'ارفع ملفًا أو حمّل بيانات تجريبية أولًا');
        b.title = b.dataset.lockReason;
      } else { b.removeAttribute('aria-disabled'); b.title = s.label; }
    });
    fitStepper();
  }
  Q.renderStepper = renderStepper;

  var STEPPER_LEVELS = ['', ' is-compact', ' is-compact is-tight', ' is-compact is-tight is-minimal', ' is-compact is-tight is-minimal is-bare'];
  function fitStepper() {
    var host = Q.hosts.stepper;
    if (!host || !host.isConnected) return;
    var list = host.querySelector('.stepper');
    if (!list) return;
    for (var i = 0; i < STEPPER_LEVELS.length; i++) {
      host.className = 'topbar-steps' + STEPPER_LEVELS[i];
      if (list.scrollWidth <= list.clientWidth + 1) break;
    }
    var cur = list.querySelector('[aria-current="step"]');
    if (cur && list.scrollWidth > list.clientWidth + 1) {
      var lr = list.getBoundingClientRect(), cr = cur.getBoundingClientRect();
      list.scrollLeft += (cr.left + cr.width / 2) - (lr.left + lr.width / 2);
    }
  }
  Q.fitStepper = fitStepper;

  function renderNotices() {
    var host = Q.hosts.notices;
    if (!host) return;
    var st = S();
    clearNode(host);
    if (st.__restore) {
      var r = st.__restore;
      var bar = el('div', 'restore-bar');
      bar.appendChild(Icons.svg('history'));
      var tx = el('div', 'restore-text');
      tx.appendChild(el('b', null, 'لديك عمل محفوظ'));
      tx.appendChild(el('span', 'muted small', (r.fileName || 'جلسة') + ' — ' + Fmt.int(r.people ? r.people.length : 0) + ' شخص — ' + Fmt.relTime(r.savedAt)));
      bar.appendChild(tx);
      bar.appendChild(el('div', 'spacer'));
      bar.appendChild(btn('متابعة العمل', { variant: 'primary', size: 'sm', icon: 'history', onClick: Q.restoreSession }));
      bar.appendChild(btn('تجاهل', {
        variant: 'ghost', size: 'sm', onClick: function () {
          var saved = st.__restore;
          st.__restore = null;
          renderNotices();
          UI.toast('تم تجاهل الجلسة المحفوظة', 'ok', { label: 'تراجع', onClick: function () { st.__restore = saved; renderNotices(); } });
          setTimeout(function () { if (!st.__restore && !st.people.length) Store.clear('session'); }, 6600);
        }
      }));
      host.appendChild(bar);
    }
    if (save.failure || !Store.isAvailable()) {
      host.appendChild(UI.notice({
        tone: 'danger', title: 'الحفظ التلقائي معطّل',
        text: (save.failure || Store.unavailableReason()) + ' — نزّل نسخة كاملة قبل إغلاق الصفحة.',
        actions: [btn('تنزيل نسخة الآن', { size: 'sm', icon: 'save', onClick: function () { Q.exportSessionBundle(); } })]
      }));
    }
    if (st.__externalChange) {
      host.appendChild(UI.notice({
        tone: 'warn', title: 'تغيّرت البيانات في تبويب آخر',
        text: 'الحفظ من هذا التبويب قد يستبدل ما حُفظ هناك. نزّل نسخة من عملك الحالي أو أعد التحميل لرؤية أحدث البيانات.',
        actions: [
          btn('إعادة تحميل', { size: 'sm', onClick: function () { Store.flushAll(); window.location.reload(); } }),
          btn('تنزيل نسخة', { size: 'sm', variant: 'ghost', onClick: function () { Q.exportSessionBundle(); } })
        ],
        onDismiss: function () { st.__externalChange = false; }
      }));
    }
  }
  Q.renderNotices = renderNotices;

  function pageHead(title, sub, actions, eyebrow) {
    var h = el('div', 'page-head');
    var t = el('div', 'page-head-text');
    if (eyebrow) t.appendChild(el('div', 'eyebrow', eyebrow));
    var heading = el('h1', 'page-title', title);
    heading.setAttribute('tabindex', '-1');
    t.appendChild(heading);
    if (sub) t.appendChild(el('p', 'page-sub', sub));
    h.appendChild(t);
    if (actions) h.appendChild(append(el('div', 'page-actions'), actions));
    return h;
  }
  Q.pageHead = pageHead;

  function stepEyebrow(key) {
    var i = SCREENS.findIndex(function (s) { return s.key === key; });
    return 'الخطوة ' + (i + 1) + ' من ' + SCREENS.length;
  }
  Q.stepEyebrow = stepEyebrow;

  Q.screens = {};
  function renderScreen() {
    var host = Q.hosts.screen;
    var st = S();
    if (!host || !st || !st.__app) return;
    var snap = captureFocus();
    var keep = ['root', 'topbar', 'stepper', 'stepperPills', 'saveStatus', 'themeBtn', 'notices', 'screen', 'topRO', 'fitRO', 'undoBtns', 'redoBtns', 'settingsRepaint', 'sheetRepaint'];
    Object.keys(Q.hosts).forEach(function (k) { if (keep.indexOf(k) === -1) Q.hosts[k] = null; });
    clearNode(host);
    host.setAttribute('data-screen', st.screen);
    var fn = Q.screens[st.screen] || Q.screens.upload;
    var view;
    try { view = fn(); }
    catch (e) {
      if (window.console) console.error(e);
      view = el('div', null, [pageHead('حدث خطأ غير متوقع', 'لم يُفقد أي شيء من بياناتك. جرّب الرجوع لخطوة سابقة، أو نزّل نسخة من عملك.'),
        UI.notice({ tone: 'danger', title: 'تفاصيل تقنية', text: String(e && e.message || e), actions: [btn('تنزيل نسخة', { size: 'sm', onClick: function () { Q.exportSessionBundle(); } }), btn('العودة للملف', { size: 'sm', onClick: function () { goto('upload'); } })] })]);
    }
    host.appendChild(view);
    restoreFocus(snap);
    paintUndoButtons();
  }
  Q.renderScreen = renderScreen;
  function renderScreenIfMounted() { if (Q.hosts.screen) renderScreen(); renderStepper(); }
  Q.renderScreenIfMounted = renderScreenIfMounted;

  function navFoot(backKey, nextKey, nextLabel, guard, onNext) {
    var f = el('div', 'nav-foot');
    if (backKey) f.appendChild(btn('رجوع', { variant: 'ghost', icon: 'chevronNext', onClick: function () { goto(backKey); } }));
    f.appendChild(el('div', 'spacer'));
    if (nextKey) {
      var verdict = guard ? guard() : true;
      if (verdict !== true && typeof verdict === 'string') f.appendChild(el('span', 'nav-hint', verdict));
      var b = btn(nextLabel || 'التالي', { variant: 'primary', onClick: function () { if (onNext && onNext() === false) return; goto(nextKey); } });
      b.appendChild(Icons.svg('chevron'));
      if (verdict !== true) b.disabled = true;
      f.appendChild(b);
    }
    return f;
  }
  Q.navFoot = navFoot;

  function kpiCard(label, valueNode, foot, tone, icon, extra) {
    var c = el('div', 'kpi' + (tone ? ' kpi-' + tone : ''));
    var l = el('div', 'kpi-label');
    if (icon) l.appendChild(Icons.svg(icon));
    l.appendChild(document.createTextNode(label));
    c.appendChild(l);
    var v = el('div', 'kpi-value');
    v.appendChild(valueNode);
    if (extra) v.appendChild(extra);
    c.appendChild(v);
    if (foot) c.appendChild(el('div', 'kpi-foot', foot));
    return c;
  }
  Q.kpiCard = kpiCard;

  function card(title, note, actions, cls) {
    var c = el('section', 'card' + (cls ? ' ' + cls : ''));
    if (title) {
      var head = el('div', 'card-head');
      var ht = el('div', 'card-head-text');
      var h = el('h2', 'card-title', title);
      ht.appendChild(h);
      if (note) ht.appendChild(el('div', 'card-note', note));
      head.appendChild(ht);
      if (actions) head.appendChild(append(el('div', 'card-actions'), actions));
      c.appendChild(head);
    }
    return c;
  }
  Q.card = card;

  function screenUpload() {
    var st = S();
    var wrap = el('div', 'screen-upload');
    wrap.appendChild(pageHead('ابدأ بملف الأشخاص', 'ارفع ملف Excel أو CSV فيه الأسماء والفئات، أو الصق الجدول مباشرة. كل الحساب يجري داخل متصفحك ولا يُرفع أي ملف لأي مكان.', null, stepEyebrow('upload')));

    var grid = el('div', 'upload-grid');
    var drop = el('div', 'upload mount');
    drop.setAttribute('role', 'button');
    drop.setAttribute('tabindex', '0');
    drop.setAttribute('aria-label', 'اختيار ملف للرفع');
    var icw = el('div', 'upload-icon-wrap');
    icw.appendChild(Icons.svg('upload', 'upload-icon'));
    drop.appendChild(icw);
    var titles = el('div', 'stack g2 center');
    titles.appendChild(el('div', 'upload-title', 'اسحب الملف هنا أو اضغط للاختيار'));
    titles.appendChild(el('div', 'upload-help', 'Excel (.xlsx / .xls) أو CSV أو TSV — ويمكنك إسقاط نسخة قِسمة (.json) لاستعادتها. التطبيق يكتشف صف العناوين وأوراق الملف تلقائيًا.'));
    drop.appendChild(titles);
    var formats = el('div', 'chip-row center');
    ['xlsx', 'xls', 'csv', 'tsv', 'json'].forEach(function (f) { formats.appendChild(UI.badge('.' + f, 'neutral')); });
    drop.appendChild(formats);
    var fileInput = el('input');
    fileInput.type = 'file';
    fileInput.accept = '.xlsx,.xls,.xlsm,.csv,.tsv,.txt,.json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,application/json';
    fileInput.hidden = true;
    fileInput.addEventListener('change', function () { if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]); fileInput.value = ''; });
    drop.appendChild(fileInput);
    drop.addEventListener('click', function () { fileInput.click(); });
    drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
    var depth = 0;
    drop.addEventListener('dragenter', function (e) { e.preventDefault(); depth++; drop.classList.add('drag'); });
    drop.addEventListener('dragover', function (e) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; });
    drop.addEventListener('dragleave', function () { depth = Math.max(0, depth - 1); if (!depth) drop.classList.remove('drag'); });
    drop.addEventListener('drop', function (e) {
      e.preventDefault(); depth = 0; drop.classList.remove('drag');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    grid.appendChild(drop);

    var side = el('div', 'upload-side stack g3');
    function option(icon, title, desc, onClick, primary) {
      var b = el('button', 'option-card' + (primary ? ' is-primary' : ''));
      b.type = 'button';
      var ic = el('span', 'option-icon');
      ic.appendChild(Icons.svg(icon));
      b.appendChild(ic);
      var tx = el('span', 'option-text');
      tx.appendChild(el('span', 'option-title', title));
      tx.appendChild(el('span', 'option-desc', desc));
      b.appendChild(tx);
      b.appendChild(Icons.svg('chevron', 'option-chev'));
      b.addEventListener('click', onClick);
      return b;
    }
    side.appendChild(option('people', 'تحميل بيانات تجريبية', '240 شخصًا بحالات خاصة وصف بدون فئة', loadDemo));
    side.appendChild(option('copy', 'لصق من Excel', 'انسخ الجدول من أي جدول بيانات والصقه هنا', openPasteModal));
    side.appendChild(option('download', 'تنزيل قالب فارغ', 'أعمدة صحيحة ودليل شرح لكل عمود', function () { Q.downloadTemplate('blank'); }));
    side.appendChild(option('folder', 'استعادة نسخة محفوظة', 'ملف .json نزّلته سابقًا من قِسمة', function () { Q.importBundle(); }));
    var stress = el('button', 'link-btn stress-link', 'اختبار الحمل: حتى مليوني صف');
    stress.type = 'button';
    stress.addEventListener('click', openStressPicker);
    side.appendChild(stress);
    grid.appendChild(side);
    wrap.appendChild(grid);

    if (!Exporter.available()) {
      var n = UI.notice({ tone: 'warn', title: 'محرك Excel غير متاح الآن', text: 'يمكنك استيراد CSV أو اللصق من Excel وتصدير CSV. لقراءة ملفات Excel وكتابتها اتصل بالإنترنت وأعد تحميل الصفحة مرة واحدة.' });
      n.classList.add('mt4');
      wrap.appendChild(n);
    }

    if (hasData() || hasGrid()) {
      var info = card('الملف الحالي', null, null, 'mt5 mount mount-2');
      var body = el('div', 'card-pad current-file');
      var ic2 = el('span', 'option-icon');
      ic2.appendChild(Icons.svg('file'));
      body.appendChild(ic2);
      var meta = el('div', 'stack g1 grow');
      meta.appendChild(el('b', null, st.fileName || 'بيانات'));
      meta.appendChild(el('span', 'small muted', hasData()
        ? Fmt.int(st.people.length) + ' شخص' + (st.headers.length ? ' · ' + Fmt.int(st.headers.length) + ' عمود' : '') + (st.sheetName ? ' · ورقة ' + st.sheetName : '')
        : Fmt.int(st.rawRows.length) + ' صف بانتظار ربط الأعمدة'));
      body.appendChild(meta);
      var acts = el('div', 'row g2 wrap');
      acts.appendChild(btn(hasData() ? 'متابعة' : 'ربط الأعمدة', { variant: 'primary', size: 'sm', onClick: function () { goto(hasData() ? 'allocate' : 'map'); } }));
      if (hasGrid()) acts.appendChild(btn('الأعمدة', { size: 'sm', onClick: function () { goto('map'); } }));
      acts.appendChild(btn('إزالة', { variant: 'danger', size: 'sm', icon: 'trash', onClick: confirmClearFile }));
      body.appendChild(acts);
      info.appendChild(body);
      wrap.appendChild(info);
    }

    var how = el('section', 'how mt6 mount mount-3');
    how.appendChild(el('h2', 'section-label', 'كيف يعمل'));
    var hs = el('ol', 'how-steps');
    [
      ['table', 'ربط الأعمدة', 'حدّد عمود الاسم والفئة وما تريد من الأعمدة الاختيارية. الفئات المكتوبة بصيغ مختلفة تُطابق تلقائيًا.'],
      ['coins', 'المبالغ والقواعد', 'أدخل مبلغ كل مجمع ونسبة خصمه، واختر طريقة الوزن والتقريب والحد الأقصى.'],
      ['people', 'المراجعة', 'صحّح أي صف مباشرة، وكل تعديل يُعاد حسابه فورًا مع إمكانية التراجع.'],
      ['download', 'التقارير', 'تقرير كامل بكل الأوراق، وكشف صرف جاهز للتوقيع، وعرض مطابق للشاشة.']
    ].forEach(function (s) {
      var li = el('li', 'how-step');
      var ic = el('span', 'how-icon');
      ic.appendChild(Icons.svg(s[0]));
      li.appendChild(ic);
      li.appendChild(el('b', null, s[1]));
      li.appendChild(el('span', 'small muted', s[2]));
      hs.appendChild(li);
    });
    how.appendChild(hs);
    wrap.appendChild(how);
    return wrap;
  }
  Q.screens.upload = screenUpload;

  function confirmClearFile() {
    var st = S();
    UI.confirmModal({
      title: 'إزالة الملف الحالي؟',
      message: 'سيُحذف ' + Fmt.int(st.people.length || st.rawRows.length) + ' صف مع كل التعديلات اليدوية عليها. الفئات والمجمعات والقواعد تبقى كما هي.',
      confirmLabel: 'إزالة', danger: true,
      onConfirm: function () {
        var backup = Store.serializeBundle(st);
        clearData();
        goto('upload');
        UI.toast('تمت إزالة الملف', 'ok', { label: 'تراجع', onClick: function () { var b = Store.deserializeBundle(backup); if (b.ok) Q.applyBundle(b, true); } });
      }
    });
  }
  function clearData() {
    var st = S();
    st.people = []; st.sourceGrid = []; st.headerRow = 0; st.headers = []; st.rawRows = []; st.mapping = {};
    st.penaltyScale = 'auto'; st.fileName = ''; st.sheetName = ''; st.workbook = null; st.result = null;
    st.undoStack = []; st.redoStack = []; st.selection = {}; st.baseline = null; st.mappedFromGrid = false;
    st.filters = emptyFilters(); st.sort = { key: null, dir: null };
    save.failure = ''; save.failures = Object.create(null); save.warned = false;
    Store.clear('session');
    paintSaveStatus();
  }
  Q.clearData = clearData;

  function guardReplace(proceed, what) {
    var st = S();
    if (!st.people.length && !st.rawRows.length) { proceed(); return; }
    UI.confirmModal({
      title: 'استبدال البيانات الحالية؟',
      message: 'سيُستبدل ' + Fmt.int(st.people.length || st.rawRows.length) + ' صف وكل التعديلات اليدوية ب' + what + '. يمكنك تنزيل نسخة احتياطية أولًا.',
      confirmLabel: 'استبدال', danger: true,
      altLabel: 'تنزيل نسخة ثم الاستبدال',
      onAlt: function () { Q.exportSessionBundle(); proceed(); },
      onConfirm: proceed
    });
  }
  Q.guardReplace = guardReplace;

  function loadDemo() { guardReplace(loadDemoConfirmed, 'البيانات التجريبية'); }
  function loadStress(count) {
    guardReplace(function () {
      Busy.run('جارٍ توليد ' + Fmt.int(count) + ' صف وحسابها…', function () {
        var st = S();
        st.people = DemoData.people(count, 20260807);
        st.penaltyScale = 'fraction';
        st.undoStack = []; st.redoStack = []; st.selection = {}; st.baseline = null;
        st.sourceGrid = []; st.headerRow = 0; st.headers = []; st.rawRows = []; st.mapping = {};
        st.mappedFromGrid = false;
        st.fileName = 'اختبار حمل (' + Fmt.int(count) + ' صف)';
        st.sheetName = ''; st.workbook = null;
        st.filters = emptyFilters(); st.sort = { key: null, dir: null };
        st.__restore = null;
        var t0 = performance.now();
        recompute();
        return performance.now() - t0;
      }).then(function (ms) {
        goto('allocate');
        UI.toast('حُسب ' + Fmt.int(count) + ' صف في ' + (ms / 1000).toFixed(2) + ' ث', 'ok');
      });
    }, 'بيانات اختبار الحمل');
  }
  Q.loadStress = loadStress;
  function openStressPicker() {
    var m = UI.modal({ title: 'اختبار الحمل', subtitle: 'بيانات مولّدة لقياس السرعة على جهازك', size: 'sm' });
    var list = el('div', 'stress-list');
    [[10000, 'خفيف'], [100000, 'كبير'], [250000, 'ضخم'], [1000000, 'مليون صف'], [2000000, 'مليونا صف']].forEach(function (x) {
      var b = el('button', 'stress-opt');
      b.type = 'button';
      b.appendChild(el('b', 'num', Fmt.int(x[0])));
      b.appendChild(el('span', null, x[1]));
      b.addEventListener('click', function () { m.close(); setTimeout(function () { loadStress(x[0]); }, 180); });
      list.appendChild(b);
    });
    m.body.appendChild(list);
    m.body.appendChild(el('p', 'small muted mt3', 'فوق 15 ألف صف يُحفظ العمل في IndexedDB بصيغة عمودية مضغوطة.'));
  }
  Q.openStressPicker = openStressPicker;
  function loadDemoConfirmed() {
    var st = S();
    var people = DemoData.people(240, 20260807);
    st.people = people;
    st.penaltyScale = 'fraction';
    st.undoStack = []; st.redoStack = []; st.selection = {}; st.baseline = null;
    st.sourceGrid = [['الرقم الوظيفي', 'الاسم', 'الوظيفة', 'القسم', 'الفئة', 'أيام العمل', 'نسبة الجزاء', 'المعامل اليدوي', 'قيمة مخصصة', 'ملاحظات']].concat(people.map(function (p) {
      return [p.code, p.name, p.job, p.dept, p.tier, p.daysWorked == null ? '' : p.daysWorked, p.penaltyRate == null ? '' : p.penaltyRate, p.manualFactor == null ? '' : p.manualFactor, p.overrideValue == null ? '' : p.overrideValue, p.notes];
    }));
    st.headerRow = 0;
    deriveGrid();
    st.mapping = Importer.autoMap(st.headers);
    st.mappedFromGrid = true;
    st.fileName = 'بيانات تجريبية (240 شخصًا)';
    st.sheetName = '';
    st.workbook = null;
    st.filters = emptyFilters();
    st.__restore = null;
    recompute();
    goto('allocate');
    UI.toast('تم تحميل بيانات تجريبية — فيها حالات خاصة وصف بدون فئة لتجربة التنبيهات', 'ok');
  }
  Q.loadDemo = loadDemo;

  function handleFile(file) {
    if (/\.json$/i.test(file.name) || file.type === 'application/json') { Q.readBundleFile(file); return; }
    var textual = /\.(csv|tsv|txt)$/i.test(file.name);
    var limit = textual ? 400 : 150;
    if (file.size > limit * 1024 * 1024) { UI.toast('الملف أكبر من ' + limit + ' م.ب' + (textual ? '' : ' — احفظه كـ CSV ليُقرأ أسرع وبحجم أكبر'), 'danger'); return; }
    guardReplace(function () { readFile(file); }, 'الملف الجديد');
  }
  Q.handleFile = handleFile;

  function readFile(file) {
    var isText = /\.(csv|tsv|txt)$/i.test(file.name) || /^text\//.test(file.type);
    if (!isText && !Exporter.available()) {
      UI.toast('محرك Excel غير محمّل (يحتاج اتصالًا بالإنترنت مرة واحدة). احفظ الملف كـ CSV أو الصقه من Excel.', 'danger');
      return;
    }
    var reader = new FileReader();
    Busy.show('جارٍ قراءة «' + file.name + '» (' + Fmt.kb(file.size) + ')…');
    reader.onerror = function () { Busy.hide(); UI.toast('تعذّر قراءة الملف', 'danger'); };
    reader.onload = function (e) {
      setTimeout(function () {
        var sheets;
        try {
          if (isText) sheets = [{ name: '', grid: Importer.readCsv(Importer.decodeText(e.target.result)) }];
          else {
            var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true, dense: true, cellHTML: false, cellFormula: false, cellStyles: false });
            sheets = wb.SheetNames.map(function (n) {
              return { name: n, grid: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, blankrows: false, defval: '', raw: true }) };
            }).filter(function (s) { return s.grid.length > 0; });
          }
        } catch (err) {
          Busy.hide();
          UI.toast('الملف غير مقروء — تأكد أنه Excel أو CSV صحيح وغير محمي بكلمة مرور', 'danger');
          return;
        }
        (sheets || []).forEach(function (s) { cleanGrid(s.grid); });
        Busy.hide();
        var best = sheets.slice().sort(function (a, b) { return b.grid.length - a.grid.length; })[0];
        if (!best || best.grid.length < 2) { UI.toast('الملف يحتاج صف عناوين وصف بيانات واحد على الأقل', 'warn'); return; }
        loadGrid(best.grid, file.name, best.name, sheets.length > 1 ? sheets : null);
      }, 30);
    };
    reader.readAsArrayBuffer(file);
  }
  function cleanGrid(grid) {
    for (var r = 0; r < grid.length; r++) {
      var row = grid[r];
      if (!row) { grid[r] = []; continue; }
      for (var c = 0; c < row.length; c++) {
        var v = row[c];
        if (typeof v === 'string') { if (v.length && (v.charCodeAt(0) <= 32 || v.charCodeAt(v.length - 1) <= 32 || v.indexOf('\u00a0') !== -1)) row[c] = v.replace(/\u00a0/g, ' ').trim(); }
        else if (v instanceof Date) row[c] = Fmt.isoDate(v.getTime());
      }
    }
    return grid;
  }
  function cleanCell(v) {
    if (v instanceof Date) return Fmt.isoDate(v.getTime());
    if (typeof v === 'string') return v.replace(/\u00a0/g, ' ').trim();
    return v;
  }
  function loadGrid(grid, fileName, sheetName, sheets) {
    var st = S();
    st.sourceGrid = grid;
    st.headerRow = Importer.detectHeaderRow(grid);
    deriveGrid();
    st.mapping = Importer.autoMap(st.headers);
    st.penaltyScale = 'auto';
    st.fileName = fileName;
    st.sheetName = sheetName || '';
    st.workbook = sheets;
    st.people = [];
    st.result = null;
    st.undoStack = []; st.redoStack = []; st.selection = {}; st.baseline = null;
    st.filters = emptyFilters();
    st.mappedFromGrid = false;
    st.__restore = null;
    scheduleSave();
    goto('map');
    UI.toast('تمت قراءة ' + Fmt.int(st.rawRows.length) + ' صف' + (sheets ? ' من ورقة «' + sheetName + '»' : '') + ' — راجع ربط الأعمدة', 'ok');
  }
  Q.loadGrid = loadGrid;

  function openPasteModal() {
    var m = UI.modal({ title: 'لصق من Excel', subtitle: 'انسخ الجدول كاملًا مع صف العناوين من Excel أو Google Sheets والصقه هنا', wide: true });
    var ta = el('textarea', 'input textarea paste-area');
    ta.setAttribute('aria-label', 'البيانات الملصوقة');
    ta.placeholder = 'الاسم\tالقسم\tالفئة\nأحمد محمد\tالحسابات\tمدير\n…';
    ta.dir = 'auto';
    m.body.appendChild(ta);
    var status = el('div', 'small muted mt2', 'لم تُلصق بيانات بعد');
    status.setAttribute('aria-live', 'polite');
    m.body.appendChild(status);
    var go;
    function parse() { return Importer.readCsv(ta.value || ''); }
    ta.addEventListener('input', function () {
      var g = parse();
      var cols = g[0] ? g[0].length : 0;
      status.textContent = g.length ? Fmt.int(Math.max(0, g.length - 1)) + ' صف × ' + Fmt.int(cols) + ' عمود' : 'لم تُلصق بيانات بعد';
      go.disabled = g.length < 2;
    });
    m.foot.appendChild(el('div', 'spacer'));
    m.foot.appendChild(btn('إلغاء', { variant: 'ghost', onClick: m.close }));
    go = btn('متابعة لربط الأعمدة', { variant: 'primary', disabled: true, onClick: function () {
      var g = parse().map(function (r) { return r.map(cleanCell); });
      m.close();
      guardReplace(function () { loadGrid(g, 'بيانات ملصوقة', '', null); }, 'البيانات الملصوقة');
    } });
    m.foot.appendChild(go);
  }
  Q.openPasteModal = openPasteModal;

  function applyMapping() {
    var st = S();
    var tierNames = Object.keys(st.tiers), poolNames = Object.keys(st.pools);
    var scale = Importer.detectPenaltyScale(st.rawRows, st.mapping.penaltyRate, st.penaltyScale);
    var unknownPools = Object.create(null);
    var raw = st.rawRows, out = new Array(raw.length);
    for (var i = 0; i < raw.length; i++) {
      var p = Importer.rowToPerson(raw[i], st.mapping, i + 1, tierNames, poolNames, scale, st.tierAliases);
      if (p.unknownPool) unknownPools[p.unknownPool] = (unknownPools[p.unknownPool] || 0) + 1;
      delete p.unknownPool;
      out[i] = p;
    }
    st.people = out;
    st.undoStack = []; st.redoStack = []; st.selection = {}; st.baseline = null;
    st.filters = emptyFilters();
    st.mappedFromGrid = true;
    recompute();
    var up = Object.keys(unknownPools);
    if (up.length) UI.toast('تم تجاهل تثبيت على ' + up.length + ' مجمع غير معرّف: ' + up.slice(0, 3).join('، '), 'warn', 7000);
  }
  Q.applyMapping = applyMapping;

  function screenMap() {
    var st = S();
    var wrap = el('div', 'screen-map');
    wrap.appendChild(pageHead('اربط الأعمدة', 'حدّد أي عمود في ملفك يقابل كل حقل. الاسم والفئة مطلوبان، وكل حقل اختياري تتركه يأخذ قيمته الافتراضية.', null, stepEyebrow('map')));
    if (!hasGrid()) {
      wrap.appendChild(UI.notice({ tone: 'accent', title: 'لا يوجد ملف أصلي محفوظ', text: 'البيانات الحالية محمّلة من نسخة أو من ملف كبير لم تتسع له مساحة المتصفح. لتغيير الربط ارفع الملف مرة أخرى.', actions: [btn('رفع ملف', { size: 'sm', onClick: function () { goto('upload'); } })] }));
      wrap.appendChild(navFoot('upload', hasData() ? 'amounts' : null, 'المبالغ'));
      return wrap;
    }
    var fields = Importer.FIELDS;
    var tierRequired = st.options.weighting !== 'equal';
    var missing = fields.filter(function (f) { return f.required && (f.key !== 'tier' || tierRequired) && st.mapping[f.key] == null; });

    var layout = el('div', 'map-layout');
    var main = el('div', 'stack g4');

    var src = card('مصدر البيانات', st.fileName + ' — ' + Fmt.int(st.rawRows.length) + ' صف', [btn('إعادة الربط التلقائي', {
      icon: 'sparkle', size: 'sm', variant: 'ghost', onClick: function () { st.mapping = Importer.autoMap(st.headers); scheduleSave(); renderScreen(); UI.toast('تمت إعادة الربط التلقائي', 'ok'); }
    })], 'mount');
    var srcBody = el('div', 'card-pad grid-3');
    if (st.workbook && st.workbook.length > 1) {
      srcBody.appendChild(UI.field('الورقة', UI.dropdown({
        block: true,
        options: st.workbook.map(function (s) { return { value: s.name, label: s.name, hint: Fmt.int(Math.max(0, s.grid.length - 1)) + ' صف' }; }),
        value: st.sheetName, ariaLabel: 'الورقة',
        onChange: function (v) {
          var s = st.workbook.filter(function (x) { return x.name === v; })[0];
          if (!s) return;
          st.sourceGrid = s.grid; st.sheetName = s.name;
          st.headerRow = Importer.detectHeaderRow(s.grid);
          deriveGrid();
          st.mapping = Importer.autoMap(st.headers);
          scheduleSave();
          renderScreen();
        }
      }), 'الملف فيه ' + st.workbook.length + ' أوراق'));
    }
    var hrOpts = [];
    for (var r = 0; r < Math.min(12, st.sourceGrid.length - 1); r++) {
      var preview = (st.sourceGrid[r] || []).filter(function (c) { return c !== '' && c != null; }).slice(0, 3).join(' · ');
      hrOpts.push({ value: String(r), label: 'الصف ' + (r + 1), hint: preview || 'فارغ' });
    }
    srcBody.appendChild(UI.field('صف العناوين', UI.dropdown({
      block: true, options: hrOpts, value: String(st.headerRow), ariaLabel: 'صف العناوين',
      onChange: function (v) { st.headerRow = Number(v); deriveGrid(); st.mapping = Importer.autoMap(st.headers); scheduleSave(); renderScreen(); }
    }), 'اكتُشف تلقائيًا — غيّره إذا كان فوق الجدول عنوان أو شعار'));
    var detected = Importer.detectPenaltyScale(st.rawRows, st.mapping.penaltyRate, 'auto') === 100 ? 'نسب مئوية' : 'كسور';
    srcBody.appendChild(UI.field('قراءة نسبة الجزاء', UI.dropdown({
      block: true,
      options: [
        { value: 'auto', label: 'تلقائي', hint: 'المكتشف: ' + detected },
        { value: 'percent', label: 'نسب مئوية', hint: '10 تعني 10%' },
        { value: 'fraction', label: 'كسور', hint: '0.1 تعني 10%' }
      ],
      value: st.penaltyScale || 'auto', ariaLabel: 'طريقة قراءة نسبة الجزاء',
      onChange: function (v) { st.penaltyScale = v; scheduleSave(); renderScreen(); }
    }), st.mapping.penaltyRate == null ? 'عمود الجزاء غير مربوط' : 'إذا كانت القيم 0 و1 فقط حدّد الطريقة بنفسك'));
    src.appendChild(srcBody);
    main.appendChild(src);

    var mapCard = card('ربط الحقول', missing.length ? 'حقول مطلوبة غير مربوطة: ' + missing.map(function (f) { return f.label; }).join('، ') : 'كل الحقول المطلوبة مربوطة', null, 'mount mount-1');
    var list = el('div', 'map-list');
    var headerOpts = [{ value: '', label: '— غير مربوط —' }];
    st.headers.forEach(function (h, i) { headerOpts.push({ value: String(i), label: h }); });
    fields.forEach(function (f) {
      var isReq = f.required && (f.key !== 'tier' || tierRequired);
      var mapped = st.mapping[f.key] != null;
      var row = el('div', 'map-row' + (isReq && !mapped ? ' is-missing' : '') + (mapped ? ' is-mapped' : ''));
      var lab = el('div', 'map-label');
      var dot = el('span', 'map-dot');
      if (mapped) dot.appendChild(Icons.svg('check'));
      lab.appendChild(dot);
      var lt = el('div', 'stack');
      var ln = el('span', 'map-name', f.label);
      if (isReq) ln.appendChild(el('span', 'req', ' *'));
      lt.appendChild(ln);
      var sample = '';
      if (mapped) {
        var vals = [];
        for (var i = 0; i < st.rawRows.length && vals.length < 3; i++) {
          var v = st.rawRows[i][st.mapping[f.key]];
          if (v != null && v !== '') vals.push(String(v));
        }
        sample = vals.length ? vals.join(' · ') : 'العمود فارغ';
      } else sample = isReq ? 'مطلوب' : (f.key === 'tier' && !tierRequired ? 'غير مطلوب في وضع «بالتساوي»' : 'اختياري');
      lt.appendChild(el('span', 'map-sample', sample));
      lab.appendChild(lt);
      row.appendChild(lab);
      var dd = UI.dropdown({
        block: true, options: headerOpts, value: mapped ? String(st.mapping[f.key]) : '', ariaLabel: 'العمود المقابل لـ ' + f.label, searchable: st.headers.length > 10,
        onChange: function (v) {
          if (v === '') delete st.mapping[f.key];
          else {
            Object.keys(st.mapping).forEach(function (k) { if (k !== f.key && st.mapping[k] === Number(v)) delete st.mapping[k]; });
            st.mapping[f.key] = Number(v);
          }
          scheduleSave();
          renderScreen();
        }
      });
      row.appendChild(dd);
      list.appendChild(row);
    });
    mapCard.appendChild(list);
    main.appendChild(mapCard);
    layout.appendChild(main);

    var aside = el('div', 'stack g4');
    aside.appendChild(tierMatchCard());
    aside.appendChild(importSummaryCard(missing));
    layout.appendChild(aside);
    wrap.appendChild(layout);

    var prev = card('معاينة', 'أول 6 صفوف كما قُرئت من الملف', null, 'mt4 mount mount-2');
    var tw = el('div', 'table-wrap');
    var t = el('table', 'dt compact');
    var thead = el('thead'), htr = el('tr');
    st.headers.forEach(function (h, i) {
      var f = fields.filter(function (x) { return st.mapping[x.key] === i; })[0];
      var th = el('th', f ? 'is-mapped' : null);
      var inner = el('div', 'th-stack');
      inner.appendChild(el('span', null, h));
      inner.appendChild(f ? UI.badge(f.label, 'accent') : el('span', 'tiny muted', 'غير مستخدم'));
      th.appendChild(inner);
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    t.appendChild(thead);
    var tb = el('tbody');
    st.rawRows.slice(0, 6).forEach(function (row) {
      var tr = el('tr');
      st.headers.forEach(function (h, i) { tr.appendChild(el('td', null, row[i] == null || row[i] === '' ? '—' : String(row[i]))); });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    tw.appendChild(t);
    prev.appendChild(el('div', 'card-pad-sm', tw));
    wrap.appendChild(prev);

    wrap.appendChild(navFoot('upload', 'amounts', hasData() && st.mappedFromGrid ? 'إعادة تطبيق الربط' : 'تأكيد الربط', function () {
      return missing.length === 0 ? true : 'اربط الحقول المطلوبة أولًا';
    }, function () {
      if (hasData() && st.undoStack.length) {
        UI.confirmModal({
          title: 'إعادة قراءة الصفوف من الملف؟',
          message: 'عندك ' + Fmt.int(st.undoStack.length) + ' تعديل على الصفوف ستُفقد، لأن كل الصفوف ستُقرأ من جديد بالربط الحالي. الإعدادات لا تتأثر.',
          confirmLabel: 'إعادة القراءة', danger: true,
          altLabel: 'متابعة بدون إعادة قراءة',
          onAlt: function () { goto('amounts'); },
          onConfirm: function () { mapBusy(function () { goto('amounts'); }); }
        });
        return false;
      }
      if (st.rawRows.length > 30000) { mapBusy(function () { goto('amounts'); }); return false; }
      applyMapping();
    }));
    return wrap;
  }
  Q.screens.map = screenMap;
  function mapBusy(after) {
    Busy.run('جارٍ قراءة ' + Fmt.int(S().rawRows.length) + ' صف…', applyMapping).then(after, function (e) { UI.toast('تعذّر تطبيق الربط: ' + (e && e.message || e), 'danger'); });
  }

  function tierMatchCard() {
    var st = S();
    var c = card('مطابقة الفئات', 'القيم المكتوبة في عمود الفئة وما تقابله في إعداداتك', null, 'mount mount-1');
    var body = el('div', 'card-pad-sm');
    if (st.options.weighting === 'equal') {
      body.appendChild(el('div', 'small muted pad', 'طريقة الوزن الحالية «بالتساوي» — الفئة لا تؤثر على الحساب.'));
      c.appendChild(body);
      return c;
    }
    if (st.mapping.tier == null) {
      body.appendChild(el('div', 'small muted pad', 'اربط عمود الفئة لرؤية المطابقة.'));
      c.appendChild(body);
      return c;
    }
    var names = Object.keys(st.tiers);
    var dkey = st.headerRow + ':' + st.mapping.tier;
    if (!(st.__distinct && st.__distinctFor === st.sourceGrid && st.__distinctKey === dkey)) {
      st.__distinct = Importer.distinctTiers(st.sourceGrid, st.headerRow, st.mapping.tier);
      st.__distinctFor = st.sourceGrid; st.__distinctKey = dkey;
    }
    var values = st.__distinct;
    var unknown = 0;
    var list = el('div', 'tier-match');
    values.slice(0, 60).forEach(function (v) {
      var direct = v.raw ? Engine.canonicalizeTierName(v.raw, names) : null;
      var alias = !direct && v.raw ? Engine.canonicalizeTierName(v.raw, names, st.tierAliases) : null;
      var row = el('div', 'tm-row' + (!direct && !alias ? ' is-unknown' : ''));
      var left = el('div', 'tm-name');
      left.appendChild(el('span', null, v.raw || '(فارغ)'));
      left.appendChild(el('span', 'tm-count', Fmt.int(v.count)));
      row.appendChild(left);
      if (direct) { row.appendChild(UI.badge(direct === v.raw ? 'مطابقة' : '= ' + direct, 'ok', 'check')); }
      else if (!v.raw) { unknown += v.count; row.appendChild(UI.badge('بلا فئة', 'danger')); }
      else {
        if (!alias) unknown += v.count;
        var opts = [{ value: '', label: '— غير معرّفة —', tone: 'danger' }];
        names.forEach(function (n) { opts.push({ value: n, label: n, hint: Fmt.egp(st.tiers[n], 0) }); });
        opts.push({ separator: true });
        opts.push({ value: '__new__', label: 'إضافة «' + v.raw + '» كفئة جديدة…', icon: 'plus' });
        row.appendChild(UI.dropdown({
          size: 'sm', options: opts, value: alias || '', ariaLabel: 'مطابقة الفئة ' + v.raw, align: 'end',
          onChange: function (val) {
            if (val === '__new__') { Q.promptNewTier(v.raw, function () { renderScreen(); }); return; }
            pushUndo('مطابقة فئة ' + v.raw);
            if (val) st.tierAliases[v.key] = val; else delete st.tierAliases[v.key];
            if (st.people.length) {
              updatePeople(null, function (p) { return Engine.normalizeForTierMatch(p.tier) === v.key && val ? { tier: val } : null; });
              recompute();
            }
            scheduleSave();
            renderScreen();
          }
        }));
      }
      list.appendChild(row);
    });
    if (values.length > 60) list.appendChild(el('div', 'tiny muted pad', 'و' + Fmt.int(values.length - 60) + ' قيمة أخرى…'));
    body.appendChild(list);
    if (unknown) body.appendChild(UI.notice({ tone: 'warn', compact: true, text: Fmt.int(unknown) + ' شخص بفئة غير معرّفة سيخرجون من التوزيع. طابِق فئتهم أو أضفها.' }));
    c.appendChild(body);
    return c;
  }

  function importSummaryCard(missing) {
    var st = S();
    var c = card('ملخص الاستيراد', null, null, 'mount mount-2');
    var body = el('div', 'card-pad stack g2');
    var nameCol = st.mapping.name, blank = 0, dup = 0;
    if (nameCol != null) {
      var key = nameCol + ':' + st.rawRows.length;
      if (st.__nameStats && st.__nameStatsFor === st.rawRows && st.__nameStatsKey === key) { blank = st.__nameStats.blank; dup = st.__nameStats.dup; }
      else {
        var seen = new Set(), rows = st.rawRows;
        for (var i = 0; i < rows.length; i++) {
          var n = Engine.normalizeLoose(rows[i][nameCol]);
          if (!n) blank++; else if (seen.has(n)) dup++; else seen.add(n);
        }
        st.__nameStats = { blank: blank, dup: dup }; st.__nameStatsFor = st.rawRows; st.__nameStatsKey = key;
      }
    }
    function line(label, value, tone) {
      var r = el('div', 'sum-line');
      r.appendChild(el('span', null, label));
      r.appendChild(tone ? UI.badge(value, tone) : el('b', 'num', value));
      return r;
    }
    body.appendChild(line('الصفوف', Fmt.int(st.rawRows.length)));
    body.appendChild(line('الأعمدة المربوطة', Fmt.int(Object.keys(st.mapping).length) + ' من ' + Fmt.int(st.headers.length)));
    if (nameCol != null) {
      body.appendChild(line('صفوف بلا اسم', Fmt.int(blank), blank ? 'warn' : 'ok'));
      body.appendChild(line('أسماء مكررة', Fmt.int(dup), dup ? 'warn' : 'ok'));
    }
    if (missing.length) body.appendChild(line('حقول مطلوبة ناقصة', Fmt.int(missing.length), 'danger'));
    c.appendChild(body);
    return c;
  }

  function promptNewTier(name, done) {
    var st = S();
    var m = UI.modal({ title: 'فئة جديدة', subtitle: 'القيمة هي وزن الفئة النسبي — مثلًا 450 مقابل 900 تعني نصف النصيب', size: 'sm' });
    var nameIn = UI.input({ value: name || '', ariaLabel: 'اسم الفئة' });
    var vals = Object.keys(st.tiers).map(function (k) { return st.tiers[k]; }).sort(function (a, b) { return a - b; });
    var suggest = vals.length ? vals[Math.floor(vals.length / 2)] : 100;
    var valIn = UI.input({ value: Fmt.plain(suggest), numeric: true, ariaLabel: 'قيمة الفئة' });
    m.body.appendChild(el('div', 'stack g4', [UI.field('اسم الفئة', nameIn), UI.field('القيمة', valIn, 'اقتراح: الوسيط بين فئاتك الحالية')]));
    function submit() {
      var n = String(nameIn.value || '').trim(), v = Fmt.parseNumber(valIn.value);
      if (!n) { UI.toast('اكتب اسم الفئة', 'warn'); nameIn.focus(); return; }
      if (st.tiers[n] != null) { UI.toast('توجد فئة بنفس الاسم', 'warn'); nameIn.focus(); return; }
      if (v == null || v < 0) { UI.toast('أدخل قيمة رقمية صحيحة', 'warn'); valIn.focus(); return; }
      pushUndo('إضافة فئة ' + n);
      st.tiers[n] = v;
      if (name && n !== name) st.tierAliases[Engine.normalizeForTierMatch(name)] = n;
      var key = Engine.normalizeForTierMatch(name || n);
      updatePeople(null, function (p) { return Engine.normalizeForTierMatch(p.tier) === key ? { tier: n } : null; });
      recompute();
      scheduleSave();
      m.close();
      UI.toast('أُضيفت الفئة «' + n + '»', 'ok');
      if (done) done(n);
    }
    [nameIn, valIn].forEach(function (i) { i.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); }); });
    m.foot.appendChild(el('div', 'spacer'));
    m.foot.appendChild(btn('إلغاء', { variant: 'ghost', onClick: m.close }));
    m.foot.appendChild(btn('إضافة', { variant: 'primary', icon: 'plus', onClick: submit }));
  }
  Q.promptNewTier = promptNewTier;

  function poolTotals() {
    var st = S(), names = Object.keys(st.pools);
    var b = Engine.poolBudgets(st.pools);
    var gross = 0, net = 0;
    names.forEach(function (n) { gross += b.budgets[n].declared; net += b.budgets[n].net; });
    return { names: names, grossPi: gross, netPi: net, budgets: b.budgets };
  }
  Q.poolTotals = poolTotals;

  function screenAmounts() {
    var st = S();
    var wrap = el('div', 'screen-amounts');
    wrap.appendChild(pageHead('المبالغ والقواعد', 'أدخل مبلغ كل مجمع ونسبة الخصم عليه، ثم اختر قواعد التوزيع. كل رقم تكتبه ينعكس فورًا على الملخص.', [undoButtons()], stepEyebrow('amounts')));

    Q.hosts.amountsSummary = el('div', 'mount');
    wrap.appendChild(Q.hosts.amountsSummary);

    var layout = el('div', 'amounts-layout mt4');
    var left = el('div', 'stack g4');
    left.appendChild(poolsCard());
    left.appendChild(tiersCard());
    layout.appendChild(left);
    var right = el('div', 'stack g4');
    right.appendChild(rulesCard());
    right.appendChild(periodCard());
    layout.appendChild(right);
    wrap.appendChild(layout);
    renderAmountsLive();

    wrap.appendChild(navFoot(hasGrid() ? 'map' : 'upload', 'allocate', 'احسب التوزيع', function () {
      if (!Object.keys(st.pools).length) return 'أضف مجمعًا واحدًا على الأقل';
      if (poolTotals().grossPi <= 0) return 'أدخل مبلغًا أكبر من صفر';
      return true;
    }));
    return wrap;
  }
  Q.screens.amounts = screenAmounts;

  function poolsCard() {
    var st = S();
    var c = card('المجمعات', 'كل مجمع مصدر مبلغ منفصل بنسبة خصم خاصة به (ضريبة أو دمغة أو أي استقطاع).', [btn('مجمع جديد', { icon: 'plus', size: 'sm', variant: 'primary', onClick: addPool })], 'mount mount-1');
    var body = el('div', 'card-pad pool-list');
    var names = Object.keys(st.pools);
    Q.hosts.poolNet = {};
    if (!names.length) body.appendChild(UI.emptyState('لا يوجد أي مجمع', 'أضف مجمعًا واحدًا على الأقل حتى يمكن التوزيع.', btn('مجمع جديد', { icon: 'plus', variant: 'primary', onClick: addPool }), 'coins'));
    names.forEach(function (name, idx) {
      var p = st.pools[name];
      var item = el('div', 'pool-item');
      item.style.setProperty('--pc', 'var(--pool-' + (idx % 6) + ')');
      var top = el('div', 'pool-item-top');
      top.appendChild(el('span', 'pool-swatch'));
      var nameIn = UI.input({ value: name, ariaLabel: 'اسم المجمع', cls: 'pool-name', maxLength: 60, onChange: function (v) { renamePool(name, v); } });
      nameIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') nameIn.blur(); if (e.key === 'Escape') { nameIn.value = name; nameIn.blur(); } });
      top.appendChild(nameIn);
      var pinned = pinCounts()[name] || 0;
      if (pinned) top.appendChild(UI.attachTip(UI.badge(Fmt.int(pinned) + ' مثبّت', 'info', 'pin'), 'أشخاص مثبّتون يدويًا على هذا المجمع'));
      var del = UI.iconBtn('trash', names.length <= 1 ? 'لا يمكن حذف آخر مجمع' : 'حذف المجمع', function () { removePool(name); }, 'sm');
      if (names.length <= 1) del.disabled = true;
      top.appendChild(del);
      item.appendChild(top);

      var fields = el('div', 'pool-item-fields');
      var grossIn = UI.input({
        value: p.gross, numeric: true, grouped: true, suffix: 'ج.م', ariaLabel: 'إجمالي ' + name,
        onInput: function (v) { var n = Fmt.parseNumber(v); st.pools[name].gross = n == null || n < 0 ? 0 : n; renderPoolNet(name); recomputeDebounced(renderAmountsLive); },
        onChange: function (v) { var n = Fmt.parseNumber(v); st.pools[name].gross = n == null || n < 0 ? 0 : n; recomputeNow(function () { renderAmountsLive(); Q.renderStepper(); }); }
      });
      trackUndo(grossIn.input, 'تعديل إجمالي ' + name);
      fields.appendChild(UI.field('الإجمالي', grossIn));
      var taxIn = UI.input({
        value: Fmt.pctValue(p.taxRate), numeric: true, suffix: '%', ariaLabel: 'نسبة خصم ' + name,
        onInput: function (v) { var n = Fmt.parseNumber(v); st.pools[name].taxRate = n == null ? 0 : Engine.clamp(n / 100, 0, 0.9999); renderPoolNet(name); recomputeDebounced(renderAmountsLive); },
        onChange: function (v, i) { var n = Fmt.parseNumber(v); st.pools[name].taxRate = n == null ? 0 : Engine.clamp(n / 100, 0, 0.9999); i.value = Fmt.pctValue(st.pools[name].taxRate); recomputeNow(renderAmountsLive); }
      });
      trackUndo(taxIn.input, 'تعديل خصم ' + name);
      fields.appendChild(UI.field('الخصم', taxIn));
      var net = el('div', 'pool-net');
      net.appendChild(el('div', 'field-label', 'الصافي للتوزيع'));
      var netVal = el('div', 'pool-net-val');
      net.appendChild(netVal);
      var netSub = el('div', 'field-help');
      net.appendChild(netSub);
      Q.hosts.poolNet[name] = { val: netVal, sub: netSub };
      fields.appendChild(net);
      item.appendChild(fields);
      body.appendChild(item);
      renderPoolNet(name);
    });
    c.appendChild(body);
    return c;
  }

  function renderPoolNet(name) {
    var st = S(), h = Q.hosts.poolNet && Q.hosts.poolNet[name];
    if (!h || !st.pools[name]) return;
    var p = st.pools[name];
    var decl = Engine.toPiastres(p.gross), tax = Math.round(decl * p.taxRate);
    clearNode(h.val);
    h.val.appendChild(UI.moneyCell(decl - tax, { currency: true, size: 'lg' }));
    var pr = st.result && st.result.ok && st.result.poolResults[name];
    h.sub.textContent = pr ? Fmt.int(pr.memberCount) + ' مستحق · خصم ' + Fmt.piastres(tax) : 'خصم ' + Fmt.piastres(tax) + ' ج.م';
  }

  function renderAmountsLive() {
    var st = S();
    Object.keys(Q.hosts.poolNet || {}).forEach(renderPoolNet);
    var host = Q.hosts.amountsSummary;
    if (!host) return;
    clearNode(host);
    var t = poolTotals(), r = st.result;
    var row = el('div', 'kpi-row');
    row.appendChild(kpiCard('الإجمالي المُدخل', UI.moneyCell(t.grossPi, { size: 'lg', currency: true }), Fmt.int(t.names.length) + ' مجمع', 'flat', 'coins'));
    row.appendChild(kpiCard('الصافي للتوزيع', UI.moneyCell(t.netPi, { size: 'lg', currency: true }), 'بعد خصم ' + Fmt.piastres(t.grossPi - t.netPi) + ' ج.م', 'info', 'layers'));
    var paid = r && r.ok ? r.paidCount : 0;
    row.appendChild(kpiCard('المستحقون', UI.numText(r && r.ok ? Fmt.int(paid) : Fmt.int(st.people.length), 'lg'), 'من ' + Fmt.int(st.people.length) + ' شخص في الملف', 'flat', 'people'));
    var avg = r && r.ok && paid ? r.totals.net / paid : 0;
    row.appendChild(kpiCard('متوسط الصافي', r && r.ok ? UI.moneyCell(Math.round(avg), { size: 'lg', currency: true }) : UI.dash(), r && r.ok ? 'نصيب وحدة الوزن ' + Fmt.egp(r.kEffective, 4) : 'يظهر بعد الحساب', 'flat', 'person'));
    if (r && r.ok && r.totals.retained > 0) row.appendChild(kpiCard('غير موزّع', UI.moneyCell(r.totals.retained, { size: 'lg', currency: true }), 'بسبب وحدة التقريب أو الحد الأقصى', 'warn', 'warn'));
    host.appendChild(row);
    if (r && !r.ok && hasData()) {
      var n = Q.errorPanel(r);
      n.classList.add('mt3');
      host.appendChild(n);
    }
  }
  Q.renderAmountsLive = renderAmountsLive;

  function addPool() {
    var st = S(), base = 'مجمع جديد', name = base, i = 2;
    while (st.pools[name]) { name = base + ' ' + i; i++; }
    pushUndo('إضافة مجمع');
    st.pools[name] = { gross: 0, taxRate: 0 };
    recompute();
    renderScreen();
    setTimeout(function () {
      var ins = document.querySelectorAll('.pool-name');
      var last = ins[ins.length - 1];
      if (last) { last.focus(); last.select(); }
    }, 60);
  }
  Q.addPool = addPool;
  function renamePool(oldName, newName) {
    var st = S(), t = String(newName || '').trim();
    if (!t || t === oldName) { renderScreen(); return; }
    if (st.pools[t]) { UI.toast('يوجد مجمع بنفس الاسم', 'warn'); renderScreen(); return; }
    pushUndo('إعادة تسمية مجمع');
    var rebuilt = {};
    Object.keys(st.pools).forEach(function (k) { rebuilt[k === oldName ? t : k] = st.pools[k]; });
    st.pools = rebuilt;
    updatePeople(null, function (p) { return p.pinnedPool === oldName ? { pinnedPool: t } : null; });
    if (st.filters.pool === oldName) st.filters.pool = t;
    recompute();
    renderScreen();
  }
  function removePool(name) {
    var st = S();
    var pinned = pinCounts()[name] || 0;
    function doIt() {
      pushUndo('حذف مجمع ' + name);
      delete st.pools[name];
      updatePeople(null, function (p) { return p.pinnedPool === name ? { pinnedPool: null } : null; });
      if (st.filters.pool === name) st.filters.pool = '';
      recompute();
      renderScreen();
      UI.toast('تم حذف مجمع «' + name + '»', 'ok', { label: 'تراجع', onClick: undo });
    }
    if (!pinned && !st.pools[name].gross) { doIt(); return; }
    UI.confirmModal({
      title: 'حذف مجمع «' + name + '»؟',
      message: (pinned ? Fmt.int(pinned) + ' شخص مثبّت عليه سيُلغى تثبيتهم ويُعاد توزيعهم. ' : '') + 'سيُحذف مبلغه (' + Fmt.egp(st.pools[name].gross) + ' ج.م) من الحساب. يمكنك التراجع.',
      confirmLabel: 'حذف', danger: true, onConfirm: doIt
    });
  }

  function tiersCard() {
    var st = S();
    var c = card('الفئات', st.options.weighting === 'equal' ? 'الوزن الحالي «بالتساوي» — الفئات محفوظة لكنها لا تؤثر.' : 'قيمة كل فئة هي وزنها النسبي في التوزيع.', [btn('فئة جديدة', { icon: 'plus', size: 'sm', onClick: function () { promptNewTier('', function () { renderScreen(); }); } })], 'mount mount-2' + (st.options.weighting === 'equal' ? ' is-muted' : ''));
    var body = el('div', 'card-pad-sm');
    body.appendChild(tierEditor(function () { renderAmountsLive(); }));
    c.appendChild(body);
    return c;
  }

  function pinCounts() {
    var st = S();
    if (st.__pinCounts && st.__pinCountsFor === st.people) return st.__pinCounts;
    var c = Object.create(null), ppl = st.people;
    for (var i = 0; i < ppl.length; i++) { var p = ppl[i].pinnedPool; if (p) c[p] = (c[p] || 0) + 1; }
    st.__pinCounts = c; st.__pinCountsFor = ppl;
    return c;
  }
  Q.pinCounts = pinCounts;
  function tierUsage() {
    var st = S();
    if (st.__tierUse && st.__tierUseFor === st.people) return st.__tierUse;
    var u = Object.create(null), ppl = st.people;
    for (var i = 0; i < ppl.length; i++) { var t = ppl[i].tier; if (t) u[t] = (u[t] || 0) + 1; }
    st.__tierUse = u; st.__tierUseFor = ppl;
    return u;
  }
  Q.tierUsage = tierUsage;
  function tierEditor(onChangeLive) {
    var st = S();
    var usage = tierUsage();
    var names = Object.keys(st.tiers);
    var max = names.reduce(function (m, n) { return Math.max(m, st.tiers[n] || 0); }, 0) || 1;
    var wrap = el('div', 'tier-editor');
    var unknown = Object.keys(usage).filter(function (t) { return names.indexOf(t) === -1; });
    if (unknown.length && st.options.weighting !== 'equal') {
      var acts = unknown.slice(0, 6).map(function (t) { return btn('أضف «' + t + '»', { size: 'sm', icon: 'plus', onClick: function () { promptNewTier(t, function () { renderScreenIfMounted(); }); } }); });
      wrap.appendChild(UI.notice({ tone: 'danger', compact: true, title: Fmt.int(unknown.length) + ' فئة في البيانات غير معرّفة', text: unknown.map(function (t) { return t + ' (' + Fmt.int(usage[t]) + ')'; }).join('، '), actions: acts }));
    }
    var list = el('div', 'tier-list');
    names.sort(function (a, b) { return st.tiers[b] - st.tiers[a]; }).forEach(function (name) {
      var row = el('div', 'tier-row');
      var nameIn = UI.input({ value: name, size: 'sm', ariaLabel: 'اسم الفئة', cls: 'tier-name-in', maxLength: 60, onChange: function (v) { renameTier(name, v); } });
      nameIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') nameIn.blur(); });
      row.appendChild(nameIn);
      var barWrap = el('div', 'tier-bar-wrap');
      var bar = el('div', 'tier-bar');
      bar.style.width = Math.max(2, (st.tiers[name] / max) * 100) + '%';
      barWrap.appendChild(bar);
      barWrap.appendChild(el('span', 'tier-use', usage[name] ? Fmt.int(usage[name]) + ' شخص' : 'غير مستخدمة'));
      row.appendChild(barWrap);
      var valIn = UI.input({
        value: Fmt.plain(st.tiers[name]), size: 'sm', numeric: true, stepper: 1, ariaLabel: 'قيمة ' + name, cls: 'tier-val-in',
        onInput: function (v) { var n = Fmt.parseNumber(v); st.tiers[name] = n == null || n < 0 ? 0 : n; bar.style.width = Math.max(2, (st.tiers[name] / max) * 100) + '%'; recomputeDebounced(onChangeLive); },
        onChange: function (v) { var n = Fmt.parseNumber(v); st.tiers[name] = n == null || n < 0 ? 0 : n; recomputeNow(onChangeLive); }
      });
      trackUndo(valIn, 'تعديل قيمة ' + name);
      row.appendChild(valIn);
      row.appendChild(UI.iconBtn('trash', 'حذف الفئة', function () { removeTier(name); }, 'sm'));
      list.appendChild(row);
    });
    if (!names.length) list.appendChild(el('div', 'small muted pad', 'لا توجد فئات بعد.'));
    wrap.appendChild(list);
    return wrap;
  }
  Q.tierEditor = tierEditor;

  function renameTier(oldName, newName) {
    var st = S(), t = String(newName || '').trim();
    if (!t || t === oldName) { renderScreenIfMounted(); return; }
    if (st.tiers[t] != null) { UI.toast('توجد فئة بنفس الاسم', 'warn'); renderScreenIfMounted(); return; }
    pushUndo('إعادة تسمية فئة');
    var rebuilt = {};
    Object.keys(st.tiers).forEach(function (k) { rebuilt[k === oldName ? t : k] = st.tiers[k]; });
    st.tiers = rebuilt;
    Object.keys(st.tierAliases).forEach(function (k) { if (st.tierAliases[k] === oldName) st.tierAliases[k] = t; });
    updatePeople(null, function (p) { return p.tier === oldName ? { tier: t } : null; });
    if (st.filters.tier === oldName) st.filters.tier = t;
    recompute();
    renderScreenIfMounted();
    if (Q.hosts.settingsRepaint) Q.hosts.settingsRepaint();
  }
  function removeTier(name) {
    var st = S();
    var affected = tierUsage()[name] || 0;
    function doIt() {
      pushUndo('حذف فئة ' + name);
      delete st.tiers[name];
      Object.keys(st.tierAliases).forEach(function (k) { if (st.tierAliases[k] === name) delete st.tierAliases[k]; });
      recompute();
      renderScreenIfMounted();
      if (Q.hosts.settingsRepaint) Q.hosts.settingsRepaint();
      UI.toast('تم حذف الفئة', 'ok', { label: 'تراجع', onClick: undo });
    }
    if (!affected) { doIt(); return; }
    UI.confirmModal({
      title: 'حذف فئة «' + name + '»؟',
      message: Fmt.int(affected) + ' شخص في هذه الفئة سيخرجون من التوزيع ولن يحصلوا على أي مبلغ، وسيظهرون في ورقة «بدون فئة».',
      confirmLabel: 'حذف', danger: true, onConfirm: doIt
    });
  }

  function setOption(key, value, label) {
    var st = S();
    if (st.options[key] === value) return;
    pushUndo(label || 'تغيير قاعدة');
    st.options[key] = value;
    recompute();
    renderScreenIfMounted();
    if (Q.hosts.settingsRepaint) Q.hosts.settingsRepaint();
  }
  Q.setOption = setOption;

  function ruleRow(icon, title, desc, control, extra) {
    var r = el('div', 'rule-row');
    var head = el('div', 'rule-head');
    var ic = el('span', 'rule-icon');
    ic.appendChild(Icons.svg(icon));
    head.appendChild(ic);
    var tx = el('div', 'stack');
    tx.appendChild(el('div', 'rule-title', title));
    if (desc) tx.appendChild(el('div', 'rule-desc', desc));
    head.appendChild(tx);
    r.appendChild(head);
    r.appendChild(el('div', 'rule-control', control));
    if (extra) r.appendChild(extra);
    return r;
  }

  function rulesEditor() {
    var st = S(), o = Engine.normalizeOptions(st.options);
    var wrap = el('div', 'rules');
    wrap.appendChild(ruleRow('layers', 'طريقة الوزن', o.weighting === 'equal' ? 'كل شخص وزنه 1 — الفئات والقيم المخصصة لا تؤثر' : 'قيمة الفئة (أو القيمة المخصصة) هي أساس الوزن',
      UI.segmented({ block: true, ariaLabel: 'طريقة الوزن', value: o.weighting, options: [{ value: 'tier', label: 'حسب الفئة', icon: 'layers' }, { value: 'equal', label: 'بالتساوي', icon: 'equal' }], onChange: function (v) { setOption('weighting', v, 'تغيير طريقة الوزن'); } })));
    wrap.appendChild(ruleRow('calendar', 'أثر أيام العمل', o.attendance === 'ignore' ? 'الأيام تُسجَّل للتقارير فقط ولا تغيّر الوزن' : 'من عمل نصف الأيام يأخذ نصف الوزن',
      UI.segmented({ block: true, ariaLabel: 'أثر أيام العمل', value: o.attendance, options: [{ value: 'prorata', label: 'نسبي' }, { value: 'ignore', label: 'لا يؤثر' }], onChange: function (v) { setOption('attendance', v, 'تغيير أثر الأيام'); } })));
    wrap.appendChild(ruleRow('split', 'التوزيع على المجمعات', o.allocation === 'split' ? 'كل شخص يأخذ من كل مجمع ممول بنفس النسبة — عدالة تامة بين المجمعات' : 'كل شخص في مجمع واحد، والمحرك يوازن بين المجمعات تلقائيًا',
      UI.segmented({ block: true, ariaLabel: 'التوزيع على المجمعات', value: o.allocation, options: [{ value: 'assign', label: 'مجمع لكل شخص' }, { value: 'split', label: 'تقسيم على الكل' }], onChange: function (v) { setOption('allocation', v, 'تغيير التوزيع على المجمعات'); } })));
    var roundCtl = el('div', 'stack g2');
    roundCtl.appendChild(UI.dropdown({
      block: true, ariaLabel: 'وحدة التقريب', value: String(o.roundingStep),
      options: [{ value: '1', label: 'قرش واحد', hint: 'الأدق' }, { value: '5', label: '5 قروش' }, { value: '10', label: '10 قروش' }, { value: '25', label: 'ربع جنيه' }, { value: '50', label: 'نصف جنيه' }, { value: '100', label: 'جنيه صحيح' }, { value: '500', label: '5 جنيهات' }, { value: '1000', label: '10 جنيهات' }],
      onChange: function (v) { setOption('roundingStep', Number(v), 'تغيير وحدة التقريب'); }
    }));
    roundCtl.appendChild(UI.segmented({ block: true, size: 'sm', ariaLabel: 'التقريب على', value: o.roundingTarget, options: [{ value: 'net', label: 'على الصافي المستلم' }, { value: 'gross', label: 'على الإجمالي' }], onChange: function (v) { setOption('roundingTarget', v, 'تغيير هدف التقريب'); } }));
    wrap.appendChild(ruleRow('target', 'التقريب', o.roundingStep === 1 ? 'بلا تقريب — دقة القرش' : (o.roundingTarget === 'net' ? 'كل صافٍ مستلم من مضاعفات الوحدة، والباقي يُسجَّل غير موزّع' : 'كل إجمالي من مضاعفات الوحدة، وإجمالي المجمع يُعدَّل ليطابقها'), roundCtl));
    var capCtl = el('div', 'stack g2');
    var capOn = o.capNet != null;
    var capIn = UI.input({ value: capOn ? o.capNet : '', numeric: true, grouped: true, suffix: 'ج.م', ariaLabel: 'الحد الأقصى للصافي', disabled: !capOn, placeholder: 'مثال 5,000',
      onChange: function (v) { var n = Fmt.parseNumber(v); setOption('capNet', n != null && n > 0 ? n : null, 'تغيير الحد الأقصى'); } });
    capCtl.appendChild(UI.toggle({ checked: capOn, label: capOn ? 'مفعّل' : 'بلا حد', ariaLabel: 'تفعيل الحد الأقصى', onChange: function (v) {
      if (v) {
        var t = poolTotals(), cnt = st.people.length || 1;
        var suggest = Math.ceil((t.netPi / 100 / cnt) * 2 / 100) * 100 || 1000;
        setOption('capNet', suggest, 'تفعيل الحد الأقصى');
      } else setOption('capNet', null, 'إلغاء الحد الأقصى');
    } }));
    capCtl.appendChild(capIn);
    wrap.appendChild(ruleRow('cap', 'الحد الأقصى للصافي', capOn ? 'لا يتجاوز أي شخص هذا الصافي، والفائض يُوزَّع على الباقين بنفس القواعد' : 'اختياري — يمنع تركّز المبلغ في الفئات العليا', capCtl));
    return wrap;
  }
  Q.rulesEditor = rulesEditor;

  function rulesCard() {
    var c = card('قواعد التوزيع', 'تُطبَّق على الجميع وتظهر في ورقة المنهجية بالتقرير.', null, 'mount mount-1');
    var body = el('div', 'card-pad-sm');
    body.appendChild(rulesEditor());
    c.appendChild(body);
    return c;
  }

  function periodCard() {
    var st = S();
    var c = card('الفترة والتقرير', null, null, 'mount mount-2');
    var body = el('div', 'card-pad stack g4');
    var daysIn = UI.input({
      value: st.periodDays, numeric: true, integer: true, stepper: 1, min: 1, max: 366, suffix: 'يوم', ariaLabel: 'أيام الفترة',
      onInput: function (v) { var n = Fmt.parseNumber(v); if (n == null || n < 1) return; st.periodDays = Math.min(366, Math.round(n)); recomputeDebounced(renderAmountsLive); },
      onChange: function (v, i) { var n = Fmt.parseNumber(v); st.periodDays = (n == null || n < 1) ? st.periodDays : Math.min(366, Math.round(n)); i.value = st.periodDays; recomputeNow(renderAmountsLive); }
    });
    trackUndo(daysIn.input, 'تعديل أيام الفترة');
    body.appendChild(UI.field('عدد أيام الفترة', daysIn, 'من ترك خانة أيامه فارغة يُحسب له كامل الفترة'));
    var two = el('div', 'grid-2');
    two.appendChild(UI.field('عنوان التقرير', UI.input({ value: st.title, ariaLabel: 'عنوان التقرير', maxLength: 90, onInput: function (v) { st.title = v; scheduleSave(); } })));
    two.appendChild(UI.field('الفترة', UI.input({ value: st.period, ariaLabel: 'اسم الفترة', maxLength: 60, placeholder: 'مثال: سبتمبر 2026', onInput: function (v) { st.period = v; scheduleSave(); } })));
    body.appendChild(two);
    c.appendChild(body);
    return c;
  }

  return Q;
})();
