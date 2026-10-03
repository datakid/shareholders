(function (Q) {
  'use strict';
  var el = UI.el, append = UI.append, clearNode = UI.clear, btn = UI.btn;
  function S() { return Q.state; }

  function screenDashboard() {
    var st = S();
    if (!st.result) Q.recompute();
    var wrap = el('div', 'screen-dash');
    if (!Q.ok()) {
      wrap.appendChild(Q.pageHead('اللوحة', 'الحساب غير مكتمل بعد.', null, Q.stepEyebrow('dashboard')));
      wrap.appendChild(Q.errorPanel(st.result));
      wrap.appendChild(Q.navFoot('allocate', null));
      return wrap;
    }
    var acts = [
      btn('طباعة', { icon: 'print', size: 'sm', onClick: printDashboard }),
      btn(st.baseline ? 'تحديث المرجع' : 'حفظ كمرجع', { icon: 'target', size: 'sm', title: 'احفظ النتيجة الحالية لتقارن بها أي تغيير لاحق', onClick: setBaseline }),
      btn('التصدير', { icon: 'download', size: 'sm', variant: 'primary', onClick: function () { Q.goto('export'); } })
    ];
    wrap.appendChild(Q.pageHead(st.title || 'اللوحة', (st.period ? st.period + ' — ' : '') + 'كل الأرقام محسوبة على الملف كاملًا؛ البحث والتصفية تخص الجدول فقط.', acts, Q.stepEyebrow('dashboard')));
    var ub = Q.unresolvedBanner();
    if (ub) { ub.classList.add('mb4'); wrap.appendChild(ub); }
    var bl = baselineNotice();
    if (bl) wrap.appendChild(bl);

    Q.hosts.kpis = el('div', 'mount');
    wrap.appendChild(Q.hosts.kpis);
    renderKpis();

    var mid = el('div', 'dash-grid mt5 mount mount-2');
    var poolsHost = el('div', 'col-7');
    poolsHost.appendChild(poolsPanel());
    mid.appendChild(poolsHost);
    var side = el('div', 'col-5 stack g4');
    side.appendChild(distributionCard());
    mid.appendChild(side);
    wrap.appendChild(mid);

    var two = el('div', 'grid-2 mt4 mount mount-3');
    two.appendChild(barChart('الصافي حسب القسم', Reports.deptRows(st, st.result).slice(0, 10).map(function (d) { return { name: d.dept, value: d.nP, note: Fmt.int(d.paid) + ' مستحق · متوسط ' + Fmt.egp(d.avg), filter: ['dept', d.dept === 'بدون قسم' ? '' : d.dept] }; })));
    two.appendChild(barChart('الصافي حسب الفئة', Reports.tierRows(st, st.result).slice(0, 10).map(function (t) { return { name: t.tier, value: t.nP, note: Fmt.int(t.paid) + ' مستحق · متوسط ' + Fmt.egp(t.avg), alt: t.unresolved > 0, filter: ['tier', t.tier === 'بدون فئة' ? '' : t.tier] }; })));
    wrap.appendChild(two);

    var section = el('section', 'mt6 mount mount-4');
    section.appendChild(el('h2', 'section-label', 'كل الأشخاص'));
    Q.hosts.table = el('div');
    var fb = Q.filterBar({
      pageKey: 'dashboard', searchId: 'dash-search', onChange: renderTable,
      extra: [UI.segmented({ size: 'sm', ariaLabel: 'تفاصيل الجدول', value: st.ui.tableDetail, options: [{ value: 'simple', label: 'مبسّط' }, { value: 'full', label: 'مفصّل' }], onChange: function (v) { st.ui.tableDetail = v; Q.scheduleSave(); renderTable(); } })],
      actions: [btn('تصدير العرض', { icon: 'download', size: 'sm', onClick: exportCurrentView })]
    });
    Q.hosts.dashFilter = fb;
    fb.el.classList.add('mt3');
    section.appendChild(fb.el);
    section.appendChild(Q.hosts.table);
    wrap.appendChild(section);
    renderTable();
    wrap.appendChild(Q.navFoot('allocate', 'export', 'مركز التصدير'));
    return wrap;
  }
  Q.screens.dashboard = screenDashboard;

  function printDashboard() {
    var st = S();
    var prev = st.ui.tableDetail;
    var prevPer = st.ui.rowsPerPage;
    var total = Q.viewRows().length;
    if (total > 5000) UI.toast('تُطبع أول 5,000 صف من العرض — للقائمة الكاملة استخدم التصدير', 'warn', 6000);
    st.ui.rowsPerPage = Math.min(5000, Math.max(prevPer, total));
    st.__printing = true;
    renderTable();
    setTimeout(function () {
      window.print();
      st.__printing = false;
      st.ui.rowsPerPage = prevPer;
      st.ui.tableDetail = prev;
      renderTable();
    }, 60);
  }
  Q.printDashboard = printDashboard;

  function setBaseline() {
    var st = S();
    if (!Q.ok()) return;
    var nets = {}, c = st.result.cols;
    if (c) for (var i = 0; i < c.n; i++) nets[c.ids[i]] = c.net[i];
    else st.result.people.forEach(function (r) { nets[r.id] = r.netPiastres; });
    var had = !!st.baseline;
    st.baseline = { at: Date.now(), label: st.period || Fmt.humanTime(Date.now()), nets: nets, totalNet: st.result.totals.net, count: st.people.length };
    Q.scheduleSave();
    Q.renderScreen();
    UI.toast(had ? 'تم تحديث المرجع إلى النتيجة الحالية' : 'حُفظت النتيجة الحالية كمرجع — أي تعديل لاحق سيظهر مقارنًا بها', 'ok');
  }

  function baselineNotice() {
    var st = S(), d = Q.baselineDiff();
    if (!d) return null;
    var changed = d.up + d.down;
    var text = changed ? Fmt.int(d.up) + ' زاد نصيبهم، ' + Fmt.int(d.down) + ' نقص، ' + Fmt.int(d.same) + ' دون تغيير' + (d.added ? '، ' + Fmt.int(d.added) + ' جديد' : '') : 'لا فرق عن المرجع — كل الأنصبة كما هي';
    var deltaNode = el('span');
    deltaNode.appendChild(document.createTextNode(' — فرق الإجمالي '));
    deltaNode.appendChild(UI.delta(d.deltaPiastres / 100));
    var n = UI.notice({
      tone: changed ? 'accent' : 'ok', icon: 'target', compact: true,
      title: 'مقارنة بالمرجع (' + d.label + ' · ' + Fmt.relTime(d.at) + ')',
      children: [append(el('div'), [text, changed ? deltaNode : null])],
      actions: [
        changed ? btn('عرض من تغيّروا', { size: 'sm', icon: 'filter', onClick: function () { st.filters = Q.emptyFilters(); st.filters.flags = ['changed']; st.sort = { key: 'delta', dir: 'desc' }; Q.renderScreen(); setTimeout(function () { var t = Q.hosts.table; if (t) t.scrollIntoView({ block: 'start' }); }, 50); } }) : null,
        btn('إزالة المرجع', { size: 'sm', variant: 'ghost', onClick: function () { st.baseline = null; st.filters.flags = st.filters.flags.filter(function (f) { return f !== 'changed'; }); if (st.sort.key === 'delta') st.sort = { key: null, dir: null }; Q.scheduleSave(); Q.renderScreen(); } })
      ].filter(Boolean)
    });
    n.classList.add('mb4');
    return n;
  }

  function renderKpis() {
    var host = Q.hosts.kpis;
    if (!host) return;
    clearNode(host);
    var st = S(), r = st.result;
    var exec = Reports.executiveRows(st, r), tot = exec.__totals;
    var cons = Reports.conservationCheck(st, r);
    var grid = el('div', 'kpi-row kpi-row-hero');
    var netNode = el('span', 'money money-xl');
    netNode.__value = Q.__kpiNet || 0;
    var hero = Q.kpiCard('الصافي الموزّع', netNode, 'على ' + Fmt.int(tot.paid) + ' مستحق من ' + Fmt.int(st.people.length) + ' شخص', 'hero', 'coins', el('span', 'cur', 'ج.م'));
    grid.appendChild(hero);
    UI.countUp(netNode, tot.totalNet);
    Q.__kpiNet = tot.totalNet;
    grid.appendChild(Q.kpiCard('إجمالي الخصومات', UI.moneyEGP(tot.totalTax, { size: 'lg' }), tot.totalGross > 0 ? Fmt.pct(tot.totalTax / tot.totalGross, 2) + ' من الإجمالي الموزّع' : '—', 'info', 'sliders'));
    grid.appendChild(Q.kpiCard('متوسط / وسيط الصافي', UI.moneyEGP(tot.paid ? tot.totalNet / tot.paid : 0, { size: 'lg' }), 'الوسيط ' + Fmt.egp(tot.median) + ' ج.م', 'flat', 'person'));
    var consNode = cons.ok ? UI.badge('مطابق بالقرش', 'ok', 'ok') : UI.badge(Fmt.int(cons.problems.length) + ' مجمع غير مطابق', 'danger', 'danger');
    grid.appendChild(Q.kpiCard('حفظ القيمة', consNode, cons.ok ? (tot.retained > 0 ? 'الموزّع + غير الموزّع (' + Fmt.egp(tot.retained) + ') = المجمعات' : 'مجموع الأنصبة = إجمالي كل مجمع بلا فرق') : 'راجع ورقة المنهجية', cons.ok ? 'ok' : 'danger', 'ok'));
    grid.appendChild(Q.kpiCard('نصيب وحدة الوزن', UI.numText(Fmt.egp(r.kEffective, 4), 'lg'), 'كل وحدة وزن تساوي هذا المبلغ صافيًا', 'flat', 'layers'));
    grid.appendChild(Q.kpiCard('أقصى انحراف فردي', UI.moneyEGP(tot.maxDrift, { size: 'lg' }), tot.maxDrift < 1 ? 'أقل من جنيه عن النصيب المثالي' : 'بسبب الموازنة بين المجمعات أو التقريب', tot.maxDrift < 1 ? 'ok' : 'warn', 'chart'));
    var un = (r.unresolvedTierIds || []).length, ex = Q.flagCounts().excluded || 0;
    if (un) grid.appendChild(clickKpi(Q.kpiCard('بدون فئة', UI.numText(Fmt.int(un), 'lg'), 'خارج التوزيع — اضغط للعرض', 'danger', 'warn'), 'unresolved'));
    if (ex) grid.appendChild(clickKpi(Q.kpiCard('مستبعدون', UI.numText(Fmt.int(ex), 'lg'), 'بقرار صريح — اضغط للعرض', 'flat', 'lock'), 'excluded'));
    if (r.cappedCount) grid.appendChild(clickKpi(Q.kpiCard('بلغوا الحد الأقصى', UI.numText(Fmt.int(r.cappedCount), 'lg'), 'الحد ' + Fmt.egp(r.options.capNet) + ' ج.م', 'warn', 'cap'), 'capped'));
    host.appendChild(grid);
  }
  function clickKpi(card, flag) {
    card.classList.add('kpi-click');
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    function go() {
      var st = S();
      st.filters = Q.emptyFilters();
      st.filters.flags = [flag];
      st.page.dashboard = 1;
      Q.renderScreen();
      setTimeout(function () { if (Q.hosts.table) Q.hosts.table.scrollIntoView({ block: 'start', behavior: UI.reduceMotion() ? 'auto' : 'smooth' }); }, 40);
    }
    card.addEventListener('click', go);
    card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    return card;
  }

  var meterWidths = Object.create(null);
  function poolsPanel() {
    var st = S();
    var c = Q.card('المجمعات', st.result.options.allocation === 'split' ? 'كل شخص يأخذ من كل المجمعات بنفس النسبة' : 'الانحراف = فرق نصيب وحدة الوزن في المجمع عن المتوسط العام', [btn('تعديل', { icon: 'sliders', size: 'sm', variant: 'ghost', onClick: function () { Q.goto('amounts'); } })]);
    var body = el('div', 'card-pad stack g5');
    Reports.poolRows(st, st.result).forEach(function (p, idx) {
      var block = el('div', 'pool-panel');
      block.style.setProperty('--pc', 'var(--pool-' + (idx % 6) + ')');
      var top = el('div', 'row g2 wrap');
      top.appendChild(el('span', 'pool-swatch'));
      top.appendChild(el('b', 'pool-panel-name', p.name));
      if (p.zeroBudget) top.appendChild(UI.badge('بلا مبلغ', 'warn', 'warn'));
      if (p.retained > 0) top.appendChild(UI.attachTip(UI.badge('غير موزّع ' + Fmt.egp(p.retained), 'warn'), 'مبلغ بقي في المجمع بسبب التقريب أو الحد الأقصى'));
      top.appendChild(el('div', 'spacer'));
      top.appendChild(el('span', 'small muted', Fmt.int(p.members) + ' عضو · خصم ' + Fmt.pctExact(p.taxRate)));
      block.appendChild(top);
      var nums = el('div', 'pool-nums');
      [['الإجمالي', p.effectiveGross], ['الخصم', p.tax], ['الصافي الموزّع', p.net]].forEach(function (x) {
        var n = el('div', 'stack');
        n.appendChild(el('span', 'tiny muted', x[0]));
        n.appendChild(UI.moneyEGP(x[1], { currency: true }));
        nums.appendChild(n);
      });
      block.appendChild(nums);
      if (p.deviation != null && st.result.options.allocation === 'assign' && p.members) {
        var abs = Math.abs(p.deviation);
        var tone = abs < 0.01 ? 'is-ok' : (abs < 0.05 ? 'is-warn' : 'is-danger');
        var meter = el('div', 'meter');
        var track = el('div', 'meter-track dev-track');
        var fill = el('div', 'meter-fill ' + tone);
        var span = Math.min(50, abs * 500);
        var targetW = Math.max(1, span);
        var key = p.name;
        fill.style.width = (meterWidths[key] != null ? meterWidths[key] : 0) + '%';
        fill.classList.add(p.deviation >= 0 ? 'dev-pos' : 'dev-neg');
        track.appendChild(fill);
        track.appendChild(el('div', 'meter-center'));
        meter.appendChild(track);
        var legend = el('div', 'meter-legend');
        legend.appendChild(el('span', null, 'وحدة الوزن هنا ' + Fmt.egp(p.kPool, 4)));
        legend.appendChild(el('b', tone.replace('is-', 'tx-'), (p.deviation >= 0 ? '+' : '') + Fmt.pct(p.deviation, 2)));
        meter.appendChild(legend);
        block.appendChild(meter);
        requestAnimationFrame(function () { fill.style.width = targetW + '%'; meterWidths[key] = targetW; });
      }
      body.appendChild(block);
    });
    c.appendChild(body);
    return c;
  }

  function distributionCard() {
    var st = S();
    var all = Q.rowsCache(), tmp = new Float64Array(all.length), cnt = 0;
    for (var ri = 0; ri < all.length; ri++) if (all[ri].netPiastres > 0) tmp[cnt++] = all[ri].net;
    var c = Q.card('توزيع الأنصبة', 'عدد المستحقين في كل شريحة صافٍ');
    var body = el('div', 'card-pad');
    if (cnt < 2) { body.appendChild(el('div', 'small muted', 'لا توجد بيانات كافية.')); c.appendChild(body); return c; }
    var vals = tmp.subarray(0, cnt).sort();
    var lo = vals[0], hi = vals[vals.length - 1];
    var bins = 12, width = (hi - lo) / bins || 1, counts = [];
    for (var i = 0; i < bins; i++) counts.push(0);
    vals.forEach(function (v) { var k = Math.min(bins - 1, Math.floor((v - lo) / width)); counts[k]++; });
    var max = counts.reduce(function (m, x) { return x > m ? x : m; }, 0) || 1;
    var hist = el('div', 'histo');
    hist.setAttribute('role', 'img');
    hist.setAttribute('aria-label', 'توزيع الصافي من ' + Fmt.egp(lo) + ' إلى ' + Fmt.egp(hi));
    counts.forEach(function (n, i) {
      var b = el('div', 'histo-bar');
      b.style.height = Math.max(3, (n / max) * 100) + '%';
      UI.attachTip(b, Fmt.egp(lo + i * width, 0) + ' – ' + Fmt.egp(lo + (i + 1) * width, 0) + ' ج.م: ' + Fmt.int(n) + ' شخص');
      hist.appendChild(b);
    });
    body.appendChild(hist);
    var axis = el('div', 'histo-axis');
    axis.appendChild(el('span', 'num', Fmt.egp(lo, 0)));
    axis.appendChild(el('span', 'num', Fmt.egp(hi, 0)));
    body.appendChild(axis);
    var q = function (p) { return vals[Math.min(vals.length - 1, Math.floor(p * (vals.length - 1)))]; };
    var stats = el('div', 'dist-stats');
    [['الأدنى', lo], ['الربع الأول', q(0.25)], ['الوسيط', q(0.5)], ['الربع الثالث', q(0.75)], ['الأعلى', hi]].forEach(function (x) {
      var s = el('div', 'stack');
      s.appendChild(el('span', 'tiny muted', x[0]));
      s.appendChild(el('b', 'num', Fmt.egp(x[1])));
      stats.appendChild(s);
    });
    body.appendChild(stats);
    var ratio = lo > 0 ? hi / lo : null;
    if (ratio) body.appendChild(el('div', 'tiny muted mt2', 'الأعلى يساوي ' + ratio.toFixed(1) + ' ضعف الأدنى' + (st.result.options.capNet ? ' — مع حد أقصى ' + Fmt.egp(st.result.options.capNet) : '')));
    c.appendChild(body);
    return c;
  }

  var barWidths = Object.create(null);
  function barChart(title, items) {
    var c = el('section', 'chart-card');
    c.appendChild(el('h3', 'section-label', title));
    if (!items.length) { c.appendChild(el('div', 'small muted', 'لا بيانات')); return c; }
    var max = items.reduce(function (m, i) { return Math.max(m, i.value); }, 0) || 1;
    var total = items.reduce(function (s, i) { return s + i.value; }, 0) || 1;
    var rows = el('div', 'chart-rows');
    items.forEach(function (it) {
      var row = el('button', 'chart-row');
      row.type = 'button';
      row.setAttribute('aria-label', (it.name || '—') + ': ' + Fmt.piastres(it.value) + ' ج.م — عرض في الجدول');
      var nm = el('span', 'chart-name', it.name || '—');
      row.appendChild(nm);
      var track = el('span', 'chart-track');
      var bar = el('span', 'chart-bar' + (it.alt ? ' alt' : ''));
      var key = title + '::' + it.name;
      bar.style.width = (barWidths[key] != null ? barWidths[key] : 0) + '%';
      var w = Math.max(1.5, (it.value / max) * 100);
      track.appendChild(bar);
      row.appendChild(track);
      var val = el('span', 'chart-val');
      val.appendChild(UI.moneyCell(it.value));
      val.appendChild(el('span', 'chart-pct', Fmt.pct(it.value / total, 0)));
      row.appendChild(val);
      UI.attachTip(row, (it.name || '—') + (it.note ? ' — ' + it.note : ''));
      row.addEventListener('click', function () {
        var st = S();
        st.filters = Q.emptyFilters();
        if (it.filter && it.filter[1]) st.filters[it.filter[0]] = it.filter[1];
        st.page.dashboard = 1;
        Q.renderScreen();
        setTimeout(function () { if (Q.hosts.table) Q.hosts.table.scrollIntoView({ block: 'start', behavior: UI.reduceMotion() ? 'auto' : 'smooth' }); }, 40);
      });
      rows.appendChild(row);
      requestAnimationFrame(function () { bar.style.width = w + '%'; barWidths[key] = w; });
    });
    c.appendChild(rows);
    return c;
  }

  function renderTable() {
    var host = Q.hosts.table;
    if (!host) return;
    var st = S();
    var snap = Q.captureFocus();
    var prevWrap = host.querySelector('.table-wrap');
    var sl = prevWrap ? prevWrap.scrollLeft : 0;
    var prevRows = st.__dashRowsShown;
    clearNode(host);
    var rows = Q.viewRows();
    var needle = st.__lastNeedle;
    if (Q.hosts.dashFilter) Q.hosts.dashFilter.setCount(rows.length, Q.rowsCache().length);
    var scroll = st.ui.viewMode === 'scroll' && !st.__printing;
    var per = st.ui.rowsPerPage;
    var pages = Math.max(1, Math.ceil(rows.length / per));
    if (st.page.dashboard > pages) st.page.dashboard = pages;
    var slice = scroll ? null : rows.slice((st.page.dashboard - 1) * per, st.page.dashboard * per);
    if (!rows.length) {
      var f = Q.activeFilterList().length;
      host.appendChild(el('div', 'card', UI.emptyState('لا صفوف مطابقة', f ? 'التصفية الحالية لا تطابق أي شخص.' : 'لا يوجد أشخاص.', f ? btn('مسح التصفية', { variant: 'primary', onClick: function () { st.filters = Q.emptyFilters(); Q.renderScreen(); } }) : null, 'search')));
      return;
    }
    var full = st.ui.tableDetail === 'full';
    var cols = Q.COLUMNS.filter(function (c) { return full || !c.detail; });
    var diff = Q.baselineDiff();
    var tw = el('div', 'table-wrap h-lg' + (scroll ? ' vgrid-wrap' : ''));
    var t = el('table', 'dt dt-fixed' + (st.ui.density === 'compact' ? ' compact' : ''));
    var cg = el('colgroup');
    var totalW = 0;
    cols.forEach(function (c) { var col = el('col'); col.style.width = c.width + 'px'; totalW += c.width; cg.appendChild(col); });
    if (diff) { var dc = el('col'); dc.style.width = '110px'; totalW += 110; cg.appendChild(dc); }
    var ac = el('col'); ac.style.width = '48px'; totalW += 48; cg.appendChild(ac);
    t.style.minWidth = totalW + 'px';
    t.appendChild(cg);
    var thead = el('thead'), htr = el('tr');
    function sortTh(key, label, numeric) {
      var th = el('th', (numeric ? 'num-col ' : '') + 'sortable');
      var b = el('button', 'th-btn');
      b.type = 'button';
      b.appendChild(el('span', null, label));
      b.appendChild(Icons.svg('arrowUp', 'sort-ind'));
      if (st.sort.key === key && st.sort.dir) th.setAttribute('aria-sort', st.sort.dir === 'asc' ? 'ascending' : 'descending');
      b.addEventListener('click', function () {
        var dir = st.sort.key === key ? Sorter.nextDir(st.sort.dir) : (numeric ? 'desc' : 'asc');
        st.sort = { key: dir ? key : null, dir: dir };
        st.page.dashboard = 1;
        Q.scheduleSave();
        Q.prepareView().then(renderTable);
      });
      th.appendChild(b);
      return th;
    }
    cols.forEach(function (c) { htr.appendChild(sortTh(c.key, c.label, c.numeric)); });
    if (diff) htr.appendChild(sortTh('delta', 'عن المرجع', true));
    htr.appendChild(el('th', 'act-col', el('span', 'sr-only', 'تفاصيل')));
    thead.appendChild(htr);
    t.appendChild(thead);
    var tb = el('tbody');
    function buildRow(r) {
      var tr = el('tr');
      var tone = Q.rowTone(r);
      if (tone) tr.className = tone;
      cols.forEach(function (c) {
        var td;
        if (c.key === 'name') {
          td = el('td', 'name-col');
          td.title = r.name;
          td.appendChild(Search.highlight(r.name, needle));
          if (r.unresolvedTier) td.appendChild(UI.badge('بدون فئة', 'danger'));
          else if (r.excluded) td.appendChild(UI.badge('مستبعد', 'neutral'));
          else if (r.special) td.appendChild(UI.attachTip(UI.badge('خاص', 'warn'), r.reason));
        } else if (c.numeric) {
          td = el('td', 'num-col');
          if (c.key === 'weight') td.appendChild(el('span', 'num small muted', Fmt.egp(r.weight, 4)));
          else if (c.key === 'days') td.appendChild(el('span', 'num' + (r.days < st.periodDays ? ' tx-warn' : ''), Fmt.plain(r.days, 2)));
          else if (c.key === 'drift') td.appendChild(UI.delta(r.drift));
          else td.appendChild(UI.moneyCell(r[c.key + 'Piastres']));
        } else {
          td = el('td', 'text-col');
          var v = c.get(r);
          td.title = v || '';
          if (c.key === 'dept' || c.key === 'tier' || c.key === 'code') td.appendChild(Search.highlight(v, needle));
          else td.appendChild(document.createTextNode(v || '—'));
        }
        tr.appendChild(td);
      });
      if (diff) {
        var dtd = el('td', 'num-col');
        var dv = diff.byId[r.id];
        dtd.appendChild(dv == null ? UI.badge('جديد', 'info') : UI.delta(dv / 100));
        tr.appendChild(dtd);
      }
      var act = el('td', 'act-col');
      act.appendChild(UI.iconBtn('eye', 'تفاصيل الحساب', function () { Q.openPerson(r.id); }, 'sm'));
      tr.appendChild(act);
      return tr;
    }
    if (!scroll) slice.forEach(function (r) { tb.appendChild(buildRow(r)); });
    t.appendChild(tb);
    var sums = st.__sumsFor === rows ? st.__sums : null;
    if (!sums) {
      sums = { gross: 0, tax: 0, net: 0 };
      for (var si = 0; si < rows.length; si++) { var rr = rows[si]; sums.gross += rr.grossPiastres; sums.tax += rr.taxPiastres; sums.net += rr.netPiastres; }
      st.__sums = sums; st.__sumsFor = rows;
    }
    var tfoot = el('tfoot'), ftr = el('tr');
    cols.forEach(function (c, i) {
      var td = el('td', c.numeric ? 'num-col' : null);
      if (i === 0) td.textContent = rows.length === Q.rowsCache().length ? 'الإجمالي' : 'إجمالي العرض (' + Fmt.int(rows.length) + ')';
      else if (c.key === 'gross' || c.key === 'tax' || c.key === 'net') td.appendChild(UI.moneyCell(sums[c.key]));
      ftr.appendChild(td);
    });
    if (diff) ftr.appendChild(el('td'));
    ftr.appendChild(el('td'));
    tfoot.appendChild(ftr);
    t.appendChild(tfoot);
    tw.appendChild(t);
    host.appendChild(tw);
    function onMode() { st.page.dashboard = 1; renderTable(); }
    if (scroll) {
      tw.style.height = 'min(72vh,720px)';
      if (prevWrap && prevWrap.classList.contains('vgrid-wrap') && prevRows === rows) tw.scrollTop = prevWrap.scrollTop;
      Q.virtualRows(tw, tb, rows.length, cols.length + (diff ? 2 : 1), st.ui.density === 'compact' ? 37 : 47, function (i) { return buildRow(rows[i]); });
      host.appendChild(Q.scrollFoot(rows.length, onMode));
    } else if (pages > 1 || rows.length > 25) host.appendChild(Q.pager(st.page.dashboard, pages, rows.length, per, function (p) {
      st.page.dashboard = p;
      renderTable();
      var w = host.querySelector('.table-wrap');
      if (w) w.scrollTop = 0;
      host.scrollIntoView({ block: 'start', behavior: UI.reduceMotion() ? 'auto' : 'smooth' });
    }, function (n) { st.ui.rowsPerPage = n; st.page.dashboard = 1; Q.scheduleSave(); renderTable(); }, onMode));
    tw.scrollLeft = sl;
    st.__dashRowsShown = rows;
    Q.restoreFocus(snap);
  }
  Q.renderTable = renderTable;

  function baseName(suffix) {
    var st = S();
    return Exporter.safeName((st.title || APP_NAME) + (st.period ? ' - ' + st.period : '') + (suffix ? ' - ' + suffix : '') + ' - ' + Fmt.fileStamp(new Date()));
  }
  function meta() { var st = S(); return { at: Date.now(), version: APP_VERSION, title: st.title, period: st.period }; }
  function needOk() { if (!Q.ok()) { UI.toast('صحّح أخطاء الحساب قبل التصدير', 'warn'); return false; } return true; }
  function tooBig() { return S().people.length > Exporter.XLSX_ROW_LIMIT; }
  function runStream(label, specsFn, filename, csvRows) {
    var t0 = performance.now();
    Busy.run('جارٍ تجهيز ' + label + '…', specsFn).then(function (specs) {
      Busy.show('جارٍ كتابة ' + label + ' بالتدفق… 0%');
      return Exporter.writeStream(specs, filename, meta(), function (p) { Busy.set('جارٍ كتابة ' + label + ' بالتدفق… ' + Math.round(p * 100) + '%'); })
        .then(function (out) { Busy.hide(); return out; }, function (e) { Busy.hide(); throw e; });
    }).then(function (out) {
      UI.toast('تم تنزيل ' + label + ' — ' + Fmt.int(out.rows) + ' صف في ' + Fmt.int(out.sheets) + ' ورقة (' + Fmt.kb(out.blob.size) + '، ' + ((performance.now() - t0) / 1000).toFixed(1) + ' ث)', 'ok', 6500);
    }, function (e) {
      if (window.console) console.error(e);
      if (!csvRows) { UI.toast('تعذّر إنشاء الملف: ' + (e && e.message || e), 'danger'); return; }
      Busy.run('جارٍ إنشاء ' + label + '…', function () { Exporter.writeCsv(csvRows(), filename.replace(/\.xlsx$/, '.csv')); })
        .then(function () { UI.toast('تعذّرت الكتابة المتدفقة — نُزّل ' + label + ' بصيغة CSV', 'warn', 6500); });
    });
  }
  Q.runStream = runStream;
  function run(label, fn, csvRows, stream) {
    if (stream && tooBig() && Exporter.streamAvailable()) { runStream(label, stream.specs, stream.filename, csvRows); return; }
    if (csvRows && tooBig()) {
      Busy.run('جارٍ إنشاء ' + label + '…', function () { Exporter.writeCsv(csvRows(), baseName(label) + '.csv'); })
        .then(function () { UI.toast('نُزّل ' + label + ' بصيغة CSV — الحجم أكبر من أن يُكتب كملف Excel في المتصفح', 'ok', 6000); }, function (e) { UI.toast('تعذّر التصدير: ' + (e && e.message || e), 'danger'); });
      return;
    }
    if (!Exporter.available()) {
      if (stream && Exporter.streamAvailable()) { runStream(label, stream.specs, stream.filename, csvRows); return; }
      if (!csvRows) { UI.toast('محرك Excel غير محمّل — تأكد من وجود vendor/xlsx.full.min.js وأعد التحميل', 'danger'); return; }
      try { Exporter.writeCsv(csvRows(), baseName(label) + '.csv'); UI.toast('محرك Excel غير محمّل — نُزّل ' + label + ' بصيغة CSV', 'warn', 6000); }
      catch (e) { UI.toast('تعذّر التصدير: ' + (e && e.message || e), 'danger'); }
      return;
    }
    Busy.maybe(S().people.length, 'جارٍ إنشاء ' + label + '…', fn)
      .then(function () { UI.toast('تم تنزيل ' + label, 'ok'); }, function (e) { if (window.console) console.error(e); UI.toast('تعذّر إنشاء الملف: ' + (e && e.message || 'خطأ غير معروف'), 'danger'); });
  }
  function exportFullReport() {
    if (!needOk()) return;
    var st = S();
    run('التقرير الكامل', function () { Exporter.write(Exporter.buildFullReport(st, st.result, meta()), baseName() + '.xlsx'); }, function () { return Exporter.detailAoa(st, st.result); },
      { specs: function () { return Exporter.streamSpecs(st, st.result, meta()); }, filename: baseName() + '.xlsx' });
  }
  function exportPayroll() {
    if (!needOk()) return;
    var st = S();
    run('كشف الصرف', function () { Exporter.write(Exporter.buildSelectedReport(st, st.result, meta(), ['payroll']), baseName('كشف الصرف') + '.xlsx'); }, function () {
      var rows = Reports.detailRows(st, st.result).filter(function (r) { return r.netPiastres > 0; });
      return [['م', 'الرقم الوظيفي', 'الاسم', 'القسم', 'الصافي']].concat(rows.map(function (r, i) { return [i + 1, r.code, r.name, r.dept, r.net]; }));
    }, { specs: function () { return Exporter.streamSpecs(st, st.result, meta(), ['payroll']); }, filename: baseName('كشف الصرف') + '.xlsx' });
  }
  function viewColumns() {
    var st = S(), diff = Q.baselineDiff();
    var cols = Q.COLUMNS.map(function (c) { return { label: c.label, get: c.get, format: c.format, sum: c.sum }; });
    if (diff) cols.push({ label: 'الفرق عن المرجع', get: function (r) { var d = diff.byId[r.id]; return d == null ? '' : d / 100; }, format: Exporter.FORMATS.M2, sum: false });
    return cols;
  }
  function exportCurrentView() {
    if (!needOk()) return;
    var rows = Q.viewRows();
    if (!rows.length) { UI.toast('لا صفوف ظاهرة لتصديرها', 'warn'); return; }
    var cols = viewColumns();
    run('العرض الحالي (' + Fmt.int(rows.length) + ' صف)', function () {
      Exporter.write(Exporter.buildViewExport({ rows: rows, columns: cols, filterLines: Q.activeFilterLines() }, meta()), baseName('عرض') + '.xlsx');
    }, function () { return [cols.map(function (c) { return c.label; })].concat(rows.map(function (r) { return cols.map(function (c) { var v = c.get(r); return v == null ? '' : v; }); })); },
    { filename: baseName('عرض') + '.xlsx', specs: function () {
      var formats = {};
      cols.forEach(function (c, i) { if (c.format) formats[i] = c.format; });
      return [{ name: 'العرض الحالي', header: cols.map(function (c) { return c.label; }), count: rows.length, opts: { formats: formats },
        rowAt: function (k) { var r = rows[k]; return cols.map(function (c) { var v = c.get(r); return v == null ? '' : v; }); } }];
    } });
  }
  Q.exportCurrentView = exportCurrentView;
  function downloadTemplate(mode) {
    var st = S();
    var tname = Exporter.safeName('قالب ' + APP_NAME + ' - ' + Fmt.isoDate()) + '.xlsx';
    run(mode === 'blank' ? 'القالب الفارغ' : 'القالب', function () { Exporter.write(Exporter.buildTemplate(st, mode), tname); }, function () { return Exporter.templateRows(st, mode); },
      { filename: tname, specs: function () { return [Exporter.streamAoaSpec('البيانات', Exporter.templateRows(st, mode), { formats: { 5: Exporter.FORMATS.INT, 6: Exporter.FORMATS.PCT, 7: Exporter.FORMATS.M4, 8: Exporter.FORMATS.M2 } })]; } });
  }
  Q.downloadTemplate = downloadTemplate;

  function exportSessionBundle() {
    var st = S();
    Store.flushAll();
    Busy.maybe(st.people.length, 'جارٍ تجهيز النسخة…', function () {
      Exporter.writeJson(Store.serializeBundle(st), 'نسخة ' + APP_NAME_LATIN + ' - ' + baseName() + '.json');
    }).then(function () { UI.toast('تم تنزيل نسخة كاملة من العمل', 'ok'); }, function () { UI.toast('تعذّر إنشاء النسخة', 'danger'); });
  }
  Q.exportSessionBundle = exportSessionBundle;
  function exportSettingsOnly(format) {
    var st = S();
    if (format === 'xlsx') { run('الإعدادات', function () { Exporter.write(Exporter.buildSettingsExport(st), Exporter.safeName('إعدادات ' + APP_NAME + ' - ' + Fmt.isoDate()) + '.xlsx'); }); return; }
    Exporter.writeJson(JSON.parse(Store.serializeBundle(st, { settings: true, people: false })), Exporter.safeName('إعدادات ' + APP_NAME_LATIN + ' - ' + Fmt.isoDate()) + '.json');
    UI.toast('تم تنزيل ملف الإعدادات', 'ok');
  }
  Q.exportSettingsOnly = exportSettingsOnly;

  function importBundle() {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.addEventListener('change', function () { if (inp.files && inp.files[0]) readBundleFile(inp.files[0]); });
    inp.click();
  }
  Q.importBundle = importBundle;
  function readBundleFile(f) {
    var reader = new FileReader();
    reader.onerror = function () { UI.toast('تعذّر قراءة الملف', 'danger'); };
    reader.onload = function (e) {
      var b = Store.deserializeBundle(String(e.target.result || ''));
      if (!b.ok) { UI.toast(b.error, 'danger'); return; }
      var st = S();
      var hasPeople = b.state.people && b.state.people.length;
      if (!hasPeople) {
        UI.confirmModal({
          title: 'استيراد الإعدادات؟', tone: 'accent',
          message: 'سيحل محل الفئات والمجمعات والقواعد الحالية. بيانات الأشخاص لا تتأثر، ويمكنك التراجع.',
          confirmLabel: 'استيراد', onConfirm: function () { applyBundle(b, false); }
        });
        return;
      }
      Q.guardReplace(function () { applyBundle(b, true); }, 'محتوى النسخة');
    };
    reader.readAsText(f);
  }
  Q.readBundleFile = readBundleFile;

  function applyBundle(b, withPeople) {
    var st = S(), s = b.state;
    var snap = Q.snapshot();
    if (s.tiers) st.tiers = Model.tiers(s.tiers);
    if (s.pools) st.pools = Model.pools(s.pools);
    if (s.options) st.options = Model.options(Object.assign({}, st.options, s.options));
    if (s.periodDays) st.periodDays = Model.periodDays(s.periodDays);
    if (s.tierAliases) st.tierAliases = Object.assign({}, s.tierAliases);
    if (s.ui) { st.ui = Model.ui(Object.assign({}, st.ui, s.ui)); Theme.set(st.ui.theme); applyMotion(); }
    if (withPeople) {
      st.people = s.__packed ? s.people : Model.people(s.people || []);
      if (s.title != null) st.title = String(s.title);
      if (s.period != null) st.period = String(s.period);
      st.fileName = s.fileName || 'نسخة مستعادة';
      st.sheetName = s.sheetName || '';
      st.mapping = s.mapping || {};
      st.penaltyScale = s.penaltyScale || 'auto';
      if (s.sourceGrid && s.sourceGrid.length) { st.sourceGrid = s.sourceGrid; st.headerRow = s.headerRow || 0; }
      else if (s.rawRows && s.rawRows.length && s.headers) { st.sourceGrid = [s.headers].concat(s.rawRows); st.headerRow = 0; }
      else st.sourceGrid = [];
      Q.deriveGrid();
      st.mappedFromGrid = st.people.length > 0;
      st.baseline = s.baseline || null;
      st.undoStack = []; st.redoStack = []; st.selection = {};
      st.filters = Q.emptyFilters();
      st.workbook = null;
      st.__restore = null;
    } else Q.pushUndo('استيراد إعدادات', snap);
    Q.recompute();
    var screen = withPeople ? (st.people.length ? 'allocate' : (Q.hasGrid() ? 'map' : 'upload')) : st.screen;
    Q.renderShell();
    Q.goto(screen);
    UI.toast(withPeople ? 'تمت الاستعادة — ' + Fmt.int(st.people.length) + ' شخص' : 'تم استيراد الإعدادات', 'ok');
  }
  Q.applyBundle = applyBundle;

  function customExport() {
    if (!needOk()) return;
    var st = S();
    var big = tooBig() && Exporter.streamAvailable();
    if (!big && !Exporter.available()) { UI.toast('محرك Excel غير محمّل', 'danger'); return; }
    if (tooBig() && !big) { exportFullReport(); return; }
    var reg = Exporter.sheetRegistry(st);
    var unresolved = (st.result.unresolvedTierIds || []).length;
    var hints = {
      exec: 'أهم الأرقام في صفحة واحدة', pools: 'ملخص كل مجمع', detail: Fmt.int(st.people.length) + ' شخص بكل الأعمدة',
      payroll: 'المستحقون فقط مع خانة توقيع', unresolved: Fmt.int(unresolved) + ' شخص خارج التوزيع',
      special: Fmt.int(Reports.specialRows(st, st.result).length) + ' حالة', dept: 'مجاميع كل قسم', tier: 'مجاميع كل فئة',
      warnings: Fmt.int((st.result.warnings || []).length) + ' تنبيه', methodology: 'شرح القواعد والتقريب'
    };
    var sel = {};
    reg.forEach(function (d) { sel[d.key] = !(d.key === 'unresolved' && !unresolved) && !(d.key === 'warnings' && !(st.result.warnings || []).length); });
    var m = UI.modal({ title: 'تصدير مخصّص', subtitle: 'اختر الأوراق وطريقة التنزيل', wide: true });
    var grid = el('div', 'check-grid');
    reg.forEach(function (d) {
      var disabled = (d.key === 'unresolved' && !unresolved);
      var cb = UI.checkbox({ label: d.label, hint: d.pool ? 'ورقة مستقلة لأعضاء هذا المجمع' : hints[d.key], checked: sel[d.key], disabled: disabled, onChange: function (v) { sel[d.key] = v; refresh(); } });
      cb.classList.add('check-card');
      grid.appendChild(cb);
    });
    m.body.appendChild(grid);
    var mode = 'single';
    var modeCtl = UI.segmented({ block: true, value: mode, ariaLabel: 'طريقة التنزيل', options: [{ value: 'single', label: 'ملف واحد بكل الأوراق' }, { value: 'multi', label: 'ملف لكل ورقة' }], onChange: function (v) { mode = v; } });
    m.body.appendChild(UI.field('طريقة التنزيل', modeCtl, null, { cls: 'mt4' }));
    var go;
    function keys() { return Object.keys(sel).filter(function (k) { return sel[k]; }); }
    function refresh() { var n = keys().length; go.disabled = !n; go.querySelector('.btn-label').textContent = n ? 'تصدير ' + Fmt.int(n) + ' ورقة' : 'اختر ورقة'; }
    var allB = btn('تحديد الكل', { size: 'sm', variant: 'ghost', onClick: function () { reg.forEach(function (d) { sel[d.key] = true; }); m.close(); customExport(); } });
    m.foot.appendChild(allB);
    m.foot.appendChild(el('div', 'spacer'));
    m.foot.appendChild(btn('إلغاء', { variant: 'ghost', onClick: m.close }));
    go = btn('تصدير', { variant: 'primary', icon: 'download', onClick: function () {
      var ks = keys();
      if (big) {
        m.close();
        if (mode === 'single') runStream('التصدير المخصص', function () { return Exporter.streamSpecs(st, st.result, meta(), ks); }, baseName('مخصص') + '.xlsx');
        else {
          var chain = Promise.resolve();
          ks.forEach(function (k) {
            var d = reg.filter(function (x) { return x.key === k; })[0];
            chain = chain.then(function () {
              var specs = Exporter.streamSpecs(st, st.result, meta(), [k]);
              if (!specs.length) return null;
              return Exporter.writeStream(specs, baseName(d ? d.label : k) + '.xlsx', meta());
            });
          });
          Busy.show('جارٍ كتابة ' + Fmt.int(ks.length) + ' ملف بالتدفق…');
          chain.then(function () { Busy.hide(); UI.toast('تم تنزيل ' + Fmt.int(ks.length) + ' ورقة', 'ok'); }, function (e) { Busy.hide(); UI.toast('تعذّر إنشاء الملف: ' + (e && e.message || e), 'danger'); });
        }
        return;
      }
      try {
        if (mode === 'single') {
          var wb = Exporter.buildSelectedReport(st, st.result, meta(), ks);
          if (!wb.SheetNames.length) { UI.toast('الأوراق المختارة فارغة', 'warn'); return; }
          Exporter.write(wb, baseName('مخصص') + '.xlsx');
        } else ks.forEach(function (k, i) {
          setTimeout(function () {
            var one = Exporter.buildSelectedReport(st, st.result, meta(), [k]);
            if (!one.SheetNames.length) return;
            var d = reg.filter(function (x) { return x.key === k; })[0];
            Exporter.write(one, baseName(d ? d.label : k) + '.xlsx');
          }, i * 260);
        });
        m.close();
        UI.toast('تم تنزيل ' + Fmt.int(ks.length) + ' ورقة', 'ok');
      } catch (e) { UI.toast('تعذّر إنشاء الملف: ' + (e && e.message || e), 'danger'); }
    } });
    m.foot.appendChild(go);
    refresh();
  }

  function exportCard(o) {
    var c = el('article', 'export-card' + (o.primary ? ' is-primary' : ''));
    var top = el('div', 'export-top');
    var ic = el('span', 'export-icon');
    ic.appendChild(Icons.svg(o.icon));
    top.appendChild(ic);
    var tt = el('div', 'stack');
    tt.appendChild(el('h3', 'card-title', o.title));
    if (o.kind) tt.appendChild(el('span', 'tiny muted', o.kind));
    top.appendChild(tt);
    c.appendChild(top);
    c.appendChild(el('p', 'small muted', o.desc));
    if (o.sheets) {
      var chips = el('div', 'chip-row');
      o.sheets.forEach(function (s) { chips.appendChild(UI.badge(s, 'neutral')); });
      c.appendChild(chips);
    }
    if (o.note) c.appendChild(el('div', 'tiny muted export-note', o.note));
    if (o.controls) c.appendChild(o.controls);
    c.appendChild(el('div', 'spacer'));
    var acts = el('div', 'stack g2');
    acts.appendChild(o.action);
    if (o.extra) acts.appendChild(o.extra);
    c.appendChild(acts);
    return c;
  }

  function screenExport() {
    var st = S();
    if (!st.result) Q.recompute();
    var wrap = el('div', 'screen-export');
    wrap.appendChild(Q.pageHead('مركز التصدير', 'التقرير الكامل يشمل كل الأشخاص دائمًا مهما كانت التصفية. تصدير العرض يعطيك ما تراه على الشاشة بنفس الترتيب — وكل ملف يكتب نوعه بنفسه.', null, Q.stepEyebrow('export')));
    if (!Q.ok()) {
      wrap.appendChild(Q.errorPanel(st.result));
      var g0 = el('div', 'export-grid mt4');
      g0.appendChild(exportCard({ icon: 'save', title: 'نسخة كاملة من العمل', desc: 'احفظ عملك الآن حتى مع وجود أخطاء، واستعده لاحقًا.', action: btn('تنزيل نسخة', { icon: 'save', block: true, variant: 'primary', onClick: exportSessionBundle }) }));
      wrap.appendChild(g0);
      wrap.appendChild(Q.navFoot('allocate', null));
      return wrap;
    }
    var rows = Q.rowsCache(), shown = Q.viewRows().length;
    var unresolved = (st.result.unresolvedTierIds || []).length;
    if (unresolved) {
      var nt = UI.notice({ tone: 'warn', title: 'التقرير سيتضمن ورقة «بدون فئة»', text: Fmt.int(unresolved) + ' شخص خارج التوزيع لعدم تعريف فئتهم. الورقة تسجّل أسماءهم وسببه وتترك خانة لقرارك.', actions: [btn('مراجعتهم', { size: 'sm', onClick: function () { Q.setFlagFilter('unresolved'); } })] });
      nt.classList.add('mb4');
      wrap.appendChild(nt);
    }
    var paid = rows.filter(function (r) { return r.netPiastres > 0; }).length;
    var grid = el('div', 'export-grid mount');
    grid.appendChild(exportCard({
      primary: true, icon: 'file', title: 'التقرير الكامل', kind: 'Excel · ' + (9 + Object.keys(st.pools).length) + ' ورقة تقريبًا',
      desc: 'كل الأشخاص (' + Fmt.int(rows.length) + ') مع المجمعات والأقسام والفئات والحالات الخاصة والتنبيهات والمنهجية، وورقة لكل مجمع.',
      sheets: ['الملخص', 'المجمعات', 'التفصيل', 'كشف الصرف', 'الأقسام', 'الفئات', 'المنهجية'],
      action: btn('تنزيل التقرير الكامل', { variant: 'primary', icon: 'download', block: true, onClick: exportFullReport }),
      extra: btn('اختيار الأوراق…', { icon: 'sliders', block: true, variant: 'ghost', onClick: customExport })
    }));
    grid.appendChild(exportCard({
      icon: 'people', title: 'كشف الصرف', kind: 'Excel · ورقة واحدة',
      desc: Fmt.int(paid) + ' مستحق مرتبين بالرقم والاسم والقسم والصافي، مع خانة توقيع وإجمالي — جاهز للطباعة والاعتماد.',
      action: btn('تنزيل كشف الصرف', { icon: 'download', block: true, onClick: exportPayroll })
    }));
    grid.appendChild(exportCard({
      icon: 'eye', title: 'العرض الحالي', kind: 'Excel · ' + Fmt.int(shown) + ' صف',
      desc: 'نفس التصفية والترتيب الظاهرين في اللوحة، ومكتوب في رأس الورقة ما كان مطبّقًا.',
      note: Q.filterSummaryText(),
      action: btn('تنزيل العرض الحالي', { icon: 'download', block: true, onClick: exportCurrentView }),
      extra: btn('تعديل التصفية في اللوحة', { block: true, variant: 'ghost', onClick: function () { Q.goto('dashboard'); } })
    }));
    var tmode = 'roster';
    var tctl = UI.segmented({ block: true, size: 'sm', value: tmode, ariaLabel: 'نوع القالب', options: [{ value: 'roster', label: 'قائمة لفترة جديدة' }, { value: 'current', label: 'كل البيانات' }, { value: 'blank', label: 'فارغ' }], onChange: function (v) { tmode = v; } });
    grid.appendChild(exportCard({
      icon: 'table', title: 'قالب لفترة قادمة', kind: 'Excel',
      desc: '«قائمة لفترة جديدة» تحتفظ بالأسماء والفئات والتثبيت وتترك الأيام والجزاءات فارغة لتملأها.',
      controls: tctl,
      action: btn('تنزيل القالب', { icon: 'download', block: true, onClick: function () { downloadTemplate(tmode); } })
    }));
    grid.appendChild(exportCard({
      icon: 'save', title: 'نسخة كاملة من العمل', kind: 'JSON · قابل للاستعادة',
      desc: 'الملف والتعديلات والإعدادات والمرجع في ملف واحد — استعده على أي جهاز وتكمل من نفس النقطة.',
      action: btn('تنزيل نسخة', { icon: 'save', block: true, onClick: exportSessionBundle }),
      extra: btn('استعادة نسخة', { icon: 'folder', block: true, variant: 'ghost', onClick: importBundle })
    }));
    grid.appendChild(exportCard({
      icon: 'print', title: 'طباعة / PDF', kind: 'من المتصفح',
      desc: 'اللوحة مهيأة للطباعة: الأزرار تختفي والجدول يُطبع كاملًا. اختر «حفظ كـ PDF» من نافذة الطباعة.',
      action: btn('طباعة اللوحة', { icon: 'print', block: true, onClick: function () { Q.goto('dashboard'); setTimeout(printDashboard, 450); } })
    }));
    wrap.appendChild(grid);

    var sum = Q.card('ما سيحتويه الملخص التنفيذي', null, [btn('نسخ', { size: 'sm', variant: 'ghost', icon: 'copy', onClick: function () {
      var txt = Reports.executiveRows(st, st.result).map(function (r) { return r.label + ': ' + (r.kind === 'money' ? Fmt.egp(r.value) : (r.kind === 'rate' ? Fmt.egp(r.value, 4) : Fmt.int(r.value))); }).join('\n');
      UI.copyText((st.title || '') + (st.period ? ' — ' + st.period : '') + '\n' + txt).then(function () { UI.toast('نُسخ الملخص', 'ok'); }, function () { UI.toast('تعذّر النسخ', 'danger'); });
    } })], 'mt5 mount mount-2');
    var list = el('dl', 'exec-list');
    Reports.executiveRows(st, st.result).forEach(function (r) {
      var row = el('div', 'exec-row');
      row.appendChild(el('dt', null, r.label));
      var dd = el('dd');
      if (r.kind === 'money') dd.appendChild(UI.moneyEGP(r.value));
      else dd.appendChild(el('span', 'num', r.kind === 'rate' ? Fmt.egp(r.value, 4) : Fmt.int(r.value)));
      row.appendChild(dd);
      list.appendChild(row);
    });
    sum.appendChild(el('div', 'card-pad', list));
    wrap.appendChild(sum);

    var danger = el('section', 'card card-pad danger-zone mt5 mount mount-3');
    var dh = el('div', 'row g3 wrap');
    var dt = el('div', 'stack grow');
    dt.appendChild(el('h2', 'card-title', 'بدء فترة جديدة'));
    dt.appendChild(el('div', 'small muted', 'يمسح الملف الحالي وكل تعديلاته. الفئات والمجمعات والقواعد تبقى. نزّل نسخة أولًا إن احتجت.'));
    dh.appendChild(dt);
    dh.appendChild(btn('بدء فترة جديدة', { variant: 'danger', icon: 'reset', onClick: confirmNewProject }));
    danger.appendChild(dh);
    wrap.appendChild(danger);
    wrap.appendChild(Q.navFoot('dashboard', null));
    return wrap;
  }
  Q.screens['export'] = screenExport;

  function confirmNewProject() {
    UI.confirmModal({
      title: 'بدء فترة جديدة؟', danger: true, confirmLabel: 'ابدأ من جديد',
      message: 'سيُمسح الملف الحالي وكل التعديلات. الفئات والمجمعات والقواعد تبقى.',
      altLabel: 'تنزيل نسخة ثم البدء', onAlt: function () { exportSessionBundle(); doNew(); },
      onConfirm: doNew
    });
    function doNew() {
      var st = S();
      Q.clearData();
      st.period = '';
      Q.goto('upload');
      UI.toast('بدأت فترة جديدة — ارفع ملف الفترة', 'ok');
    }
  }

  var PANES = [
    { key: 'rules', label: 'قواعد الحساب', icon: 'sliders' },
    { key: 'tiers', label: 'الفئات', icon: 'layers' },
    { key: 'pools', label: 'المجمعات', icon: 'coins' },
    { key: 'display', label: 'العرض', icon: 'eye' },
    { key: 'data', label: 'البيانات والحفظ', icon: 'save' },
    { key: 'about', label: 'حول', icon: 'info' }
  ];
  function openSettings(start) {
    var current = PANES.some(function (p) { return p.key === start; }) ? start : 'rules';
    var m = UI.modal({ title: 'الإعدادات', subtitle: 'كل تغيير يُحفظ تلقائيًا ويُعاد الحساب فورًا، ويمكن التراجع عنه', wide: true, footer: false, cls: 'settings-modal', onClose: function () { Q.hosts.settingsRepaint = null; } });
    var shell = el('div', 'settings-shell');
    var rail = el('nav', 'settings-rail');
    rail.setAttribute('aria-label', 'أقسام الإعدادات');
    var pane = el('div', 'settings-pane');
    shell.appendChild(rail);
    shell.appendChild(pane);
    m.body.appendChild(shell);
    function paint() {
      clearNode(rail);
      PANES.forEach(function (p) {
        var b = el('button', 'rail-btn');
        b.type = 'button';
        if (p.key === current) b.setAttribute('aria-current', 'true');
        b.appendChild(Icons.svg(p.icon));
        b.appendChild(el('span', null, p.label));
        b.addEventListener('click', function () { current = p.key; paint(); pane.scrollTop = 0; });
        rail.appendChild(b);
      });
      var sy = pane.scrollTop;
      clearNode(pane);
      ({ rules: paneRules, tiers: paneTiers, pools: panePools, display: paneDisplay, data: paneData, about: paneAbout })[current](pane, m);
      pane.scrollTop = sy;
    }
    Q.hosts.settingsRepaint = paint;
    paint();
  }
  Q.openSettings = openSettings;

  function paneHead(pane, title, intro) {
    pane.appendChild(el('h3', 'pane-title', title));
    if (intro) pane.appendChild(el('p', 'pane-intro', intro));
  }
  function settingRow(name, desc, control) {
    var r = el('div', 'setting-row');
    var l = el('div');
    l.appendChild(el('div', 'setting-name', name));
    if (desc) l.appendChild(el('div', 'setting-desc', desc));
    r.appendChild(l);
    r.appendChild(el('div', 'setting-control', control));
    return r;
  }
  function paneRules(pane) {
    var st = S();
    paneHead(pane, 'قواعد الحساب', 'تُطبَّق على الجميع وتُكتب في ورقة المنهجية. النتائج حتمية: نفس المدخلات تعطي نفس الأنصبة بالقرش دائمًا.');
    pane.appendChild(Q.rulesEditor());
    var daysIn = UI.input({ value: st.periodDays, numeric: true, integer: true, stepper: 1, suffix: 'يوم', ariaLabel: 'أيام الفترة', onChange: function (v, i) {
      var n = Fmt.parseNumber(v);
      if (n == null || n < 1 || n > 366) { i.value = st.periodDays; UI.toast('أيام الفترة بين 1 و366', 'warn'); return; }
      var snap = Q.snapshot();
      st.periodDays = Math.round(n);
      Q.pushUndo('تعديل أيام الفترة', snap);
      Q.recompute();
      Q.renderScreenIfMounted();
    } });
    pane.appendChild(settingRow('عدد أيام الفترة', 'من ترك خانة أيامه فارغة يُحسب له كامل الفترة', daysIn));
    pane.appendChild(UI.notice({ tone: 'accent', compact: true, title: 'كيف تُوزَّع القروش الباقية', text: 'بعد إعطاء كل شخص نصيبه الصحيح، تذهب القروش الباقية للأكبر كسرًا، ثم للأكبر وزنًا، ثم للأصغر رقم صف. مجموع الأنصبة يطابق المجمع بالقرش، وأي مبلغ لم يُوزَّع (بسبب التقريب أو الحد الأقصى) يظهر صراحة في التقرير.' }));
  }
  function paneTiers(pane) {
    var st = S();
    paneHead(pane, 'الفئات وقيمها', 'قيمة الفئة هي وزنها النسبي. أي فئة في بياناتك غير معرّفة هنا تُخرج صاحبها من التوزيع.');
    pane.appendChild(Q.tierEditor(function () { Q.renderScreenIfMounted(); }));
    pane.appendChild(btn('فئة جديدة', { icon: 'plus', cls: 'mt3', onClick: function () { Q.promptNewTier('', function () { Q.renderScreenIfMounted(); if (Q.hosts.settingsRepaint) Q.hosts.settingsRepaint(); }); } }));
    var al = Object.keys(st.tierAliases || {});
    if (al.length) {
      pane.appendChild(el('h4', 'pane-sub mt5', 'الأسماء البديلة'));
      pane.appendChild(el('p', 'setting-desc', 'تُطابق تلقائيًا عند استيراد أي ملف لاحق.'));
      var list = el('div', 'stack mt2');
      al.forEach(function (k) {
        var r = el('div', 'alias-row');
        r.appendChild(el('span', null, k));
        r.appendChild(Icons.svg('chevron'));
        r.appendChild(el('b', null, st.tierAliases[k]));
        r.appendChild(el('div', 'spacer'));
        r.appendChild(UI.iconBtn('x', 'إزالة الاسم البديل', function () { delete st.tierAliases[k]; Q.scheduleSave(); Q.hosts.settingsRepaint(); }, 'sm'));
        list.appendChild(r);
      });
      pane.appendChild(list);
    }
  }
  function panePools(pane, m) {
    var st = S();
    paneHead(pane, 'المجمعات', 'تعديل المبالغ يتم في شاشة «المبالغ» حيث ترى أثر كل رقم مباشرة.');
    var t = Q.poolTotals();
    Object.keys(st.pools).forEach(function (n) {
      var p = st.pools[n], b = t.budgets[n];
      var pinned = st.people.filter(function (x) { return x.pinnedPool === n; }).length;
      pane.appendChild(settingRow(n, 'إجمالي ' + Fmt.egp(p.gross) + ' · خصم ' + Fmt.pctExact(p.taxRate) + ' · صافٍ ' + Fmt.piastres(b.net) + (pinned ? ' · ' + Fmt.int(pinned) + ' مثبّت' : ''),
        btn('تعديل', { size: 'sm', onClick: function () { m.close(); Q.goto('amounts'); } })));
    });
    pane.appendChild(settingRow('الإجمالي', null, UI.moneyCell(t.netPi, { currency: true })));
    pane.appendChild(btn('اذهب إلى المبالغ', { variant: 'primary', cls: 'mt3', onClick: function () { m.close(); Q.goto('amounts'); } }));
  }
  function applyMotion() {
    var st = S();
    document.documentElement.setAttribute('data-motion', st.ui.motion === 'reduced' ? 'reduced' : 'full');
  }
  Q.applyMotion = applyMotion;
  function paneDisplay(pane) {
    var st = S();
    paneHead(pane, 'العرض', 'تفضيلات الواجهة فقط — لا تؤثر على أي حساب أو تصدير.');
    pane.appendChild(settingRow('المظهر', 'فاتح أو داكن أو حسب النظام', UI.segmented({ value: Theme.get(), ariaLabel: 'المظهر', options: [{ value: 'system', label: 'النظام', icon: 'monitor' }, { value: 'light', label: 'فاتح', icon: 'sun' }, { value: 'dark', label: 'داكن', icon: 'moon' }], onChange: function (v) { Q.setTheme(v); } })));
    pane.appendChild(settingRow('كثافة الجداول', 'المضغوط يعرض صفوفًا أكثر', UI.segmented({ value: st.ui.density, ariaLabel: 'الكثافة', options: [{ value: 'normal', label: 'مريح' }, { value: 'compact', label: 'مضغوط' }], onChange: function (v) { st.ui.density = v; Q.scheduleSave(); Q.renderScreenIfMounted(); } })));
    pane.appendChild(settingRow('عرض الصفوف', 'صفحات مرقّمة، أو تمرير متصل يعرض كل الصفوف حتى بالملايين', UI.segmented({ value: st.ui.viewMode, ariaLabel: 'عرض الصفوف', options: [{ value: 'pages', label: 'صفحات' }, { value: 'scroll', label: 'تمرير' }], onChange: function (v) { st.ui.viewMode = v; Q.scheduleSave(); Q.renderScreenIfMounted(); } })));
    pane.appendChild(settingRow('صفوف في الصفحة', null, UI.dropdown({ size: 'sm', align: 'end', value: String(st.ui.rowsPerPage), options: [25, 50, 100, 250, 500].map(function (n) { return { value: String(n), label: String(n) }; }), onChange: function (v) { st.ui.rowsPerPage = Number(v); Q.scheduleSave(); Q.renderScreenIfMounted(); } })));
    pane.appendChild(settingRow('الحركة', 'تقليلها يوقف الانتقالات والعدّادات المتحركة', UI.segmented({ value: st.ui.motion, ariaLabel: 'الحركة', options: [{ value: 'full', label: 'كاملة' }, { value: 'reduced', label: 'مخفّضة' }], onChange: function (v) { st.ui.motion = v; applyMotion(); Q.scheduleSave(); } })));
    pane.appendChild(settingRow('تأكيد الحذف الجماعي', 'اطلب تأكيدًا قبل حذف 5 صفوف أو أكثر', UI.toggle({ checked: st.ui.confirmDanger, ariaLabel: 'تأكيد الحذف', onChange: function (v) { st.ui.confirmDanger = v; Q.scheduleSave(); } })));
  }
  function paneData(pane, m) {
    var st = S();
    var u = Store.usage();
    paneHead(pane, 'البيانات والحفظ', u.available ? 'يُحفظ عملك تلقائيًا في هذا المتصفح فقط — المستخدم حاليًا ' + Fmt.kb(u.total) + (Q.save.lean ? '. الملف الأصلي كبير على مساحة المتصفح فحُفظت البيانات دونه.' : '.') : 'الحفظ التلقائي غير متاح: ' + u.reason + '. نزّل نسخة يدويًا.');
    pane.appendChild(settingRow('نسخة كاملة', 'الملف والتعديلات والإعدادات في JSON واحد (Ctrl+S)', btn('تنزيل', { icon: 'save', size: 'sm', onClick: exportSessionBundle })));
    pane.appendChild(settingRow('الإعدادات فقط', 'الفئات والمجمعات والقواعد بلا أشخاص', append(el('div', 'row g2'), [btn('JSON', { size: 'sm', onClick: function () { exportSettingsOnly('json'); } }), btn('Excel', { size: 'sm', onClick: function () { exportSettingsOnly('xlsx'); } })])));
    pane.appendChild(settingRow('استيراد', 'نسخة كاملة أو ملف إعدادات — يُرفض أي ملف من إصدار أحدث', btn('اختيار ملف', { icon: 'folder', size: 'sm', onClick: function () { m.close(); importBundle(); } })));
    pane.appendChild(settingRow('استعادة الافتراضي', 'يعيد الفئات والمجمعات والقواعد للقيم الأصلية (مع إمكانية التراجع)', btn('استعادة', { size: 'sm', icon: 'reset', onClick: function () {
      var snap = Q.snapshot();
      st.tiers = Model.defaultTiers(); st.pools = Model.defaultPools();
      st.options = Q.makeState().options; st.periodDays = 30; st.tierAliases = {};
      Q.pushUndo('استعادة الإعدادات الافتراضية', snap);
      Q.recompute(); Q.renderScreenIfMounted(); Q.hosts.settingsRepaint();
      UI.toast('استُعيدت الإعدادات الافتراضية', 'ok', { label: 'تراجع', onClick: Q.undo });
    } })));
    var dz = settingRow('مسح كل المحفوظ', 'يحذف الجلسة والإعدادات من هذا المتصفح ويعيد التطبيق لحالته الأولى', btn('مسح الكل', { variant: 'danger', size: 'sm', onClick: function () {
      UI.confirmModal({
        title: 'مسح كل البيانات المحفوظة؟', danger: true, confirmLabel: 'مسح الكل',
        message: 'سيُحذف الملف والتعديلات والفئات والمجمعات من هذا المتصفح نهائيًا.',
        altLabel: 'تنزيل نسخة ثم المسح', onAlt: function () { exportSessionBundle(); wipe(); },
        onConfirm: wipe
      });
      function wipe() {
        Store.clearAll();
        UI.closeAllModals();
        Q.state = Q.makeState();
        Theme.set('system');
        applyMotion();
        Q.renderShell();
        UI.toast('تم مسح كل البيانات المحفوظة', 'ok');
      }
    } }));
    dz.classList.add('is-danger');
    pane.appendChild(dz);
    pane.appendChild(UI.notice({ tone: 'accent', compact: true, icon: 'lock', title: 'خصوصية', text: 'قِسمة يعمل بالكامل داخل متصفحك. ملفاتك لا تُرفع لأي مكان ولا يوجد أي اتصال بخادم بعد تحميل الصفحة.' }));
  }
  function paneAbout(pane) {
    paneHead(pane, APP_NAME + ' ' + APP_NAME_LATIN, APP_TAGLINE + '. أداة لتوزيع مبالغ الحوافز والمجمعات على الأشخاص بأوزان عادلة، بدقة القرش ونتيجة ثابتة لنفس المدخلات.');
    pane.appendChild(settingRow('إصدار التطبيق', null, el('b', 'num', APP_VERSION)));
    pane.appendChild(settingRow('إصدار المحرك', null, el('b', 'num', String(Engine.VERSION))));
    pane.appendChild(settingRow('إصدار الحفظ', null, el('b', 'num', String(Store.SCHEMA))));
    pane.appendChild(settingRow('محرك Excel', null, Exporter.available() ? UI.badge('متاح', 'ok', 'ok') : UI.badge('غير محمّل', 'warn', 'warn')));
    var sel = document.createElement('a');
    sel.href = '?selftest=1';
    sel.className = 'btn btn-sm';
    sel.textContent = 'تشغيل الاختبارات الذاتية';
    pane.appendChild(settingRow('الاختبارات الذاتية', 'أكثر من 40 اختبارًا على المحرك الحقيقي داخل المتصفح', sel));
    pane.appendChild(settingRow('اختصارات لوحة المفاتيح', null, btn('عرض', { size: 'sm', icon: 'keyboard', onClick: openShortcuts })));
  }

  var SHORTCUTS = [
    ['Ctrl+K', 'الأوامر السريعة'], ['/', 'البحث في الجدول'], ['Ctrl+Z', 'تراجع'], ['Ctrl+Y', 'إعادة'],
    ['Ctrl+S', 'تنزيل نسخة كاملة'], ['Alt+1…6', 'الانتقال بين الخطوات'], ['Enter', 'حفظ الخلية والنزول'],
    ['Esc', 'إلغاء تعديل الخلية أو إغلاق النافذة'], ['← →', 'الشخص التالي/السابق في نافذة التفاصيل'], ['?', 'هذه القائمة']
  ];
  function openShortcuts() {
    var m = UI.modal({ title: 'اختصارات لوحة المفاتيح', size: 'sm' });
    var list = el('dl', 'kbd-list');
    SHORTCUTS.forEach(function (s) {
      var r = el('div', 'kbd-row');
      r.appendChild(el('dt', null, UI.kbd(s[0])));
      r.appendChild(el('dd', null, s[1]));
      list.appendChild(r);
    });
    m.body.appendChild(list);
    m.foot.appendChild(el('div', 'spacer'));
    m.foot.appendChild(btn('إغلاق', { variant: 'primary', onClick: m.close }));
  }
  Q.openShortcuts = openShortcuts;

  function commands() {
    var st = S(), list = [];
    Q.SCREENS.forEach(function (s, i) { if (Q.screenEnabled(s.key)) list.push({ group: 'انتقال', icon: s.icon, label: 'الخطوة ' + (i + 1) + ': ' + s.label, kbd: 'Alt+' + (i + 1), run: function () { Q.goto(s.key); } }); });
    list.push({ group: 'إجراءات', icon: 'upload', label: 'رفع ملف جديد', run: function () { Q.goto('upload'); } });
    list.push({ group: 'إجراءات', icon: 'copy', label: 'لصق من Excel', run: Q.openPasteModal });
    if (Q.hasData()) {
      list.push({ group: 'إجراءات', icon: 'plus', label: 'إضافة صف', run: Q.addPerson });
      list.push({ group: 'إجراءات', icon: 'fill', label: 'تعديل جماعي', run: function () { if (st.screen !== 'allocate') Q.goto('allocate'); setTimeout(function () { Q.openBulkEdit(); }, 120); } });
      list.push({ group: 'إجراءات', icon: 'plus', label: 'مجمع جديد', run: function () { Q.goto('amounts'); setTimeout(Q.addPool, 150); } });
      if (Q.ok()) {
        list.push({ group: 'تصدير', icon: 'file', label: 'تنزيل التقرير الكامل', run: exportFullReport });
        list.push({ group: 'تصدير', icon: 'people', label: 'تنزيل كشف الصرف', run: exportPayroll });
        list.push({ group: 'تصدير', icon: 'eye', label: 'تنزيل العرض الحالي', run: exportCurrentView });
        list.push({ group: 'تصدير', icon: 'print', label: 'طباعة اللوحة', run: function () { Q.goto('dashboard'); setTimeout(printDashboard, 450); } });
        list.push({ group: 'إجراءات', icon: 'target', label: 'حفظ النتيجة كمرجع للمقارنة', run: setBaseline });
      }
      Q.FLAGS.forEach(function (f) { list.push({ group: 'تصفية', icon: 'filter', label: 'عرض: ' + f.label, run: function () { Q.setFlagFilter(f.key); } }); });
    }
    list.push({ group: 'بيانات', icon: 'save', label: 'تنزيل نسخة كاملة', kbd: 'Ctrl+S', run: exportSessionBundle });
    list.push({ group: 'بيانات', icon: 'folder', label: 'استعادة نسخة', run: importBundle });
    list.push({ group: 'بيانات', icon: 'people', label: 'تحميل بيانات تجريبية', run: Q.loadDemo });
    list.push({ group: 'بيانات', icon: 'chart', label: 'اختبار الحمل (حتى مليوني صف)', run: Q.openStressPicker });
    PANES.forEach(function (p) { list.push({ group: 'الإعدادات', icon: p.icon, label: 'الإعدادات: ' + p.label, run: function () { openSettings(p.key); } }); });
    list.push({ group: 'الإعدادات', icon: 'moon', label: 'تبديل المظهر', run: function () { Q.setTheme(Theme.resolve() === 'dark' ? 'light' : 'dark'); } });
    list.push({ group: 'مساعدة', icon: 'keyboard', label: 'اختصارات لوحة المفاتيح', kbd: '?', run: openShortcuts });
    return list;
  }

  function openPalette() {
    if (UI.hasOpenModal()) return;
    var m = UI.modal({ title: 'الأوامر السريعة', footer: false, cls: 'palette', initialFocus: '.palette-input' });
    var inp = el('input', 'input palette-input');
    inp.type = 'text';
    inp.placeholder = 'اكتب أمرًا أو اسم شخص…';
    inp.setAttribute('aria-label', 'بحث في الأوامر والأشخاص');
    inp.setAttribute('role', 'combobox');
    inp.setAttribute('aria-expanded', 'true');
    var listEl = el('div', 'palette-list');
    listEl.setAttribute('role', 'listbox');
    listEl.id = UI.nextId('pal');
    inp.setAttribute('aria-controls', listEl.id);
    m.body.appendChild(inp);
    m.body.appendChild(listEl);
    var all = commands(), items = [], idx = 0;
    function paint() {
      clearNode(listEl);
      var q = Engine.normalizeLoose(inp.value);
      items = all.filter(function (c) { return !q || Engine.normalizeLoose(c.label + ' ' + c.group).indexOf(q) !== -1; });
      var big = Q.hasData() && S().people.length >= EngineWorker.VIEW_THRESHOLD && EngineWorker.supported();
      function personItems(res) {
        var out = [];
        if (res) res.ranked.slice(0, 6).forEach(function (h) {
          var r = Q.rowById()[h.id];
          if (r) out.push({ group: 'أشخاص', icon: 'person', label: r.name || 'صف ' + r.id, hint: [r.dept, r.tier, r.netPiastres ? Fmt.piastres(r.netPiastres) + ' ج.م' : ''].filter(Boolean).join(' · '), run: function () { Q.openPerson(r.id); } });
        });
        return out;
      }
      if (q && Q.hasData() && !big) items = items.concat(personItems(Search.run(Q.searchIndex(), inp.value)));
      else if (q && big) {
        var asked = inp.value;
        EngineWorker.search(S().people, asked).then(function (r) {
          if (inp.value !== asked || !inp.isConnected || !r || r.none) return;
          var extra = personItems(r);
          if (!extra.length) return;
          items = all.filter(function (c) { return Engine.normalizeLoose(c.label + ' ' + c.group).indexOf(Engine.normalizeLoose(asked)) !== -1; }).concat(extra);
          draw();
        }, function () {});
      }
      draw();
    }
    function draw() {
      clearNode(listEl);
      idx = Math.min(idx, Math.max(0, items.length - 1));
      var lastGroup = null;
      items.forEach(function (c, i) {
        if (c.group !== lastGroup) { listEl.appendChild(el('div', 'dd-group', c.group)); lastGroup = c.group; }
        var b = el('button', 'dd-opt palette-opt' + (i === idx ? ' active' : ''));
        b.type = 'button';
        b.setAttribute('role', 'option');
        b.id = listEl.id + '-' + i;
        b.setAttribute('aria-selected', i === idx ? 'true' : 'false');
        b.appendChild(Icons.svg(c.icon || 'chevron', 'dd-opt-icon'));
        var tx = el('span', 'dd-opt-text');
        tx.appendChild(el('span', null, c.label));
        if (c.hint) tx.appendChild(el('span', 'dd-opt-hint', c.hint));
        b.appendChild(tx);
        if (c.kbd) b.appendChild(el('kbd', 'kbd', c.kbd));
        b.addEventListener('mousemove', function () { if (idx !== i) { idx = i; mark(); } });
        b.addEventListener('click', function () { exec(c); });
        listEl.appendChild(b);
      });
      if (!items.length) listEl.appendChild(el('div', 'dd-empty', 'لا نتائج'));
      mark();
    }
    function mark() {
      Array.prototype.forEach.call(listEl.querySelectorAll('.palette-opt'), function (b, i) {
        b.classList.toggle('active', i === idx);
        b.setAttribute('aria-selected', i === idx ? 'true' : 'false');
        if (i === idx) { b.scrollIntoView({ block: 'nearest' }); inp.setAttribute('aria-activedescendant', b.id); }
      });
    }
    function exec(c) { m.close(); setTimeout(c.run, 20); }
    inp.addEventListener('input', function () { idx = 0; paint(); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(items.length - 1, idx + 1); mark(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, idx - 1); mark(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (items[idx]) exec(items[idx]); }
    });
    paint();
  }
  Q.openPalette = openPalette;

  function restoreSession() {
    var st = S(), stub = st.__restore;
    if (!stub) return;
    function finish(s) {
      st.__restore = null;
      applyBundle({ ok: true, state: s }, true);
      if (s.screen && Q.screenEnabled(s.screen) && s.screen !== st.screen) Q.goto(s.screen);
      if (s.rawDropped) UI.toast('الملف الأصلي لم يُحفظ لكبر حجمه — البيانات والتعديلات محفوظة كاملة', 'warn', 7000);
    }
    if (!stub.inIdb) { finish(stub); return; }
    Busy.show('جارٍ استعادة ' + Fmt.int(stub.count || 0) + ' صف…');
    Store.loadBig().then(function (s) {
      Busy.hide();
      if (!s) { st.__restore = null; Q.renderNotices(); UI.toast('تعذّر العثور على الجلسة المحفوظة', 'danger'); return; }
      setTimeout(function () { finish(s); }, 20);
    }, function () { Busy.hide(); UI.toast('تعذّر قراءة الجلسة المحفوظة', 'danger'); });
  }
  Q.restoreSession = restoreSession;

  function isTyping(t) { return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }
  document.addEventListener('keydown', function (e) {
    var st = S();
    if (!st || !st.__app) return;
    var typing = isTyping(e.target);
    var mod = e.ctrlKey || e.metaKey;
    if (mod && e.code === 'KeyS') { e.preventDefault(); exportSessionBundle(); return; }
    if (mod && e.code === 'KeyK') { e.preventDefault(); if (!UI.hasOpenModal()) openPalette(); return; }
    if (UI.hasOpenModal()) return;
    if (mod && !typing && e.code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); Q.undo(); return; }
    if (mod && !typing && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) { e.preventDefault(); Q.redo(); return; }
    if (e.altKey && !mod && /^Digit[1-6]$/.test(e.code)) {
      var s = Q.SCREENS[Number(e.code.slice(5)) - 1];
      if (s && Q.screenEnabled(s.key)) { e.preventDefault(); Q.goto(s.key); }
      return;
    }
    if (typing || mod || e.altKey) return;
    if (e.key === '/') {
      var sr = document.getElementById('dash-search') || document.getElementById('grid-search');
      if (sr) { e.preventDefault(); sr.focus(); sr.select(); }
    } else if (e.key === '?') { e.preventDefault(); openShortcuts(); }
  });
  window.addEventListener('storage', function (e) {
    var st = S();
    if (!st || !st.__app || !e.key || e.key.indexOf('qisma.') !== 0) return;
    st.__externalChange = true;
    Q.renderNotices();
  });
  window.addEventListener('beforeunload', function (e) {
    Store.flushAll();
    if (Q.save.failure && Q.hasData()) { e.preventDefault(); e.returnValue = ''; }
  });
  document.addEventListener('dragover', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1) e.preventDefault(); });
  document.addEventListener('drop', function (e) {
    if (e.defaultPrevented) return;
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) { e.preventDefault(); Q.handleFile(e.dataTransfer.files[0]); }
  });

  function boot(root) {
    Q.hosts.root = root;
    Q.state = Q.makeState();
    var st = Q.state;
    var saved = Store.load('settings');
    if (saved && !saved.__error) {
      if (saved.tiers) { var t = Model.tiers(saved.tiers); if (Object.keys(t).length) st.tiers = t; }
      if (saved.pools) { var p = Model.pools(saved.pools); if (Object.keys(p).length) st.pools = p; }
      if (saved.options) st.options = Model.options(Object.assign({}, st.options, saved.options));
      if (saved.ui) st.ui = Model.ui(saved.ui);
      if (saved.periodDays) st.periodDays = Model.periodDays(saved.periodDays);
      if (saved.tierAliases) st.tierAliases = saved.tierAliases;
    }
    Theme.init(st.ui.theme);
    applyMotion();
    var sess = Store.load('session');
    if (sess && !sess.__error && sess.inIdb) { sess.people = { length: sess.count || 0 }; st.__restore = sess; }
    else if (sess && !sess.__error && ((sess.people && sess.people.length) || (sess.sourceGrid && sess.sourceGrid.length) || (sess.rawRows && sess.rawRows.length))) st.__restore = sess;
    else if (sess && sess.__error === 'NEWER_SCHEMA') setTimeout(function () { UI.toast('الجلسة المحفوظة من إصدار أحدث ولم تُقرأ حفاظًا عليها', 'warn', 8000); }, 400);
    Q.autosaveArmed = true;
    if (window.addEventListener) window.addEventListener('load', function () { Pwa.register(); });
    window.addEventListener('scroll', function () { if (Q.hosts.topbar) Q.hosts.topbar.classList.toggle('is-elevated', window.scrollY > 6); }, { passive: true });
    Q.renderShell();
  }

  var App = {
    boot: boot,
    version: APP_VERSION,
    internals: {
      getState: function () { return Q.state; },
      setState: function (s) { Q.state = s; if (!s.filters) s.filters = Q.emptyFilters(); if (!s.sort) s.sort = { key: null, dir: null }; if (!s.page) s.page = { dashboard: 1, allocate: 1, grid: 1 }; if (!s.ui) s.ui = Model.ui({}); if (!s.undoStack) s.undoStack = []; if (!s.redoStack) s.redoStack = []; },
      recompute: Q.recompute,
      viewRows: Q.viewRows,
      rowsCache: Q.rowsCache,
      searchIndex: Q.searchIndex,
      resultIndex: Q.resultIndex,
      filterSummaryText: Q.filterSummaryText,
      makeState: Q.makeState,
      snapshot: Q.snapshot,
      undo: Q.undo, redo: Q.redo, commit: Q.commit, pushUndo: Q.pushUndo,
      COLUMNS: Q.COLUMNS,
      FLAGS: Q.FLAGS
    }
  };
  window.App = App;
})(Q);
