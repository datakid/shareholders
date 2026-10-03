var SelfTest = (function () {
  'use strict';
  var results = [];
  function record(name, pass, detail) { results.push({ name: name, pass: !!pass, detail: detail || '' }); }
  function approx(a, b, eps) { return Math.abs(a - b) <= (eps == null ? 1e-6 : eps); }
  function rng(seed) { var s = seed; return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }
  var TIERS = { 'فئة أ': 3000, 'فئة ب': 2200, 'فئة ج': 1600, 'فئة د': 1100 };
  var TN = Object.keys(TIERS);
  function pools(a, b) { return { 'الخدمة': { gross: a == null ? 120000 : a, taxRate: 0.05 }, 'التوصيل': { gross: b == null ? 45000 : b, taxRate: 0.10 } }; }
  function onePool(gross, taxRate) { return { 'واحد': { gross: gross == null ? 60000 : gross, taxRate: taxRate == null ? 0.05 : taxRate } }; }
  function onlyEmptyPoolRefusal(res) { return !res.ok && (res.errors || []).every(function (e) { return e.code === 'EMPTY_POOL_WITH_BUDGET' || e.code === 'NO_ELIGIBLE_PEOPLE'; }); }
  function person(id, extra) {
    var p = { id: id, code: '', name: 'شخص ' + id, job: '', dept: 'قسم', tier: 'فئة أ', daysWorked: null, penaltyRate: null, manualFactor: null, overrideValue: null, pinnedPool: null, excluded: false, notes: '' };
    if (extra) Object.keys(extra).forEach(function (k) { p[k] = extra[k]; });
    return p;
  }
  function baseState(people, opts) {
    opts = opts || {};
    var o = { roundingStep: opts.roundingStep || 1, roundingTarget: opts.roundingTarget || 'gross' };
    ['allocation', 'weighting', 'attendance', 'capNet'].forEach(function (k) { if (opts[k] != null) o[k] = opts[k]; });
    return {
      people: people, tiers: opts.tiers || TIERS, pools: opts.pools || pools(), periodDays: opts.periodDays || 30,
      options: o, title: 'اختبار', period: 'فترة',
      filters: { q: '', dept: '', tier: '', pool: '', flags: [] }, sort: { key: null, dir: null },
      ui: Model.ui({ rowsPerPage: 100 }), page: { dashboard: 1, allocate: 1, grid: 1 }, undoStack: [], redoStack: [], selection: {}, tierAliases: {}
    };
  }
  function sumGross(res, pool) {
    var s = 0;
    res.people.forEach(function (p) { (p.parts || []).forEach(function (x) { if (x.pool === pool) s += x.grossPiastres; }); });
    return s;
  }
  function randomPeople(r, count) {
    var out = [];
    for (var i = 0; i < count; i++) {
      var u = r();
      out.push(person(i + 1, {
        tier: TN[Math.floor(r() * 4)],
        daysWorked: u < 0.2 ? Math.floor(r() * 30) : null,
        penaltyRate: u > 0.85 ? Math.round(r() * 50) / 100 : null,
        excluded: u > 0.97
      }));
    }
    return out;
  }
  function withApp(state, fn) {
    var api = App.internals, saved = api.getState();
    api.setState(state);
    try { return fn(api); } finally { api.setState(saved); }
  }

  function run() {
    results = [];

    (function ImportRegression() {
      var numeric = Fmt.parseNumber('١٢٫٥') === 12.5 && Fmt.parseNumber('(٥٠٠)') === -500 && Fmt.parseNumber('١٬٢٣٤٫٥٪') === 1234.5 && Fmt.parseNumber('bad') === null && Fmt.parseNumber('1.234,50') === 1234.5 && Fmt.parseNumber('2,500 ج.م') === 2500;
      record('R1 — أرقام عربية وكسور وإشارات محاسبية وفواصل أوروبية', numeric);
      var map = Importer.autoMap(['المعامل اليدوي', 'العامل', 'نسبة الخصم', 'نسبة الجزاء', 'الفئة']);
      record('R2 — ربط دقيق للأعمدة بلا تصادم', map.name === 1 && map.manualFactor === 0 && map.penaltyRate === 3);
      var grid = [['الاسم', 'الفئة', 'نسبة الجزاء'], ['أ', 'مدير', '1'], ['ب', 'مدير', '5']];
      var st = { tiers: { 'مدير': 10 }, pools: {} };
      var parsed = Importer.rowsToPeople(grid, st);
      record('R3 — نسبة 1% لا تصبح 100%', parsed.people[0].penaltyRate === 0.01 && parsed.people[1].penaltyRate === 0.05);
      var fractional = Importer.rowsToPeople(grid, { tiers: st.tiers, pools: st.pools, penaltyScale: 'fraction' });
      record('R4 — مفتاح الكسور يضبط العمود', fractional.people[0].penaltyRate === 1);
      record('R5 — نص CSV الخطر محايد', Exporter.toCsv([['=HYPERLINK(1)', -5, '  @SUM(1)']]).indexOf("'=HYPERLINK(1),-5,'  @SUM(1)") === 0);
      var taxes = Engine.runPipeline(baseState([person(1), person(2), person(3)], { pools: { 'واحد': { gross: 0.05, taxRate: 0.3 } } }));
      record('R6 — مطابقة الخصم والصافي بالقرش', taxes.ok && Reports.conservationCheck(baseState([], { pools: { 'واحد': { gross: 0.05, taxRate: 0.3 } } }), taxes).ok && taxes.people.reduce(function (s, p) { return s + p.taxPiastres; }, 0) === 2);
      var hg = [['تقرير الحوافز', '', ''], ['', '', ''], ['الاسم', 'القسم', 'الفئة'], ['أ', 'ب', 'ج']];
      record('R7 — اكتشاف صف العناوين تحت العنوان', Importer.detectHeaderRow(hg) === 2, 'الصف ' + Importer.detectHeaderRow(hg));
      var csv = Importer.readCsv('\uFEFFالاسم;الفئة\n"أحمد; الأول";مدير\r\nمنى;فني\n');
      record('R8 — قراءة CSV بفاصل منقوطة واقتباس', csv.length === 3 && csv[1][0] === 'أحمد; الأول' && csv[2][1] === 'فني', JSON.stringify(csv));
    })();

    (function T1() {
      var r = rng(42), ok = true, detail = '', n = 0, skipped = 0;
      for (var s = 0; s < 200; s++) {
        var people = randomPeople(r, 3 + Math.floor(r() * 25));
        var g1 = Math.round(r() * 400000) / 100 + 0.37, g2 = Math.round(r() * 200000) / 100 + 0.91;
        var res = Engine.runPipeline(baseState(people, { pools: pools(g1, g2) }));
        if (onlyEmptyPoolRefusal(res)) { skipped++; continue; }
        if (!res.ok) { ok = false; detail = 'فشل: ' + JSON.stringify(res.errors); break; }
        n++;
        if (sumGross(res, 'الخدمة') !== Engine.toPiastres(g1) || sumGross(res, 'التوصيل') !== Engine.toPiastres(g2)) { ok = false; detail = 'سيناريو ' + s + ': مجموع الأنصبة لا يساوي الإجمالي'; break; }
      }
      record('T1 — حفظ القيمة عبر 200 سيناريو عشوائي', ok && n > 0, ok ? n + ' سيناريو مطابق بالقرش، ' + skipped + ' رُفض بشكل صحيح' : detail);
    })();

    (function T2() {
      var res = Engine.runPipeline(baseState([person(1), person(2, { tier: 'فئة د' })], { pools: { 'واحد': { gross: 10000, taxRate: 0 } } }));
      var ratio = res.people[0].netPiastres / res.people[1].netPiastres, expected = TIERS['فئة أ'] / TIERS['فئة د'];
      record('T2 — التناسب داخل المجمع', res.ok && approx(ratio, expected, 0.01), 'النسبة ' + ratio.toFixed(4) + ' والمتوقع ' + expected.toFixed(4));
    })();

    (function T3() {
      var res = Engine.runPipeline(baseState([person(1, { pinnedPool: 'الخدمة' }), person(2, { pinnedPool: 'التوصيل' })], { pools: { 'الخدمة': { gross: 10000, taxRate: 0 }, 'التوصيل': { gross: 10000, taxRate: 0 } } }));
      record('T3 — العدالة بين المجمعات عند تساوي الأوزان', res.ok && res.people[0].netPiastres === res.people[1].netPiastres, 'صافي ' + res.people[0].netPiastres + ' مقابل ' + res.people[1].netPiastres);
    })();

    (function T4() {
      var res = Engine.runPipeline(baseState([person(1), person(2), person(3)], { pools: { 'واحد': { gross: 1000, taxRate: 0.1 } } }));
      var g = 0, t = 0, n = 0;
      res.people.forEach(function (p) { g += p.grossPiastres; t += p.taxPiastres; n += p.netPiastres; });
      record('T4 — الإجمالي = الخصم + الصافي', res.ok && g === 100000 && g === t + n, 'إجمالي ' + g + ' خصم ' + t + ' صافي ' + n);
    })();

    (function T5() {
      var res = Engine.runPipeline(baseState([person(1), person(2, { penaltyRate: 0.5 })], { pools: { 'واحد': { gross: 30000, taxRate: 0 } } }));
      record('T5 — الجزاء ينصّف الوزن', res.ok && approx(res.people[0].netPiastres / res.people[1].netPiastres, 2, 0.02));
    })();

    (function T6() {
      var full = Engine.effectiveWeight(person(1, { daysWorked: 30 }), TIERS, 30), half = Engine.effectiveWeight(person(2, { daysWorked: 15 }), TIERS, 30);
      var ign = Engine.effectiveWeight(person(3, { daysWorked: 15 }), TIERS, 30, { attendance: 'ignore' });
      record('T6 — نصف الأيام يعطي نصف الوزن، ووضع «لا يؤثر» يتجاهلها', approx(half, full / 2) && approx(ign, full), 'كامل ' + full + ' ونصف ' + half + ' ومتجاهل ' + ign);
    })();

    (function T7() {
      var res = Engine.runPipeline(baseState([person(1), person(2, { excluded: true })], { pools: { 'واحد': { gross: 10000, taxRate: 0 } } }));
      var ex = res.people[1];
      record('T7 — المستبعد لا يأخذ شيئًا والمجمع يبقى كاملًا', res.ok && ex.netPiastres === 0 && sumGross(res, 'واحد') === 1000000);
    })();

    (function T8() {
      var res = Engine.runPipeline(baseState([person(1, { excluded: true })], { pools: { 'واحد': { gross: 5000, taxRate: 0 } } }));
      record('T8 — مجمع له مبلغ بلا أعضاء يُرفض بخطأ مُسمّى', !res.ok && res.errors.some(function (e) { return e.code === 'EMPTY_POOL_WITH_BUDGET' || e.code === 'NO_ELIGIBLE_PEOPLE'; }));
    })();

    (function T9() {
      var res = Engine.runPipeline(baseState([person(1, { excluded: true })], { pools: { 'واحد': { gross: 0, taxRate: 0 } } }));
      record('T9 — صفر وزن وصفر مبلغ لا ينتج NaN', JSON.stringify(res).indexOf('NaN') === -1 && res.ok !== undefined, 'ok=' + res.ok);
    })();

    (function T10() {
      var people = [];
      for (var i = 0; i < 120; i++) people.push(person(i + 1, { tier: TN[i % 4] }));
      var a = Engine.runPipeline(baseState(people)), b = Engine.runPipeline(baseState(people.slice()));
      delete a.meta; delete b.meta;
      record('T10 — الحتمية: نفس المدخلات نفس المخرجات', JSON.stringify(a) === JSON.stringify(b));
    })();

    (function T11() {
      var people = [];
      for (var i = 0; i < 20000; i++) people.push(person(i + 1, { tier: TN[i % 4], daysWorked: i % 7 ? null : 20 }));
      var t0 = performance.now();
      var res = Engine.runPipeline(baseState(people, { pools: pools(2000000, 900000) }));
      var ms = performance.now() - t0;
      record('T11 — الأداء: 20 ألف شخص', res.ok && ms < 4000, Math.round(ms) + ' مللي ثانية');
    })();

    (function T12() {
      var all = ['فئة أ', 'فئه ا', ' الفئة أ ', 'فِئَة أ', 'فـئة أ'].map(function (v) { return Engine.canonicalizeTierName(v, TN); });
      record('T12 — تطبيع العربية يوحّد صيغ الفئة', all.every(function (x) { return x === 'فئة أ'; }), JSON.stringify(all));
    })();

    (function T13() {
      var got = Engine.distributePoolPiastres(10, [{ id: 1, weight: 1 }, { id: 2, weight: 1 }, { id: 3, weight: 1 }]);
      record('T13 — توزيع البواقي دقيق', got.reduce(function (a, b) { return a + b; }, 0) === 10 && got.filter(function (g) { return g === 4; }).length === 1, JSON.stringify(got));
    })();

    (function T14() {
      var res = Engine.runPipeline(baseState([person(1, { pinnedPool: 'الخدمة' }), person(2), person(3)]));
      record('T14 — المثبّت يبقى في مجمعه', res.ok && res.people[0].pool === 'الخدمة');
    })();

    (function T15() {
      var people = [];
      for (var i = 0; i < 60; i++) people.push(person(i + 1, { tier: TN[i % 4] }));
      var res = Engine.runPipeline(baseState(people)), worst = 0;
      Object.keys(res.poolResults).forEach(function (n) { var d = res.poolResults[n].deviation; if (d != null) worst = Math.max(worst, Math.abs(d)); });
      record('T15 — جودة الموازنة بين المجمعات', res.ok && worst < 0.15, 'أقصى انحراف ' + (worst * 100).toFixed(2) + '%');
    })();

    (function T16() {
      var res = Engine.runPipeline(baseState([person(1, { overrideValue: 5000 }), person(2)], { pools: { 'واحد': { gross: 10000, taxRate: 0 } } }));
      var ratio = res.people[0].netPiastres / res.people[1].netPiastres;
      record('T16 — القيمة المخصصة تتجاوز الفئة', res.ok && approx(ratio, 5000 / 3000, 0.02), 'النسبة ' + ratio.toFixed(4));
    })();

    (function T17() {
      var r = rng(7), ok = true, detail = '', checked = 0, steps = [1, 25, 100];
      for (var si = 0; si < steps.length && ok; si++) {
        for (var s = 0; s < 70; s++) {
          var people = [];
          for (var i = 0, c = 3 + Math.floor(r() * 18); i < c; i++) people.push(person(i + 1, { tier: TN[Math.floor(r() * 4)] }));
          var g1 = Math.round(r() * 300000) / 100 + 0.53;
          var res = Engine.runPipeline(baseState(people, { pools: { 'واحد': { gross: g1, taxRate: 0.05 } }, roundingStep: steps[si], roundingTarget: 'gross' }));
          if (!res.ok) { ok = false; detail = JSON.stringify(res.errors); break; }
          checked++;
          var expected = Engine.effectiveGrossPiastres(g1, steps[si]), actual = sumGross(res, 'واحد');
          if (actual !== expected) { ok = false; detail = 'وحدة ' + steps[si] + ': متوقع ' + expected + ' فعلي ' + actual; break; }
          if (res.people.some(function (p) { return p.grossPiastres % steps[si] !== 0; })) { ok = false; detail = 'نصيب ليس من مضاعفات ' + steps[si]; break; }
        }
      }
      record('T17 — التقريب على الإجمالي يحفظ القيمة (3 وحدات × 70 سيناريو)', ok, ok ? checked + ' سيناريو مطابق' : detail);
    })();

    (function T18() {
      var res = Engine.runPipeline(baseState([person(1, { pinnedPool: 'مجمع وهمي' })]));
      var named = !res.ok && res.errors.some(function (e) { return e.code === 'UNKNOWN_PINNED_POOL'; });
      var noInternal = !res.ok && !res.errors.some(function (e) { return e.code === 'INTERNAL_ERROR'; });
      var emptyRes = Engine.runPipeline(baseState([person(1, { pinnedPool: '' })], { pools: onePool() }));
      record('T18 — قفل على مجمع غير موجود ← خطأ مُسمّى بلا انهيار', named && noInternal && emptyRes.ok && emptyRes.people[0].pool === 'واحد');
    })();

    (function T19() {
      var src = String(Reports.detailRows) + String(Reports.executiveRows) + String(Reports.specialRows) + String(Reports.deptRows) + String(Reports.unresolvedRows) + String(Exporter.buildFullReport);
      var clean = src.indexOf('viewRows') === -1 && src.indexOf('filters') === -1;
      var people = [];
      for (var i = 0; i < 40; i++) people.push(person(i + 1, { tier: TN[i % 4], dept: ['أ', 'ب', 'ج'][i % 3] }));
      var probe = baseState(people);
      var out = withApp(probe, function (api) {
        api.recompute();
        var before = JSON.stringify(Reports.detailRows(probe, probe.result)) + JSON.stringify(Reports.executiveRows(probe, probe.result));
        var wide = api.viewRows().length;
        probe.filters.dept = 'ب';
        probe.filters.flags = ['special'];
        var narrow = api.viewRows().length;
        var after = JSON.stringify(Reports.detailRows(probe, probe.result)) + JSON.stringify(Reports.executiveRows(probe, probe.result));
        return { same: before === after, wide: wide, narrow: narrow };
      });
      record('T19 — الإجماليات الرسمية لا تتأثر بالتصفية', out.same && clean && out.narrow < out.wide, 'العرض تقلّص ' + out.wide + '←' + out.narrow);
    })();

    (function T20() {
      var people = [];
      for (var i = 0; i < 30; i++) people.push(person(i + 1, { tier: TN[i % 4], dept: ['أ', 'ب'][i % 2] }));
      var probe = baseState(people);
      probe.__recomputeCount = 0;
      var out = withApp(probe, function (api) {
        api.recompute();
        var c = probe.__recomputeCount, before = JSON.stringify(api.rowsCache().map(function (r) { return r.net; }));
        for (var k = 0; k < 50; k++) {
          probe.filters.q = k % 3 === 0 ? 'شخص' : '';
          probe.filters.dept = k % 2 === 0 ? 'أ' : '';
          probe.sort = { key: 'net', dir: k % 2 ? 'asc' : 'desc' };
          api.viewRows();
        }
        return probe.__recomputeCount === c && before === JSON.stringify(api.rowsCache().map(function (r) { return r.net; }));
      });
      record('T20 — 50 عملية تصفية وترتيب بلا إعادة حساب ولا تغيّر مبلغ', out);
    })();

    (function T21() {
      var rows = [{ id: 1, name: 'محمد أحمد', dept: 'المطبخ', tier: 'فئة أ' }, { id: 2, name: 'محمود إبراهيم', dept: 'الصالة', tier: 'فئة ب' }];
      var idx = Search.buildIndex(rows), e = idx.entries[0], N = Engine.normalizeLoose;
      var exact = Search.scoreEntry(N('محمد احمد'), e), prefix = Search.scoreEntry(N('محمد'), e), word = Search.scoreEntry(N('احمد'), e), typo = Search.scoreEntry(N('محمf'), e);
      record('T21 — ترتيب البحث: تطابق > بادئة > كلمة > خطأ إملائي', exact > prefix && prefix > word && word > typo && typo >= 0, [exact, prefix, word, typo].join(' > '));
    })();

    (function T22() {
      var rows = [];
      for (var i = 0; i < 20000; i++) rows.push({ id: i + 1, name: 'شخص رقم ' + i, dept: 'قسم ' + (i % 9), tier: 'فئة ' + (i % 4) });
      var idx = Search.buildIndex(rows), t0 = performance.now();
      var res = Search.run(idx, 'شخص رقم 1234');
      var ms = performance.now() - t0;
      record('T22 — بحث في 20 ألف صف تحت 60 مللي', res != null && ms < 60, Math.round(ms) + ' مللي، ' + res.count + ' نتيجة');
    })();

    (function T23() {
      var rows = [{ id: 3, net: 100 }, { id: 1, net: 100 }, { id: 2, net: 50 }, { id: 4, net: 100 }];
      var get = function (r) { return r.net; };
      var once = Sorter.sortRows(rows, 'net', 'desc', get).map(function (r) { return r.id; });
      var tri = Sorter.nextDir(null) === 'asc' && Sorter.nextDir('asc') === 'desc' && Sorter.nextDir('desc') === null;
      record('T23 — الترتيب ثابت وحتمي وثلاثي الحالات', JSON.stringify(once) === '[3,1,4,2]' && tri, JSON.stringify(once));
    })();

    (function T24() {
      var res = Engine.runPipeline(baseState([person(1, { tier: 'فئة مجهولة' }), person(2), person(3)], { pools: { 'واحد': { gross: 10000, taxRate: 0 } } }));
      var o = res.ok && res.people[0];
      record('T24 — بدون فئة: يخرج من التوزيع ولا يكسر الحساب', res.ok && o.unresolvedTier && o.netPiastres === 0 && sumGross(res, 'واحد') === 1000000 && res.unresolvedTierIds.length === 1);
    })();

    (function T25() {
      var st = baseState([person(1, { tier: 'مجهولة' }), person(2)], { pools: { 'واحد': { gross: 5000, taxRate: 0 } } });
      var res = Engine.runPipeline(st);
      var w = res.warnings.filter(function (x) { return x.code === 'UNRESOLVED_TIER'; });
      var rows = Reports.unresolvedRows(st, res);
      record('T25 — بدون فئة يُنتج تنبيهًا صريحًا وصفًا في ورقة مخصصة', w.length === 1 && rows.length === 1 && rows[0].cause.length > 0);
    })();

    (function T26() {
      var st = baseState([person(1), person(2, { excluded: true }), person(3, { tier: 'مجهولة' })], { pools: onePool() });
      var res = Engine.runPipeline(st), by = {};
      Reports.executiveRows(st, res).forEach(function (r) { by[r.label] = r.value; });
      record('T26 — الملخص التنفيذي يفصل المستبعد عن بدون فئة', by['عدد المستبعدين يدويًا'] === 1 && by['عدد بدون فئة (خارج التوزيع)'] === 1);
    })();

    (function T27() {
      var payload = { tiers: TIERS, pools: pools(), options: { roundingStep: 25 }, periodDays: 31 };
      var round = JSON.parse(JSON.stringify(payload));
      var clean = Model.pools({ 'أ': { gross: '1,500', taxRate: '0.1' }, '': { gross: 5 }, 'ب': { gross: -3, taxRate: 2 } });
      record('T27 — الإعدادات تدور بلا فقد وتُنقّى عند التحميل', JSON.stringify(round) === JSON.stringify(payload) && clean['أ'].gross === 1500 && !clean[''] && clean['ب'].gross === 0 && clean['ب'].taxRate < 1);
    })();

    (function T28() {
      var r = Store.deserializeBundle({ kind: 'qisma.bundle', schemaVersion: Store.SCHEMA + 5, state: {} });
      record('T28 — نسخة مخطط أحدث تُرفض بدل أن تُقرأ', r.ok === false, r.error);
    })();

    (function T29() {
      var people = [];
      for (var i = 0; i < 24; i++) people.push(person(i + 1, { dept: ['أ', 'ب', 'ج'][i % 3], tier: TN[i % 4] }));
      var st = baseState(people), res = Engine.runPipeline(st);
      var dept = Reports.deptRows(st, res).reduce(function (s, d) { return s + d.nP; }, 0);
      var tot = Reports.detailRows(st, res).reduce(function (s, r) { return s + r.netPiastres; }, 0);
      record('T29 — مجموع الأقسام يطابق الإجمالي بالقرش', res.ok && dept === tot, dept + ' = ' + tot);
    })();

    (function T30() {
      var people = [];
      for (var i = 0; i < 18; i++) people.push(person(i + 1, { tier: TN[i % 4] }));
      var st = baseState(people), res = Engine.runPipeline(st);
      var a = JSON.stringify(Reports.deptRows(st, res)) + JSON.stringify(Reports.tierRows(st, res));
      var b = JSON.stringify(Reports.deptRows(st, res)) + JSON.stringify(Reports.tierRows(st, res));
      var tierNet = Reports.tierRows(st, res).reduce(function (s, t) { return s + t.nP; }, 0);
      var tot = Reports.detailRows(st, res).reduce(function (s, r) { return s + r.netPiastres; }, 0);
      record('T30 — تجميعات التقرير حتمية ومتوازنة', a === b && tierNet === tot);
    })();

    (function T31() {
      var people = [];
      for (var i = 0; i < 20; i++) people.push(person(i + 1, { dept: ['أ', 'ب'][i % 2], tier: TN[i % 4] }));
      var probe = baseState(people);
      var out = withApp(probe, function (api) {
        api.recompute();
        probe.filters.dept = 'أ';
        probe.sort = { key: 'net', dir: 'desc' };
        var view = api.viewRows(), sorted = true;
        for (var k = 1; k < view.length; k++) if (view[k].net > view[k - 1].net + 1e-9) sorted = false;
        return { all: view.every(function (r) { return r.dept === 'أ'; }), sorted: sorted, summary: api.filterSummaryText(), n: view.length };
      });
      record('T31 — تصدير العرض يطابق التصفية والترتيب الظاهر', out.all && out.sorted && out.summary.indexOf('أ') !== -1, out.n + ' صف: ' + out.summary);
    })();

    (function T32() {
      var people = [
        person(1, { name: 'أحمد', code: '77', job: 'محاسب', daysWorked: 22, penaltyRate: 0.15, manualFactor: 1.25, notes: 'ملاحظة' }),
        person(2, { name: 'منى', job: 'مراجع', excluded: true, pinnedPool: 'الخدمة' }),
        person(3, { name: 'سيد', job: 'كاتب', overrideValue: 500 })
      ];
      var st = baseState(people), parsed = Importer.rowsToPeople(Exporter.templateRows(st, 'current'), st), lost = [];
      people.forEach(function (o, i) {
        var b = parsed.people[i];
        if (!b) { lost.push('صف ' + (i + 1)); return; }
        ['code', 'name', 'job', 'dept', 'tier', 'notes'].forEach(function (k) { if (String(o[k] || '') !== String(b[k] || '')) lost.push(k); });
        ['daysWorked', 'penaltyRate', 'overrideValue'].forEach(function (k) { if (Number(o[k] || 0) !== Number(b[k] || 0)) lost.push(k); });
        if (Number(o.manualFactor == null ? 1 : o.manualFactor) !== Number(b.manualFactor == null ? 1 : b.manualFactor)) lost.push('manualFactor');
        if (!!o.excluded !== !!b.excluded) lost.push('excluded');
        if (String(o.pinnedPool || '') !== String(b.pinnedPool || '')) lost.push('pinnedPool');
      });
      record('T32 — قالب البيانات الحالية يعود بلا فقد', !lost.length && parsed.people.length === 3, lost.join('، ') || '3 صفوف مطابقة');
    })();

    (function T33() {
      var st = baseState([person(1, { job: 'محاسب' }), person(2, { tier: 'مجهولة' })]);
      st.title = 'مشروع الاختبار'; st.periodDays = 28; st.options.roundingStep = 100;
      var back = Store.deserializeBundle(JSON.parse(Store.serializeBundle(st)));
      var same = back.ok && back.state.title === st.title && back.state.periodDays === 28 && back.state.options.roundingStep === 100 && back.state.people.length === 2 && back.state.people[0].job === 'محاسب' && JSON.stringify(back.state.tiers) === JSON.stringify(st.tiers);
      var fut = JSON.parse(Store.serializeBundle(st));
      fut.schemaVersion = Store.SCHEMA + 1;
      var refused = Store.deserializeBundle(fut);
      var legacy = Store.deserializeBundle({ kind: 'qisma.session', schemaVersion: 1, session: { people: [person(9)], tiers: TIERS } });
      record('T33 — الحزمة تعود كاملة، ترفض إصدارًا أحدث، وتقرأ نسخ الإصدار السابق', same && refused.ok === false && legacy.ok && legacy.state.people.length === 1);
    })();

    (function T34() {
      var people = [];
      for (var i = 0; i < 24; i++) people.push(person(i + 1, { dept: ['أ', 'ب'][i % 2], excluded: i % 7 === 0, penaltyRate: i % 5 === 0 ? 0.2 : null }));
      var probe = baseState(people);
      var out = withApp(probe, function (api) {
        api.recompute();
        var wide = Reports.specialRows(probe, probe.result).length;
        probe.filters.dept = 'ب';
        probe.filters.q = 'شخص 3';
        return { wide: wide, narrow: Reports.specialRows(probe, probe.result).length, v: api.viewRows().length < people.length };
      });
      record('T34 — اختيار الحالات الخاصة يُحسب من كل السكان', out.wide === out.narrow && out.wide > 0 && out.v);
    })();

    (function T35() {
      var st = baseState([person(1, { tier: 'مجهولة' }), person(2), person(3)], { pools: { 'واحد': { gross: 9999.99, taxRate: 0.07 } }, roundingStep: 100, roundingTarget: 'gross' });
      var res = Engine.runPipeline(st);
      if (!res.ok) { record('T35 — التكامل: بدون فئة + تقريب + خصم معًا', false, JSON.stringify(res.errors)); return; }
      var ok = sumGross(res, 'واحد') === Engine.effectiveGrossPiastres(9999.99, 100) && res.people[0].netPiastres === 0 && res.warnings.some(function (w) { return w.code === 'POOL_ROUNDED'; }) && res.warnings.some(function (w) { return w.code === 'UNRESOLVED_TIER'; });
      record('T35 — التكامل: بدون فئة + تقريب لأقرب جنيه + خصم معًا', ok);
    })();

    (function T36() {
      var name = Exporter.sanitizeSheetName('اسم [طويل] فيه \\ رموز / ممنوعة : وأكثر من واحد وثلاثين حرفًا بكثير', {});
      var used = {}, a = Exporter.sanitizeSheetName('نفس الاسم', used), b = Exporter.sanitizeSheetName('نفس الاسم', used);
      record('T36 — أسماء الأوراق مُنقّاة وغير مكررة', !/[\\\/\?\*\[\]:]/.test(name) && name.length <= 31 && a !== b && b.length <= 31);
    })();

    (function T37() {
      var st = baseState([person(1), person(2, { tier: 'مجهولة' })], { pools: onePool() });
      var res = Engine.runPipeline(st), check = Reports.conservationCheck(st, res);
      record('T37 — فحص حفظ القيمة يمر على كل مجمع', res.ok && check.ok, check.ok ? 'كل المجمعات مطابقة' : JSON.stringify(check.problems));
    })();

    (function E1() {
      var r = rng(99), ok = true, detail = '', n = 0;
      [5, 25, 100, 500].forEach(function (step) {
        for (var s = 0; s < 40 && ok; s++) {
          var people = randomPeople(r, 4 + Math.floor(r() * 30));
          var res = Engine.runPipeline(baseState(people, { pools: pools(Math.round(r() * 5e6) / 100 + 11.11, Math.round(r() * 2e6) / 100 + 3.33), roundingStep: step, roundingTarget: 'net' }));
          if (onlyEmptyPoolRefusal(res)) continue;
          if (!res.ok) { ok = false; detail = JSON.stringify(res.errors); return; }
          n++;
          if (res.people.some(function (p) { return p.netPiastres % step !== 0; })) { ok = false; detail = 'صافٍ ليس من مضاعفات ' + step; return; }
          var st = baseState(people, { pools: pools() });
          Object.keys(res.poolResults).forEach(function (k) {
            var pr = res.poolResults[k];
            if (pr.grossPiastres + pr.retainedPiastres !== pr.declaredPiastres || pr.retainedRoundNetPiastres >= step * Math.max(1, pr.memberCount) + step) { ok = false; detail = 'مجمع ' + k + ' غير متوازن'; }
          });
        }
      });
      record('E1 — التقريب على الصافي: كل صافٍ مستلم من مضاعفات الوحدة والباقي مسجَّل', ok && n > 0, ok ? n + ' سيناريو' : detail);
    })();

    (function E2() {
      var r = rng(5), ok = true, n = 0, worst = 0;
      for (var s = 0; s < 60; s++) {
        var people = randomPeople(r, 6 + Math.floor(r() * 40));
        var res = Engine.runPipeline(baseState(people, { allocation: 'split', pools: { 'أ': { gross: Math.round(r() * 4e6) / 100 + 1, taxRate: 0.11 }, 'ب': { gross: Math.round(r() * 2e6) / 100 + 1, taxRate: 0.24 }, 'ج': { gross: Math.round(r() * 1e6) / 100 + 1, taxRate: 0 } } }));
        if (!res.ok) { if (!onlyEmptyPoolRefusal(res)) ok = false; continue; }
        n++;
        ['أ', 'ب', 'ج'].forEach(function (k) { if (sumGross(res, k) !== res.poolResults[k].declaredPiastres) ok = false; });
        res.people.forEach(function (p) { if (p.idealNetEGP > 5) worst = Math.max(worst, Math.abs(p.netPiastres / 100 - p.idealNetEGP)); });
      }
      record('E2 — وضع «تقسيم على الكل»: حفظ القيمة وأنصبة مطابقة للمثالي', ok && n > 0 && worst < 0.05, n + ' سيناريو، أقصى فرق ' + worst.toFixed(4) + ' ج.م');
    })();

    (function E3() {
      var people = [person(1, { tier: 'فئة أ' }), person(2, { tier: 'فئة د' }), person(3, { tier: 'فئة ج' }), person(4, { tier: 'فئة ب' })];
      var res = Engine.runPipeline(baseState(people, { weighting: 'equal', pools: { 'واحد': { gross: 1000, taxRate: 0 } } }));
      var nets = res.people.map(function (p) { return p.netPiastres; });
      record('E3 — الوزن «بالتساوي» يعطي أنصبة متساوية', res.ok && nets.every(function (x) { return x === 25000; }), JSON.stringify(nets));
    })();

    (function E4() {
      var people = [person(1, { tier: 'فئة أ' }), person(2, { tier: 'فئة د' }), person(3, { tier: 'فئة د' }), person(4, { tier: 'فئة د' })];
      var res = Engine.runPipeline(baseState(people, { capNet: 300, roundingTarget: 'net', pools: { 'واحد': { gross: 1000, taxRate: 0.1 } } }));
      var top = res.people[0].netPiastres, rest = res.people.slice(1).map(function (p) { return p.netPiastres; });
      var total = res.people.reduce(function (s, p) { return s + p.netPiastres; }, 0);
      record('E4 — الحد الأقصى يُطبَّق والفائض يُعاد توزيعه', res.ok && top === 30000 && rest.every(function (x) { return x === rest[0]; }) && total === 90000 && res.people[0].capped, 'الأعلى ' + top + ' والباقي ' + JSON.stringify(rest) + ' المجموع ' + total);
    })();

    (function E5() {
      var people = [person(1), person(2)];
      var res = Engine.runPipeline(baseState(people, { capNet: 100, roundingTarget: 'net', pools: { 'واحد': { gross: 1000, taxRate: 0 } } }));
      var pr = res.ok && res.poolResults['واحد'];
      record('E5 — عندما يبلغ الجميع الحد يُسجَّل الباقي غير موزّع صراحة', res.ok && res.people.every(function (p) { return p.netPiastres === 10000; }) && pr.retainedPiastres === 80000 && res.warnings.some(function (w) { return w.code === 'CAP_RETAINED'; }), res.ok ? 'محتجز ' + pr.retainedPiastres : JSON.stringify(res.errors));
    })();

    (function E6() {
      var r = rng(31), ok = true, detail = '';
      for (var s = 0; s < 80 && ok; s++) {
        var people = randomPeople(r, 5 + Math.floor(r() * 30));
        var cap = 50 + Math.round(r() * 3000);
        var res = Engine.runPipeline(baseState(people, { capNet: cap, roundingTarget: 'net', roundingStep: [1, 25, 100][s % 3], allocation: s % 2 ? 'split' : 'assign', pools: pools(Math.round(r() * 3e6) / 100, Math.round(r() * 1e6) / 100 + 1) }));
        if (!res.ok) { if (!onlyEmptyPoolRefusal(res)) { ok = false; detail = JSON.stringify(res.errors); } continue; }
        if (res.people.some(function (p) { return p.netPiastres > cap * 100; })) { ok = false; detail = 'تجاوز الحد'; }
        if (!Reports.conservationCheck(baseState(people, { pools: pools() }), res).ok) { ok = false; detail = 'حفظ القيمة'; }
      }
      record('E6 — الحد الأقصى لا يُتجاوز أبدًا عبر 80 سيناريو مختلط', ok, detail || 'لا تجاوز ولا فقد');
    })();

    (function E7() {
      var people = [person(1), person(2, { daysWorked: 0 }), person(3, { penaltyRate: 1 })];
      var res = Engine.runPipeline(baseState(people, { pools: onePool() }));
      record('E7 — وزن صفر لا يكسر الحساب ويُنبَّه عليه', res.ok && res.people[1].netPiastres === 0 && res.people[2].netPiastres === 0 && res.warnings.some(function (w) { return w.code === 'ZERO_WEIGHT'; }));
    })();

    (function E8() {
      var res = Engine.runPipeline(baseState([person(1), person(1)], { pools: onePool() }));
      var dupName = Engine.runPipeline(baseState([person(1, { name: 'أحمد' }), person(2, { name: 'احمد' })], { pools: onePool() }));
      record('E8 — رقم صف مكرر يُرفض، واسم مكرر يُنبَّه عليه', !res.ok && res.errors[0].code === 'DUPLICATE_ID' && dupName.ok && dupName.warnings.some(function (w) { return w.code === 'DUPLICATE_NAME'; }));
    })();

    (function E9() {
      var frag = Search.highlight('مُحَمَّد أحمد', 'محمد');
      var div = document.createElement('div');
      div.appendChild(frag);
      var m = div.querySelector('.mark');
      record('E9 — إبراز البحث يعمل مع التشكيل', !!m && m.textContent.replace(/[\u064B-\u065F]/g, '') === 'محمد', m ? m.textContent : 'لا إبراز');
    })();

    (function E10() {
      var people = [];
      for (var i = 0; i < 10; i++) people.push(person(i + 1, { tier: TN[i % 4] }));
      var probe = baseState(people);
      var out = withApp(probe, function (api) {
        api.recompute();
        var before = JSON.stringify(probe.people);
        api.commit([1, 2], function () { return { excluded: true }; }, 'اختبار');
        var mid = probe.people[0].excluded && probe.people[1].excluded;
        probe.tiers = Object.assign({}, probe.tiers, { 'فئة أ': 1 });
        api.undo();
        var afterUndo = JSON.stringify(probe.people) === before;
        api.redo();
        return mid && afterUndo && probe.people[0].excluded;
      });
      record('E10 — التراجع والإعادة يعيدان الحالة بدقة', out);
    })();

    (function E11() {
      var bad = Model.people([{ id: 1, name: '  أحمد  ', penaltyRate: '10', excluded: 'نعم' }, { id: 1, name: 'مكرر' }, null, { name: 'بدون رقم' }]);
      record('E11 — تنقية الصفوف المستعادة (أرقام مكررة، نصوص، قيم منطقية)', bad.length === 3 && bad[0].name === 'أحمد' && bad[0].penaltyRate === 10 && bad[0].excluded === true && bad[1].id !== 1 && new Set(bad.map(function (p) { return p.id; })).size === 3, JSON.stringify(bad.map(function (p) { return p.id; })));
    })();

    (function E12() {
      var people = [];
      for (var i = 0; i < 12; i++) people.push(person(i + 1, { tier: TN[i % 4] }));
      var st = baseState(people, { pools: onePool(10000, 0) });
      var res = Engine.runPipeline(st);
      var nets = {};
      res.people.forEach(function (r) { nets[r.id] = r.netPiastres; });
      var st2 = baseState(people.map(function (p, i) { return i === 0 ? Object.assign({}, p, { excluded: true }) : p; }), { pools: onePool(10000, 0) });
      var res2 = Engine.runPipeline(st2);
      var d = Reports.compareToBaseline(st2, res2, { nets: nets, at: Date.now(), label: 'x' });
      record('E12 — المقارنة بالمرجع تحصي من زاد ومن نقص', d.down === 1 && d.up === 11 && d.deltaPiastres === 0, 'زاد ' + d.up + ' نقص ' + d.down + ' فرق ' + d.deltaPiastres);
    })();

    (function S1() {
      var r = rng(77), ok = true, detail = '', n = 0;
      for (var s = 0; s < 40 && ok; s++) {
        var people = randomPeople(r, 30 + Math.floor(r() * 200));
        var res = Engine.runPipeline(baseState(people, { pools: pools(Math.round(r() * 9e6) / 100 + 1, Math.round(r() * 4e6) / 100 + 1), roundingStep: [1, 25, 100][s % 3], roundingTarget: s % 2 ? 'net' : 'gross', capNet: s % 4 === 0 ? 900 : null }));
        if (onlyEmptyPoolRefusal(res)) continue;
        if (!res.ok) { ok = false; detail = JSON.stringify(res.errors); break; }
        n++;
        var lazyPeople = res.people, c = res.cols;
        for (var i = 0; i < c.n; i++) {
          if (lazyPeople[i].netPiastres !== c.net[i] || lazyPeople[i].grossPiastres !== c.gross[i]) { ok = false; detail = 'عمود الصافي لا يطابق صف ' + i; break; }
        }
        var st = baseState(people);
        var rows = Reports.detailRows(st, res), sumRows = rows.reduce(function (a, x) { return a + x.netPiastres; }, 0);
        if (sumRows !== res.totals.net) { ok = false; detail = 'مجموع صفوف التقرير ≠ الإجمالي'; }
      }
      record('S1 — الأعمدة والصفوف الكسولة والتقارير متطابقة بالقرش (40 سيناريو)', ok && n > 0, ok ? n + ' سيناريو' : detail);
    })();

    (function S2() {
      var people = [];
      for (var i = 0; i < 1000000; i++) people.push({ id: i + 1, code: '', name: 'ش' + (i % 5000), job: '', dept: 'ق' + (i % 9), tier: TN[i % 4], daysWorked: i % 11 ? null : 20, penaltyRate: i % 17 ? null : 0.1, manualFactor: null, overrideValue: null, pinnedPool: null, excluded: i % 97 === 0, notes: '' });
      var t0 = performance.now();
      var res = Engine.runPipeline(baseState(people, { pools: pools(90000000, 40000000) }));
      var ms = performance.now() - t0;
      var cons = res.ok && sumGross(res, 'الخدمة') === Engine.toPiastres(90000000);
      record('S2 — مليون صف: حساب كامل مع حفظ القيمة', res.ok && cons && ms < 20000, Math.round(ms) + ' مللي');
    })();

    (function S3() {
      var rows = [];
      for (var i = 0; i < 200000; i++) rows.push({ id: i + 1, name: 'محمد ' + (i % 7000) + ' أحمد', dept: 'قسم ' + (i % 9), tier: 'فئة ' + (i % 4), code: String(10000 + i), job: '' });
      var idx = Search.buildIndex(rows), t0 = performance.now();
      var res = Search.run(idx, 'محمد 123');
      var ms = performance.now() - t0;
      var t1 = performance.now();
      var order = Sorter.sortIndex(rows.length, function (k) { return rows[k].dept; }, 'asc');
      var sms = performance.now() - t1;
      record('S3 — بحث وترتيب 200 ألف صف', res && res.count > 0 && ms < 1500 && order.length === rows.length && sms < 1500, 'بحث ' + Math.round(ms) + ' مللي، ترتيب ' + Math.round(sms) + ' مللي');
    })();

    (function S4() {
      var people = [person(1, { penaltyRate: 0.2, pinnedPool: 'الخدمة', notes: 'x' }), person(2, { excluded: true, overrideValue: 500 }), person(7, { tier: 'مجهولة', daysWorked: 3 })];
      var packed = Pack.toJson(Pack.people(people));
      var back = Pack.unpeople(JSON.parse(JSON.stringify(packed)));
      var same = JSON.stringify(back) === JSON.stringify(people.map(function (p) { return Model.person(p); }));
      var csv = Importer.readCsv('a,b,c\n1,"x,""y""",3\r\n,,\n4,5,\n');
      var csvOk = csv.length === 3 && csv[1][1] === 'x,"y"' && csv[2][2] === '';
      record('S4 — التخزين العمودي يعود بلا فقد، وقارئ CSV السريع دقيق', same && csvOk, JSON.stringify(csv));
    })();

    return results;
  }

  function renderInto(root) {
    var list = run();
    var passed = list.filter(function (r) { return r.pass; }).length, ok = passed === list.length;
    var shell = UI.el('div', 'shell');
    shell.style.paddingTop = 'var(--s6)';
    var head = UI.el('div', 'page-head');
    var ht = UI.el('div', 'page-head-text');
    ht.appendChild(UI.el('h1', 'page-title', 'اختبارات قِسمة الذاتية'));
    ht.appendChild(UI.el('p', 'page-sub', 'تعمل كلها داخل المتصفح على محرك الحساب الحقيقي — بلا أي اتصال خارجي.'));
    head.appendChild(ht);
    shell.appendChild(head);
    var summary = UI.el('div', 'kpi-row');
    var c = UI.el('div', 'kpi ' + (ok ? 'kpi-ok' : 'kpi-danger'));
    c.appendChild(UI.el('div', 'kpi-label', 'النتيجة'));
    var v = UI.el('div', 'kpi-value');
    v.appendChild(UI.numText(passed + ' / ' + list.length, 'xl'));
    c.appendChild(v);
    c.appendChild(UI.el('div', 'kpi-foot', ok ? 'كل الاختبارات ناجحة' : (list.length - passed) + ' اختبار فاشل'));
    summary.appendChild(c);
    var c2 = UI.el('div', 'kpi kpi-flat');
    c2.appendChild(UI.el('div', 'kpi-label', 'الإصدار'));
    var v2 = UI.el('div', 'kpi-value');
    v2.appendChild(UI.numText(APP_VERSION + ' · محرك ' + Engine.VERSION, 'lg'));
    c2.appendChild(v2);
    summary.appendChild(c2);
    shell.appendChild(summary);
    var tw = UI.el('div', 'table-wrap mt5');
    var t = UI.el('table', 'dt selftest-table');
    var thead = UI.el('thead'), htr = UI.el('tr');
    ['', 'الاختبار', 'التفصيل'].forEach(function (h) { htr.appendChild(UI.el('th', null, h)); });
    thead.appendChild(htr);
    t.appendChild(thead);
    var tb = UI.el('tbody');
    list.forEach(function (r) {
      var tr = UI.el('tr');
      var s = UI.el('td');
      s.appendChild(UI.badge(r.pass ? 'نجح' : 'فشل', r.pass ? 'ok' : 'danger', r.pass ? 'ok' : 'danger'));
      tr.appendChild(s);
      tr.appendChild(UI.el('td', null, r.name));
      tr.appendChild(UI.el('td', 'small muted', r.detail));
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    tw.appendChild(t);
    shell.appendChild(tw);
    var back = UI.el('div', 'mt5');
    back.appendChild(UI.btn('العودة للتطبيق', { variant: 'primary', onClick: function () { window.location.search = ''; } }));
    shell.appendChild(back);
    UI.clear(root);
    root.appendChild(shell);
  }
  return { run: run, renderInto: renderInto };
})();

(function () {
  'use strict';
  function update(tw) {
    var max = tw.scrollWidth - tw.clientWidth;
    if (max <= 1) { tw.classList.remove('can-scroll-start', 'can-scroll-end'); return; }
    var pos = Math.abs(tw.scrollLeft);
    tw.classList.toggle('can-scroll-start', pos > 2);
    tw.classList.toggle('can-scroll-end', pos < max - 2);
  }
  function enhance(tw) {
    if (tw.__shadow) { update(tw); return; }
    tw.__shadow = true;
    var frame = document.createElement('div');
    frame.className = 'table-frame';
    tw.parentNode.insertBefore(frame, tw);
    frame.appendChild(tw);
    var end = document.createElement('div');
    end.className = 'scroll-shadow scroll-shadow-end';
    end.setAttribute('aria-hidden', 'true');
    frame.appendChild(end);
    tw.addEventListener('scroll', function () { update(tw); }, { passive: true });
    update(tw);
  }
  var pending = false;
  function scan() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () {
      pending = false;
      Array.prototype.forEach.call(document.querySelectorAll('.table-wrap'), enhance);
    });
  }
  var root = document.getElementById('app');
  if (root && typeof MutationObserver !== 'undefined') new MutationObserver(scan).observe(root, { childList: true, subtree: true });
  window.addEventListener('resize', function () { Array.prototype.forEach.call(document.querySelectorAll('.table-wrap'), update); }, { passive: true });
  scan();
})();

(function () {
  var root = document.getElementById('app');
  if (new URLSearchParams(window.location.search).get('selftest') === '1') SelfTest.renderInto(root);
  else App.boot(root);
})();
