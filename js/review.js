(function (Q) {
  'use strict';
  var el = UI.el, append = UI.append, clearNode = UI.clear, btn = UI.btn;
  function S() { return Q.state; }

  var GRID_FIELDS = [
    { key: 'name', label: 'الاسم', type: 'text', width: 200 },
    { key: 'code', label: 'الرقم', type: 'text', width: 92 },
    { key: 'dept', label: 'القسم', type: 'text', width: 150 },
    { key: 'tier', label: 'الفئة', type: 'tier', width: 156 },
    { key: 'daysWorked', label: 'الأيام', type: 'int', width: 78, numeric: true },
    { key: 'penaltyRate', label: 'الجزاء %', type: 'pct', width: 86, numeric: true },
    { key: 'manualFactor', label: 'المعامل', type: 'num', width: 86, numeric: true },
    { key: 'overrideValue', label: 'قيمة مخصصة', type: 'num', width: 112, numeric: true },
    { key: 'pinnedPool', label: 'مثبّت على', type: 'pool', width: 156 },
    { key: 'excluded', label: 'مستبعد', type: 'bool', width: 72 },
    { key: 'notes', label: 'ملاحظات', type: 'text', width: 180 }
  ];
  Q.GRID_FIELDS = GRID_FIELDS;

  function nameOf(id) { var p = Q.personById()[id]; return p ? (p.name || 'صف ' + p.id) : 'صف ' + id; }
  Q.nameOf = nameOf;

  function displayValue(p, f) {
    var v = p[f.key];
    if (v == null) return '';
    if (f.type === 'pct') return Fmt.plain(v * 100, 4);
    if (f.type === 'num' || f.type === 'int') return Fmt.plain(v, 4);
    return String(v);
  }
  Q.displayValue = displayValue;

  function parseCell(f, raw) {
    var st = S();
    if (f.type === 'text') return { ok: true, value: String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim() };
    var s = String(raw == null ? '' : raw).trim();
    if (s === '') return { ok: true, value: null };
    var n = Fmt.parseNumber(s);
    if (n == null) return { ok: false, msg: 'قيمة غير رقمية: ' + s };
    if (f.type === 'pct') {
      if (n < 0 || n > 100) return { ok: false, msg: 'نسبة الجزاء بين 0 و100%' };
      return { ok: true, value: n / 100 };
    }
    if (n < 0) return { ok: false, msg: 'لا تُقبل قيمة سالبة' };
    if (f.key === 'daysWorked' && n > st.periodDays) return { ok: false, msg: 'أكبر من أيام الفترة (' + st.periodDays + ')' };
    return { ok: true, value: n };
  }
  Q.parseCell = parseCell;

  function commit(ids, patchFn, label, opts) {
    var snap = Q.snapshot();
    var n = Q.updatePeople(ids, patchFn);
    if (!n) return 0;
    Q.pushUndo(label, snap);
    if (S().people.length > 30000 && S().__app) { Q.recomputeBusy(null, function () { afterEdit(opts); }); return n; }
    Q.recompute();
    afterEdit(opts);
    return n;
  }
  Q.commit = commit;

  function afterEdit(opts) {
    if (!S().__app) return;
    if (Q.hosts.gridBody && Q.hosts.gridBody.isConnected) {
      if (opts && opts.full) renderGridBody(); else patchVisibleRows();
      renderGridSummary();
      if (Q.hosts.gridFilter) Q.hosts.gridFilter.refresh();
      paintReviewNotices();
    } else if (Q.hosts.screen) Q.renderScreen();
    Q.renderStepper();
    if (Q.hosts.sheetRepaint) Q.hosts.sheetRepaint();
  }
  Q.afterEdit = afterEdit;

  Q.errorPanel = function (result) {
    var errs = (result && result.errors) || [];
    var codes = errs.map(function (e) { return e.code; });
    var has = function (re) { return codes.some(function (c) { return re.test(c); }); };
    var acts = [];
    if (has(/NO_POOLS|BAD_TAX|BAD_GROSS|EMPTY_POOL|BAD_PERIOD/)) acts.push(btn('تعديل المبالغ', { variant: 'primary', size: 'sm', onClick: function () { Q.goto('amounts'); } }));
    if (has(/UNKNOWN_PINNED_POOL/)) acts.push(btn('إلغاء التثبيت غير الصالح', {
      size: 'sm', onClick: function () {
        var st = S();
        commit(null, function (p) { return p.pinnedPool && !st.pools[p.pinnedPool] ? { pinnedPool: null } : null; }, 'إلغاء تثبيت غير صالح', { full: true });
        Q.renderScreen();
      }
    }));
    if (has(/EMPTY_POOL/)) acts.push(btn('إلغاء كل التثبيت', { size: 'sm', onClick: function () { commit(null, function (p) { return p.pinnedPool ? { pinnedPool: null } : null; }, 'إلغاء كل التثبيت', { full: true }); Q.renderScreen(); } }));
    if (has(/NO_ELIGIBLE/)) acts.push(btn('تعريف الفئات', { variant: 'primary', size: 'sm', onClick: function () { Q.openSettings('tiers'); } }));
    if (has(/DUPLICATE_ID/)) acts.push(btn('إعادة ترقيم الصفوف', {
      size: 'sm', onClick: function () {
        var st = S(), snap = Q.snapshot();
        st.people = st.people.map(function (p, i) { return Object.assign({}, p, { id: i + 1 }); });
        Q.pushUndo('إعادة ترقيم', snap);
        st.selection = {};
        Q.recompute();
        Q.renderScreen();
      }
    }));
    if (has(/INTERNAL|CONSERVATION|NEGATIVE|CAP_VIOLATED/)) acts.push(btn('تنزيل نسخة للمراجعة', { size: 'sm', onClick: function () { Q.exportSessionBundle(); } }));
    var list = el('ul', 'err-list');
    errs.slice(0, 8).forEach(function (e) { list.appendChild(el('li', null, e.message || e.code)); });
    if (errs.length > 8) list.appendChild(el('li', 'muted', 'و' + Fmt.int(errs.length - 8) + ' خطأ آخر'));
    return UI.notice({ tone: 'danger', title: 'تعذّر إكمال الحساب', children: [list], actions: acts });
  };

  function setFlagFilter(flag) {
    var st = S();
    st.filters = Q.emptyFilters();
    if (flag) st.filters.flags = [flag];
    st.page.grid = 1; st.page.dashboard = 1;
    if (st.screen === 'allocate' && Q.hosts.gridHost) renderGrid();
    else Q.goto('allocate');
  }
  Q.setFlagFilter = setFlagFilter;

  function unresolvedBanner() {
    var st = S();
    var ids = (st.result && st.result.unresolvedTierIds) || [];
    if (!ids.length) return null;
    var pm = Q.personById();
    var names = ids.slice(0, 4).map(function (id) { var p = pm[id]; return p ? (p.name || 'صف ' + id) : 'صف ' + id; });
    var preview = names.join('، ') + (ids.length > 4 ? ' و' + Fmt.int(ids.length - 4) + ' غيرهم' : '');
    return UI.notice({
      tone: 'danger',
      title: Fmt.int(ids.length) + ' شخص بدون فئة معروفة — خارج التوزيع',
      text: preview + '. لن يحصلوا على أي مبلغ حتى تطابق فئتهم أو تعطيهم قيمة مخصصة. إن كان خروجهم مقصودًا فاستبعدهم رسميًا ليُسجَّل القرار.',
      actions: [
        btn('إظهارهم', { variant: 'primary', size: 'sm', icon: 'filter', onClick: function () { setFlagFilter('unresolved'); } }),
        btn('مطابقة الفئات', { size: 'sm', icon: 'layers', onClick: function () { if (Q.hasGrid()) Q.goto('map'); else Q.openSettings('tiers'); } }),
        btn('استبعادهم رسميًا', {
          size: 'sm', variant: 'danger', onClick: function () {
            var set = Object.create(null);
            ids.forEach(function (id) { set[id] = true; });
            var n = commit(ids, function () { return { excluded: true }; }, 'استبعاد ' + ids.length + ' بدون فئة', { full: true });
            UI.toast('تم استبعاد ' + Fmt.int(n) + ' شخص رسميًا', 'ok', { label: 'تراجع', onClick: Q.undo });
          }
        })
      ]
    });
  }
  Q.unresolvedBanner = unresolvedBanner;

  function warningsSummary() {
    var st = S();
    var groups = Object.create(null), order = [];
    ((st.result && st.result.warnings) || []).forEach(function (w) {
      if (w.code === 'UNRESOLVED_TIER') return;
      if (!groups[w.code]) { groups[w.code] = []; order.push(w.code); }
      groups[w.code].push(w);
    });
    if (!order.length) return null;
    var wc = (st.result && st.result.warningCounts) || {};
    function countOf(c) { return wc[c] != null ? wc[c] : groups[c].length; }
    var total = order.reduce(function (s, c) { return s + countOf(c); }, 0);
    var list = el('div', 'warn-groups');
    order.forEach(function (code) {
      var r = el('div', 'warn-group');
      r.appendChild(UI.badge(Fmt.int(countOf(code)), 'warn'));
      r.appendChild(el('b', null, Reports.WARN_KIND[code] || code));
      r.appendChild(el('span', 'muted', groups[code][0].message));
      list.appendChild(r);
    });
    var pids = Q.problemIds();
    var rowsAffected = pids.__size != null ? pids.__size : Object.keys(pids).length;
    var acts = [btn('كل التنبيهات', { size: 'sm', onClick: openWarningsModal })];
    if (rowsAffected) acts.unshift(btn('عرض ' + Fmt.int(rowsAffected) + ' صف', { size: 'sm', icon: 'filter', onClick: function () { setFlagFilter('problems'); } }));
    return UI.notice({ tone: 'warn', title: Fmt.int(total) + ' ملاحظة — الحساب تم، لكن راجعها', children: [list], actions: acts });
  }

  function openWarningsModal() {
    var st = S();
    var m = UI.modal({ title: 'كل التنبيهات', subtitle: 'الحساب مكتمل — هذه ملاحظات على البيانات المُدخلة', wide: true });
    var rows = Reports.warningRows(st.result);
    if (!rows.length) m.body.appendChild(UI.emptyState('لا يوجد أي تنبيه', 'كل الصفوف سليمة.', null, 'ok'));
    else {
      var tw = el('div', 'table-wrap h-md');
      var t = el('table', 'dt compact');
      var thead = el('thead'), tr = el('tr');
      ['النوع', 'الهدف', 'التفصيل', ''].forEach(function (h) { tr.appendChild(el('th', null, h)); });
      thead.appendChild(tr);
      t.appendChild(thead);
      var tb = el('tbody');
      rows.slice(0, 500).forEach(function (r) {
        var row = el('tr');
        row.appendChild(el('td', null, r.kind));
        row.appendChild(el('td', 'small muted', r.target));
        row.appendChild(el('td', 'small wrap-cell', r.message));
        var a = el('td', 'act-col');
        if (r.personId != null) a.appendChild(UI.iconBtn('eye', 'فتح الصف', function () { m.close(); Q.openPerson(r.personId); }, 'sm'));
        row.appendChild(a);
        tb.appendChild(row);
      });
      t.appendChild(tb);
      tw.appendChild(t);
      m.body.appendChild(tw);
    }
    m.foot.appendChild(el('div', 'small muted', Fmt.int(rows.length) + ' تنبيه' + (rows.length > 500 ? ' — يُعرض أول 500، والكل في ورقة التنبيهات بالتقرير' : '')));
    m.foot.appendChild(el('div', 'spacer'));
    m.foot.appendChild(btn('إغلاق', { variant: 'primary', onClick: m.close }));
  }
  Q.openWarningsModal = openWarningsModal;

  function paintReviewNotices() {
    var host = Q.hosts.reviewNotices;
    if (!host) return;
    clearNode(host);
    var st = S(), r = st.result;
    if (!r) return;
    if (!r.ok) { host.appendChild(Q.errorPanel(r)); return; }
    var ub = unresolvedBanner(), ws = warningsSummary();
    if (ub) host.appendChild(ub);
    if (ws) host.appendChild(ws);
    if (!ub && !ws) {
      var inside = r.insideCount != null ? r.insideCount : r.people.filter(function (p) { return p.weight > 0; }).length;
      host.appendChild(UI.notice({ tone: 'ok', compact: true, title: 'كل شيء سليم', text: Fmt.int(inside) + ' شخص داخل التوزيع، ولا توجد ملاحظات على البيانات.' }));
    }
  }
  Q.paintReviewNotices = paintReviewNotices;

  function filterBar(opts) {
    var st = S();
    var root = el('div', 'filter-bar');
    var bar = el('div', 'toolbar');
    var sw = el('div', 'search-wrap');
    sw.appendChild(Icons.svg('search', 'search-icon'));
    var timer = null;
    var si = UI.input({
      id: opts.searchId, value: st.filters.q, placeholder: opts.placeholder || 'ابحث بالاسم أو الرقم أو القسم أو الفئة…', ariaLabel: 'بحث',
      onInput: function (v) { st.filters.q = v; clr.hidden = !v; clearTimeout(timer); timer = setTimeout(changed, 120); }
    });
    si.type = 'search';
    si.setAttribute('enterkeyhint', 'search');
    si.addEventListener('keydown', function (e) { if (e.key === 'Escape' && si.value) { e.stopPropagation(); si.value = ''; st.filters.q = ''; clr.hidden = true; changed(); } });
    var clr = UI.iconBtn('x', 'مسح البحث', function () { st.filters.q = ''; si.value = ''; clr.hidden = true; changed(); si.focus(); }, 'sm');
    clr.classList.add('search-clear');
    clr.hidden = !st.filters.q;
    sw.appendChild(si);
    sw.appendChild(clr);
    sw.appendChild(el('kbd', 'kbd search-kbd', '/'));
    bar.appendChild(sw);
    var dds = {};
    [['dept', 'كل الأقسام', 'القسم'], ['tier', 'كل الفئات', 'الفئة'], ['pool', 'كل المجمعات', 'المجمع']].forEach(function (d) {
      var key = d[0];
      var dd = UI.dropdown({
        size: 'sm', highlightSet: true, ariaLabel: 'تصفية حسب ' + d[2], value: st.filters[key],
        options: function () {
          var rows = Q.rowsCache(), counts = Q.groupCounts(key);
          var vals = key === 'pool' ? Object.keys(st.pools) : Q.uniqueValues(key);
          var o = [{ value: '', label: d[1], count: rows.length }];
          vals.forEach(function (v) { o.push({ value: v, label: v, count: counts[v] || 0 }); });
          return o;
        },
        onChange: function (v) { st.filters[key] = v; changed(); }
      });
      dds[key] = dd;
      bar.appendChild(dd);
    });
    (opts.extra || []).forEach(function (x) { bar.appendChild(x); });
    bar.appendChild(el('div', 'spacer'));
    var count = el('div', 'toolbar-count');
    count.setAttribute('aria-live', 'polite');
    bar.appendChild(count);
    (opts.actions || []).forEach(function (x) { bar.appendChild(x); });
    root.appendChild(bar);
    var chips = el('div', 'chip-row chip-row-scroll filter-chips');
    root.appendChild(chips);

    function paintChips() {
      clearNode(chips);
      var fc = Q.flagCounts();
      Q.FLAGS.forEach(function (f) {
        var on = st.filters.flags.indexOf(f.key) !== -1;
        if (f.key === 'changed' && !st.baseline) return;
        var n = fc[f.key] || 0;
        if (!n && !on) return;
        var c = el('button', 'chip' + (f.tone ? ' chip-' + f.tone : ''));
        c.type = 'button';
        c.setAttribute('aria-pressed', on ? 'true' : 'false');
        c.appendChild(document.createTextNode(f.label));
        c.appendChild(el('span', 'chip-count', Fmt.int(n)));
        if (on) c.appendChild(Icons.svg('x', 'chip-x'));
        c.addEventListener('click', function () {
          var i = st.filters.flags.indexOf(f.key);
          if (i === -1) st.filters.flags.push(f.key); else st.filters.flags.splice(i, 1);
          changed();
        });
        chips.appendChild(c);
      });
      var active = Q.activeFilterList();
      if (active.length) {
        chips.appendChild(el('div', 'spacer'));
        chips.appendChild(btn('مسح التصفية (' + Fmt.int(active.length) + ')', {
          size: 'sm', variant: 'ghost', icon: 'reset',
          onClick: function () { st.filters = Q.emptyFilters(); si.value = ''; clr.hidden = true; changed(); }
        }));
      }
      chips.hidden = !chips.childNodes.length;
    }
    function setCount(shown, total) {
      clearNode(count);
      count.appendChild(el('b', 'num', Fmt.int(shown)));
      count.appendChild(document.createTextNode(shown === total ? ' صف' : ' من ' + Fmt.int(total)));
    }
    function changed() {
      st.page[opts.pageKey] = 1;
      paintChips();
      Object.keys(dds).forEach(function (k) { dds[k].setValue(st.filters[k]); });
      Q.scheduleSave();
      opts.onChange();
    }
    paintChips();
    return { el: root, refresh: paintChips, setCount: setCount, search: si };
  }
  Q.filterBar = filterBar;

  Q.pager = function (current, pages, total, per, onGo, onPer) {
    var wrap = el('nav', 'pager');
    wrap.setAttribute('aria-label', 'الصفحات');
    var from = total ? (current - 1) * per + 1 : 0, to = Math.min(total, current * per);
    wrap.appendChild(el('div', 'pager-range', Fmt.int(from) + '–' + Fmt.int(to) + ' من ' + Fmt.int(total)));
    var list = el('div', 'pager-list');
    function pb(label, page, disabled, cur, aria) {
      var b = el('button', 'pager-btn');
      b.type = 'button';
      if (typeof label === 'string') b.appendChild(document.createTextNode(label)); else b.appendChild(label);
      if (aria) b.setAttribute('aria-label', aria);
      if (disabled) b.disabled = true;
      if (cur) b.setAttribute('aria-current', 'page');
      if (!disabled && !cur) b.addEventListener('click', function () { onGo(page); });
      return b;
    }
    list.appendChild(pb(Icons.svg('chevronNext'), current - 1, current <= 1, false, 'السابقة'));
    var last = 0;
    for (var i = 1; i <= pages; i++) {
      if (!(i === 1 || i === pages || Math.abs(i - current) <= 1)) continue;
      if (i - last > 1) list.appendChild(el('span', 'pager-gap', '…'));
      list.appendChild(pb(Fmt.int(i), i, false, i === current));
      last = i;
    }
    list.appendChild(pb(Icons.svg('chevron'), current + 1, current >= pages, false, 'التالية'));
    wrap.appendChild(list);
    wrap.appendChild(UI.dropdown({
      size: 'sm', align: 'end', ariaLabel: 'عدد الصفوف في الصفحة', value: String(per),
      options: [25, 50, 100, 250, 500].map(function (n) { return { value: String(n), label: n + ' / صفحة' }; }),
      onChange: function (v) { onPer(Number(v)); }
    }));
    return wrap;
  };

  function screenAllocate() {
    var st = S();
    if (!st.result) Q.recompute();
    var wrap = el('div', 'screen-review');
    var addBtn = btn('صف جديد', { icon: 'plus', size: 'sm', onClick: addPerson });
    wrap.appendChild(Q.pageHead('راجع وصحّح', 'كل خلية قابلة للتعديل مباشرة، وكل تعديل يُعاد حسابه فورًا ويمكن التراجع عنه. اضغط على أيقونة العين لترى كيف حُسب نصيب أي شخص.', [Q.undoButtons(), addBtn], Q.stepEyebrow('allocate')));
    Q.hosts.reviewNotices = el('div', 'stack g3 mb4');
    wrap.appendChild(Q.hosts.reviewNotices);
    paintReviewNotices();
    Q.hosts.gridHost = el('div');
    wrap.appendChild(Q.hosts.gridHost);
    renderGrid();
    wrap.appendChild(Q.navFoot('amounts', 'dashboard', 'عرض اللوحة', function () { return Q.ok() ? true : 'صحّح الأخطاء أولًا'; }));
    return wrap;
  }
  Q.screens.allocate = screenAllocate;

  function renderGrid() {
    var host = Q.hosts.gridHost;
    if (!host) return;
    clearNode(host);
    var fb = filterBar({
      pageKey: 'grid', searchId: 'grid-search', onChange: renderGridBody,
      actions: [btn('تعديل جماعي', { icon: 'fill', size: 'sm', onClick: function () { openBulkEdit(); } })]
    });
    Q.hosts.gridFilter = fb;
    host.appendChild(fb.el);
    Q.hosts.selBar = el('div', 'sel-bar');
    Q.hosts.selBar.setAttribute('aria-live', 'polite');
    host.appendChild(Q.hosts.selBar);
    Q.hosts.gridSummary = el('div', 'live-summary');
    host.appendChild(Q.hosts.gridSummary);
    Q.hosts.gridBody = el('div', 'grid-body');
    host.appendChild(Q.hosts.gridBody);
    renderGridBody();
    renderGridSummary();
    paintSelBar();
  }
  Q.renderGrid = renderGrid;

  function renderGridSummary() {
    var host = Q.hosts.gridSummary;
    if (!host) return;
    var st = S(), r = st.result;
    clearNode(host);
    if (!r || !r.ok) { host.hidden = true; return; }
    host.hidden = false;
    var paid = r.paidCount;
    function item(label, node, tone) {
      var i = el('div', 'ls-item' + (tone ? ' ls-' + tone : ''));
      i.appendChild(el('span', 'ls-label', label));
      i.appendChild(node);
      return i;
    }
    host.appendChild(item('الصافي الموزّع', UI.moneyCell(r.totals.net, { currency: true })));
    host.appendChild(item('المستحقون', el('b', 'num', Fmt.int(paid))));
    host.appendChild(item('نصيب وحدة الوزن', el('b', 'num', Fmt.egp(r.kEffective, 4))));
    if (r.totals.retained > 0) host.appendChild(item('غير موزّع', UI.moneyCell(r.totals.retained), 'warn'));
    var prev = Q.__lastTotalNet;
    if (prev != null && prev !== r.totals.net) {
      var d = el('span', 'ls-delta');
      d.appendChild(el('span', null, 'آخر تعديل'));
      d.appendChild(UI.delta((r.totals.net - prev) / 100));
      host.appendChild(d);
    }
    Q.__lastTotalNet = r.totals.net;
  }

  function rowTone(r) {
    if (!r) return '';
    if (r.unresolvedTier) return 'is-orphan';
    if (r.excluded) return 'is-excluded';
    if (Q.problemIds()[r.id]) return 'is-warn';
    if (r.special) return 'is-special';
    return '';
  }
  Q.rowTone = rowTone;

  function netCell(td, r) {
    clearNode(td);
    if (!r) { td.appendChild(UI.dash()); return; }
    if (r.unresolvedTier) td.appendChild(UI.badge('بدون فئة', 'danger'));
    else if (r.excluded) td.appendChild(UI.badge('مستبعد', 'neutral'));
    else {
      td.appendChild(UI.moneyCell(r.netPiastres));
      if (r.capped) td.appendChild(UI.attachTip(UI.badge('حد', 'info'), 'بلغ الحد الأقصى للصافي'));
    }
  }
  function netKey(r) { return r ? (r.unresolvedTier ? 'u' : (r.excluded ? 'x' : String(r.netPiastres))) : ''; }

  function selectedIds() {
    var st = S(), sel = st.selection, keys = Object.keys(sel);
    if (!keys.length) return [];
    if (keys.length * 4 < st.people.length) {
      var pos = Q.idPos(), out = [];
      keys.forEach(function (k) { var i = pos.get(k); if (i === undefined) i = pos.get(Number(k)); if (i !== undefined) out.push(i); });
      out.sort(function (a, b) { return a - b; });
      return out.map(function (i) { return st.people[i].id; });
    }
    return st.people.filter(function (p) { return sel[p.id]; }).map(function (p) { return p.id; });
  }
  Q.selectedIds = selectedIds;
  function toggleSel(id, v) { var st = S(); if (v) st.selection[id] = true; else delete st.selection[id]; paintSelBar(); paintHeadCheck(); }
  function paintHeadCheck() {
    var cb = Q.hosts.headCheck;
    if (!cb) return;
    var st = S(), ids = st.__gridIds || [], n = 0, sel = st.selection, keys = Object.keys(sel).length;
    if (keys) for (var i = 0; i < ids.length; i++) if (sel[ids[i]]) n++;
    cb.checked = ids.length > 0 && n === ids.length;
    cb.indeterminate = n > 0 && n < ids.length;
  }
  function paintSelBar() {
    var host = Q.hosts.selBar;
    if (!host) return;
    clearNode(host);
    var ids = selectedIds();
    host.classList.toggle('is-open', ids.length > 0);
    if (!ids.length) return;
    host.appendChild(el('b', null, 'محدد ' + Fmt.int(ids.length)));
    host.appendChild(btn('تعديل جماعي', { size: 'sm', icon: 'fill', onClick: function () { openBulkEdit(ids); } }));
    host.appendChild(btn('استبعاد', { size: 'sm', icon: 'lock', onClick: function () { commit(ids, function () { return { excluded: true }; }, 'استبعاد ' + ids.length + ' صف', { full: true }); } }));
    host.appendChild(btn('إرجاع للتوزيع', { size: 'sm', onClick: function () { commit(ids, function () { return { excluded: false }; }, 'إرجاع ' + ids.length + ' صف', { full: true }); } }));
    host.appendChild(btn('حذف', { size: 'sm', variant: 'danger', icon: 'trash', onClick: function () { deletePeople(ids); } }));
    host.appendChild(el('div', 'spacer'));
    host.appendChild(btn('إلغاء التحديد', { size: 'sm', variant: 'ghost', onClick: function () { S().selection = {}; renderGridBody(); paintSelBar(); } }));
  }

  function deletePeople(ids) {
    var st = S(), set = new Set(ids);
    function doIt() {
      var snap = Q.snapshot();
      st.people = st.people.filter(function (p) { return !set.has(p.id); });
      Q.pushUndo('حذف ' + ids.length + ' صف', snap);
      st.selection = {};
      Q.recompute();
      renderGrid();
      paintReviewNotices();
      Q.renderStepper();
      UI.toast('تم حذف ' + Fmt.int(ids.length) + ' صف', 'ok', { label: 'تراجع', onClick: Q.undo });
    }
    if (ids.length < 5 || !st.ui.confirmDanger) { doIt(); return; }
    UI.confirmModal({ title: 'حذف ' + Fmt.int(ids.length) + ' صف؟', message: 'ستُحذف الصفوف المحددة من الحساب. يمكنك التراجع فورًا.', confirmLabel: 'حذف', danger: true, onConfirm: doIt });
  }

  function addPerson() {
    var st = S();
    var id = Q.nextPersonId(), snap = Q.snapshot();
    var p = Model.person({ id: id, tier: st.filters.tier || '', dept: st.filters.dept || '' }, id);
    st.people = st.people.concat([p]);
    Q.pushUndo('إضافة صف', snap);
    st.filters = Q.emptyFilters();
    st.sort = { key: null, dir: null };
    Q.recompute();
    var per = st.ui.rowsPerPage;
    st.page.grid = Math.max(1, Math.ceil(st.people.length / per));
    if (st.screen !== 'allocate') Q.goto('allocate');
    else { renderGrid(); paintReviewNotices(); }
    setTimeout(function () {
      var n = document.getElementById('g-' + id + '-name');
      if (n) { n.scrollIntoView({ block: 'center' }); n.focus(); }
    }, 60);
  }
  Q.addPerson = addPerson;

  function renderGridBody() {
    var body = Q.hosts.gridBody;
    if (!body) return;
    var st = S();
    var prevWrap = body.querySelector('.table-wrap');
    var sl = prevWrap ? prevWrap.scrollLeft : 0;
    var snap = Q.captureFocus();
    clearNode(body);
    var view = Q.viewRows(), ids;
    if (st.__gridIdsFor === view && st.__gridIds) ids = st.__gridIds;
    else { ids = new Array(view.length); for (var vi = 0; vi < view.length; vi++) ids[vi] = view[vi].id; st.__gridIds = ids; st.__gridIdsFor = view; }
    if (Q.hosts.gridFilter) Q.hosts.gridFilter.setCount(ids.length, st.people.length);
    if (!ids.length) {
      var filtered = Q.activeFilterList().length > 0;
      body.appendChild(el('div', 'card', UI.emptyState(
        filtered ? 'لا صفوف مطابقة' : 'لا يوجد أشخاص',
        filtered ? 'غيّر البحث أو امسح التصفية.' : 'أضف صفًا أو ارفع ملفًا.',
        filtered ? btn('مسح التصفية', { onClick: function () { st.filters = Q.emptyFilters(); renderGrid(); } }) : btn('صف جديد', { icon: 'plus', variant: 'primary', onClick: addPerson }),
        filtered ? 'search' : 'people')));
      paintHeadCheck();
      return;
    }
    var per = st.ui.rowsPerPage;
    var pages = Math.max(1, Math.ceil(ids.length / per));
    if (st.page.grid > pages) st.page.grid = pages;
    var from = (st.page.grid - 1) * per;
    var slice = ids.slice(from, from + per);
    var pm = Q.personById(), rm = Q.rowById();
    var tierNames = Object.keys(st.tiers), poolNames = Object.keys(st.pools);

    var tw = el('div', 'table-wrap h-lg');
    var t = el('table', 'dt dt-edit' + (st.ui.density === 'compact' ? ' compact' : ''));
    var thead = el('thead'), htr = el('tr');
    var hs = el('th', 'sel-col');
    var hcb = UI.checkbox({ size: 'sm', ariaLabel: 'تحديد كل الصفوف الظاهرة (' + ids.length + ')', onChange: function (v) {
      ids.forEach(function (id) { if (v) st.selection[id] = true; else delete st.selection[id]; });
      Array.prototype.forEach.call(tb.querySelectorAll('.sel-col input'), function (c) { c.checked = v; c.closest('tr').classList.toggle('is-selected', v); });
      paintSelBar();
    } });
    Q.hosts.headCheck = hcb.input;
    hs.appendChild(hcb);
    htr.appendChild(hs);
    htr.appendChild(el('th', 'id-col', '#'));
    GRID_FIELDS.forEach(function (f) {
      var th = el('th', f.numeric ? 'num-col' : null, f.label);
      th.style.minWidth = f.width + 'px';
      htr.appendChild(th);
    });
    htr.appendChild(el('th', 'num-col net-col', 'الصافي'));
    htr.appendChild(el('th', 'act-col', el('span', 'sr-only', 'تفاصيل')));
    thead.appendChild(htr);
    t.appendChild(thead);
    var tb = el('tbody');
    slice.forEach(function (id) {
      var p = pm[id];
      if (!p) return;
      var r = rm[id];
      var tr = el('tr');
      tr.dataset.id = String(id);
      var tone = rowTone(r);
      if (tone) tr.classList.add(tone);
      if (st.selection[id]) tr.classList.add('is-selected');
      var sel = el('td', 'sel-col');
      sel.appendChild(UI.checkbox({ size: 'sm', checked: !!st.selection[id], ariaLabel: 'تحديد ' + (p.name || 'صف ' + id), onChange: function (v) { toggleSel(id, v); tr.classList.toggle('is-selected', v); } }));
      tr.appendChild(sel);
      tr.appendChild(el('td', 'id-col', String(id)));
      GRID_FIELDS.forEach(function (f) {
        var td = el('td', f.numeric ? 'num-col' : null);
        td.dataset.key = f.key;
        td.appendChild(gridCell(id, f, tierNames, poolNames));
        tr.appendChild(td);
      });
      var net = el('td', 'num-col net-col');
      netCell(net, r);
      net.dataset.v = netKey(r);
      tr.appendChild(net);
      var act = el('td', 'act-col');
      act.appendChild(UI.iconBtn('eye', 'كيف حُسب؟', function () { Q.openPerson(id); }, 'sm'));
      tr.appendChild(act);
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    tw.appendChild(t);
    body.appendChild(tw);
    tw.scrollLeft = sl;
    if (pages > 1 || ids.length > 25) body.appendChild(Q.pager(st.page.grid, pages, ids.length, per, function (pg) {
      st.page.grid = pg;
      renderGridBody();
      var w = body.querySelector('.table-wrap');
      if (w) w.scrollTop = 0;
      body.scrollIntoView({ block: 'start', behavior: UI.reduceMotion() ? 'auto' : 'smooth' });
    }, function (n) { st.ui.rowsPerPage = n; st.page.grid = 1; Q.scheduleSave(); renderGridBody(); }));
    paintHeadCheck();
    Q.restoreFocus(snap);
  }
  Q.renderGridBody = renderGridBody;

  function patchVisibleRows() {
    var body = Q.hosts.gridBody;
    if (!body) return;
    var rm = Q.rowById();
    Array.prototype.forEach.call(body.querySelectorAll('tbody tr[data-id]'), function (tr) {
      var r = rm[tr.dataset.id];
      tr.classList.remove('is-orphan', 'is-excluded', 'is-special', 'is-warn');
      var tone = rowTone(r);
      if (tone) tr.classList.add(tone);
      var td = tr.querySelector('.net-col');
      var k = netKey(r);
      if (td && td.dataset.v !== k) {
        netCell(td, r);
        td.dataset.v = k;
        td.classList.remove('flash');
        void td.offsetWidth;
        td.classList.add('flash');
      }
      var tdd = tr.querySelector('td[data-key="tier"] .dd-trigger');
      if (tdd) tdd.classList.toggle('is-invalid', !!(r && r.unresolvedTier));
    });
  }

  function moveFocus(from, key, dir) {
    var all = Array.prototype.slice.call(Q.hosts.gridBody.querySelectorAll('td[data-key="' + key + '"] input'));
    var n = all[all.indexOf(from) + dir];
    if (n) { n.focus(); if (n.select) n.select(); }
  }

  function gridCell(id, f, tierNames, poolNames) {
    var st = S(), p = Q.personById()[id];
    var idBase = 'g-' + id + '-' + f.key;
    if (f.type === 'bool') {
      return UI.checkbox({ id: idBase, size: 'sm', checked: !!p.excluded, ariaLabel: 'استبعاد ' + nameOf(id), onChange: function (v) { commit([id], function () { return { excluded: v }; }, (v ? 'استبعاد ' : 'إرجاع ') + nameOf(id)); } });
    }
    if (f.type === 'tier' || f.type === 'pool') return choiceControl(id, f.type === 'tier', idBase, 'sm', function () {});
    var shown = displayValue(p, f);
    var inp = UI.input({
      id: idBase, value: shown, size: 'sm', numeric: f.numeric, ariaLabel: f.label + ' لـ ' + nameOf(id),
      placeholder: f.key === 'daysWorked' ? String(st.periodDays) : (f.key === 'manualFactor' ? '1' : (f.numeric ? '—' : ''))
    });
    if (f.type === 'text') inp.maxLength = 200;
    inp.addEventListener('change', function () {
      var res = parseCell(f, inp.value);
      if (!res.ok) {
        inp.classList.add('is-invalid');
        UI.toast(res.msg, 'warn');
        inp.value = shown;
        setTimeout(function () { inp.classList.remove('is-invalid'); }, 1800);
        return;
      }
      var cur = Q.personById()[id];
      if (!cur || cur[f.key] === res.value) { inp.value = cur ? displayValue(cur, f) : ''; return; }
      commit([id], function () { var o = {}; o[f.key] = res.value; return o; }, 'تعديل ' + f.label + ' لـ ' + nameOf(id));
      shown = displayValue(Q.personById()[id], f);
      inp.value = shown;
    });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); inp.dispatchEvent(new Event('change')); moveFocus(inp, f.key, e.shiftKey ? -1 : 1); return; }
      if (e.key === 'Escape') { inp.value = shown; inp.blur(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); moveFocus(inp, f.key, e.key === 'ArrowDown' ? 1 : -1); }
    });
    return inp;
  }

  function choiceControl(id, isTier, idBase, size, after) {
    var st = S(), p = Q.personById()[id];
    var names = isTier ? Object.keys(st.tiers) : Object.keys(st.pools);
    var cur = isTier ? (p.tier || '') : (p.pinnedPool || '');
    var unknown = !!cur && names.indexOf(cur) === -1;
    var opts = [{ value: '', label: isTier ? '— بدون فئة —' : '— تلقائي —' }];
    names.forEach(function (n) { opts.push({ value: n, label: n, hint: isTier ? Fmt.plain(st.tiers[n]) : null }); });
    if (unknown) { opts.push({ separator: true }); opts.push({ value: cur, label: cur + ' (غير معرّفة)', tone: 'danger' }); }
    if (isTier) { opts.push({ separator: true }); opts.push({ value: '__new__', label: 'فئة جديدة…', icon: 'plus' }); }
    var dd = UI.dropdown({
      id: idBase, size: size, block: true, options: opts, value: cur, ariaLabel: (isTier ? 'الفئة' : 'التثبيت على مجمع') + ' لـ ' + nameOf(id),
      onChange: function (v) {
        if (v === '__new__') {
          dd.setValue(cur);
          Q.promptNewTier(unknown ? cur : '', function (n) { commit([id], function () { return { tier: n }; }, 'تعيين فئة ' + n, { full: true }); after(); });
          return;
        }
        var patch = isTier ? { tier: v } : { pinnedPool: v || null };
        commit([id], function () { return patch; }, (isTier ? 'تعديل الفئة' : 'تعديل التثبيت') + ' لـ ' + nameOf(id));
        after();
      }
    });
    if (unknown || (isTier && !cur && st.options.weighting !== 'equal' && p.overrideValue == null)) dd.trigger.classList.add('is-invalid');
    return dd;
  }
  Q.choiceControl = choiceControl;

  var BULK_FIELDS = [
    { value: 'daysWorked', label: 'أيام العمل', kind: 'num', f: GRID_FIELDS[4] },
    { value: 'penaltyRate', label: 'نسبة الجزاء (%)', kind: 'num', f: GRID_FIELDS[5] },
    { value: 'manualFactor', label: 'المعامل اليدوي', kind: 'num', f: GRID_FIELDS[6] },
    { value: 'overrideValue', label: 'قيمة مخصصة', kind: 'num', f: GRID_FIELDS[7] },
    { value: 'tier', label: 'الفئة', kind: 'tier' },
    { value: 'pinnedPool', label: 'المجمع المثبّت', kind: 'pool' },
    { value: 'dept', label: 'القسم', kind: 'text', f: GRID_FIELDS[2] },
    { value: 'excluded', label: 'الاستبعاد', kind: 'bool' },
    { value: 'notes', label: 'ملاحظات', kind: 'text', f: GRID_FIELDS[10] }
  ];

  function openBulkEdit(forIds) {
    var st = S();
    var ids = forIds && forIds.length ? forIds : (selectedIds().length ? selectedIds() : (st.__gridIds || []).slice());
    var scopeLabel = forIds && forIds.length || selectedIds().length ? 'الصفوف المحددة' : 'الصفوف الظاهرة بالتصفية الحالية';
    var m = UI.modal({ title: 'تعديل جماعي', subtitle: 'على ' + Fmt.int(ids.length) + ' صف — ' + scopeLabel });
    var def = BULK_FIELDS[0], value = '', mode = 'set', onlyEmpty = false;
    var body = el('div', 'stack g4');
    body.appendChild(UI.field('الحقل', UI.dropdown({ block: true, options: BULK_FIELDS, value: def.value, onChange: function (v) { def = BULK_FIELDS.filter(function (x) { return x.value === v; })[0]; value = ''; mode = 'set'; paint(); } })));
    var host = el('div', 'stack g4');
    body.appendChild(host);
    var preview = el('div', 'notice notice-accent notice-compact');
    preview.setAttribute('aria-live', 'polite');
    body.appendChild(preview);
    m.body.appendChild(body);
    function paint() {
      clearNode(host);
      if (def.kind === 'tier' || def.kind === 'pool') {
        var names = Object.keys(def.kind === 'tier' ? st.tiers : st.pools);
        var o = [{ value: '', label: def.kind === 'tier' ? '— بدون فئة —' : '— إلغاء التثبيت —' }].concat(names.map(function (n) { return { value: n, label: n }; }));
        host.appendChild(UI.field('القيمة الجديدة', UI.dropdown({ block: true, options: o, value: value, onChange: function (v) { value = v; refresh(); } })));
      } else if (def.kind === 'bool') {
        if (value === '') value = '1';
        host.appendChild(UI.field('الإجراء', UI.segmented({ block: true, value: value, options: [{ value: '1', label: 'استبعاد' }, { value: '0', label: 'إرجاع للتوزيع' }], onChange: function (v) { value = v; refresh(); } })));
      } else {
        if (def.kind === 'num' && def.value !== 'daysWorked' && def.value !== 'penaltyRate') {
          host.appendChild(UI.field('طريقة التطبيق', UI.segmented({ block: true, value: mode, options: [{ value: 'set', label: 'تعيين' }, { value: 'mul', label: 'ضرب في' }, { value: 'clear', label: 'مسح' }], onChange: function (v) { mode = v; paint(); } })));
        } else if (def.kind === 'num') {
          host.appendChild(UI.field('طريقة التطبيق', UI.segmented({ block: true, value: mode, options: [{ value: 'set', label: 'تعيين' }, { value: 'clear', label: 'مسح (افتراضي)' }], onChange: function (v) { mode = v; paint(); } })));
        }
        if (mode !== 'clear') {
          var inp = UI.input({ value: value, numeric: def.kind === 'num', placeholder: def.value === 'daysWorked' ? String(st.periodDays) : '', ariaLabel: 'القيمة الجديدة', onInput: function (v) { value = v; refresh(); } });
          host.appendChild(UI.field(mode === 'mul' ? 'المعامل' : 'القيمة الجديدة', inp, def.value === 'penaltyRate' ? 'اكتب 10 لتعني 10%' : null));
          setTimeout(function () { inp.focus(); }, 20);
        }
        if (mode === 'set') host.appendChild(UI.checkbox({ label: 'الخلايا الفارغة فقط', hint: 'لا تستبدل أي قيمة موجودة', checked: onlyEmpty, onChange: function (v) { onlyEmpty = v; refresh(); } }));
      }
      refresh();
    }
    function build() {
      if (def.kind === 'bool') return { ok: true, fn: function (p) { return { excluded: value === '1' }; } };
      if (def.kind === 'tier') return { ok: true, fn: function () { return { tier: value }; } };
      if (def.kind === 'pool') return { ok: true, fn: function () { return { pinnedPool: value || null }; } };
      if (mode === 'clear') return { ok: true, fn: function () { var o = {}; o[def.value] = def.kind === 'text' ? '' : null; return o; } };
      if (mode === 'mul') {
        var k = Fmt.parseNumber(value);
        if (k == null || k < 0) return { ok: false, msg: 'أدخل معاملًا رقميًا' };
        return { ok: true, fn: function (p) { var base = p[def.value] == null ? (def.value === 'manualFactor' ? 1 : null) : p[def.value]; if (base == null) return null; var o = {}; o[def.value] = Math.round(base * k * 10000) / 10000; return o; } };
      }
      var res = parseCell(def.f, value);
      if (!res.ok) return res;
      if (def.kind === 'num' && res.value == null) return { ok: false, msg: 'أدخل قيمة' };
      return { ok: true, fn: function (p) { if (onlyEmpty && !(p[def.value] == null || p[def.value] === '')) return null; var o = {}; o[def.value] = res.value; return o; } };
    }
    var applyBtn;
    function refresh() {
      clearNode(preview);
      preview.appendChild(Icons.svg('info', 'notice-icon'));
      var b = build(), pm = Q.personById(), n = 0;
      if (b.ok) ids.forEach(function (id) { var p = pm[id]; if (!p) return; var patch = b.fn(p); if (patch && Object.keys(patch).some(function (k) { return p[k] !== patch[k]; })) n++; });
      preview.appendChild(el('div', 'notice-body', b.ok ? ('سيتغيّر ' + Fmt.int(n) + ' صف — خطوة واحدة في سجل التراجع') : b.msg));
      if (applyBtn) applyBtn.disabled = !b.ok || !n;
    }
    function apply() {
      var b = build();
      if (!b.ok) { UI.toast(b.msg, 'warn'); return; }
      var n = commit(ids, b.fn, 'تعديل جماعي: ' + def.label + ' (' + ids.length + ')', { full: true });
      m.close();
      UI.toast(n ? 'تم تعديل ' + Fmt.int(n) + ' صف' : 'لم يتغيّر أي صف', n ? 'ok' : 'warn', n ? { label: 'تراجع', onClick: Q.undo } : null);
    }
    m.foot.appendChild(el('div', 'spacer'));
    m.foot.appendChild(btn('إلغاء', { variant: 'ghost', onClick: m.close }));
    applyBtn = btn('تطبيق', { variant: 'primary', icon: 'check', onClick: apply });
    m.foot.appendChild(applyBtn);
    paint();
  }
  Q.openBulkEdit = openBulkEdit;

  Q.openPerson = function (id) {
    var st = S();
    var view = Q.viewRows(), order = new Array(view.length);
    for (var oi = 0; oi < view.length; oi++) order[oi] = view[oi].id;
    var where = new Map();
    order.forEach(function (x, i) { where.set(x, i); });
    if (!where.has(id)) { order = st.people.map(function (p) { return p.id; }); where = new Map(); order.forEach(function (x, i) { where.set(x, i); }); }
    order.indexOf = function (x) { var v = where.get(x); return v === undefined ? -1 : v; };
    var m = UI.modal({ title: nameOf(id), cls: 'sheet', onClose: function () { Q.hosts.sheetRepaint = null; } });
    var titleEl = m.box.querySelector('.modal-title');
    var subEl = el('div', 'modal-sub');
    titleEl.parentNode.appendChild(subEl);
    var prevB = btn('السابق', { variant: 'ghost', size: 'sm', icon: 'chevronNext', onClick: function () { go(-1); } });
    var nextB = btn('التالي', { variant: 'ghost', size: 'sm', onClick: function () { go(1); } });
    nextB.appendChild(Icons.svg('chevron'));
    var pos = el('span', 'small muted num');
    m.foot.appendChild(prevB);
    m.foot.appendChild(pos);
    m.foot.appendChild(nextB);
    m.foot.appendChild(el('div', 'spacer'));
    m.foot.appendChild(btn('إغلاق', { variant: 'primary', onClick: m.close }));
    function go(d) {
      var i = order.indexOf(id);
      var n = order[i + d];
      if (n == null) return;
      id = n;
      paint();
      m.body.scrollTop = 0;
    }
    m.box.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(-1); }
    });
    function paint() {
      var p = Q.personById()[id];
      if (!p) { m.close(); return; }
      var i = order.indexOf(id);
      prevB.disabled = i <= 0;
      nextB.disabled = i < 0 || i >= order.length - 1;
      pos.textContent = i >= 0 ? Fmt.int(i + 1) + ' / ' + Fmt.int(order.length) : '';
      titleEl.textContent = p.name || 'صف ' + p.id;
      subEl.textContent = ['#' + p.id, p.code, p.job, p.dept].filter(Boolean).join(' · ');
      clearNode(m.body);
      m.body.appendChild(personBody(p, paint));
    }
    Q.hosts.sheetRepaint = paint;
    paint();
  };

  function personBody(p, repaint) {
    var st = S(), res = st.result, r = Q.rowById()[p.id], er = Q.resultIndex()[p.id];
    var wrap = el('div', 'stack g5');
    var hero = el('div', 'sheet-hero');
    var status = el('div', 'chip-row');
    if (r && r.unresolvedTier) status.appendChild(UI.badge('بدون فئة — خارج التوزيع', 'danger', 'warn'));
    else if (p.excluded) status.appendChild(UI.badge('مستبعد بقرار', 'neutral', 'lock'));
    else if (r && r.netPiastres > 0) status.appendChild(UI.badge('مستحق', 'ok', 'ok'));
    if (p.tier) status.appendChild(UI.badge(p.tier, 'accent'));
    if (r && r.pool) status.appendChild(UI.badge(r.pool, 'info'));
    if (p.pinnedPool) status.appendChild(UI.badge('مثبّت', 'info', 'pin'));
    if (r && r.capped) status.appendChild(UI.badge('بلغ الحد الأقصى', 'warn', 'cap'));
    hero.appendChild(status);
    if (res && res.ok && r) {
      var big = el('div', 'sheet-money');
      big.appendChild(el('span', 'tiny muted', 'الصافي المستحق'));
      big.appendChild(UI.moneyCell(r.netPiastres, { size: 'xl', currency: true }));
      hero.appendChild(big);
      var trio = el('div', 'sheet-trio');
      [['الإجمالي', r.grossPiastres], ['الخصم', r.taxPiastres], ['الصافي المثالي', Math.round(r.ideal * 100)]].forEach(function (x) {
        var c = el('div', 'stack');
        c.appendChild(el('span', 'tiny muted', x[0]));
        c.appendChild(UI.moneyCell(x[1]));
        trio.appendChild(c);
      });
      var dc = el('div', 'stack');
      dc.appendChild(el('span', 'tiny muted', 'الفرق'));
      dc.appendChild(UI.delta(r.drift));
      trio.appendChild(dc);
      hero.appendChild(trio);
      var bd = Q.baselineDiff();
      if (bd && bd.byId[p.id] != null && bd.byId[p.id] !== 0) {
        var bn = el('div', 'small muted');
        bn.appendChild(document.createTextNode('مقارنة بالمرجع: '));
        bn.appendChild(UI.delta(bd.byId[p.id] / 100));
        hero.appendChild(bn);
      }
    } else if (res && !res.ok) hero.appendChild(UI.notice({ tone: 'danger', compact: true, text: 'الحساب متوقف بسبب خطأ — صحّحه لترى النصيب.' }));
    wrap.appendChild(hero);

    if (er && res && res.ok) {
      var b = er.breakdown, o = res.options;
      var sec = el('section', 'explain');
      sec.appendChild(el('h3', 'section-label', 'كيف حُسب النصيب'));
      var steps = el('ol', 'explain-steps');
      function step(label, detail, value, op, tone) {
        var li = el('li', 'x-step' + (tone ? ' is-' + tone : ''));
        li.appendChild(el('span', 'x-op', op || ''));
        var tx = el('div', 'x-text');
        tx.appendChild(el('span', 'x-label', label));
        if (detail) tx.appendChild(el('span', 'x-detail', detail));
        li.appendChild(tx);
        li.appendChild(el('span', 'x-val num', value));
        steps.appendChild(li);
      }
      if (b.excluded) step('مستبعد بقرار صريح', 'لا يدخل التوزيع', '0', '', 'muted');
      else if (b.unresolved) step('لا توجد فئة معروفة', p.tier ? 'الفئة «' + p.tier + '» غير معرّفة' : 'خانة الفئة فارغة', '—', '', 'danger');
      else {
        step('الأساس', b.baseSource === 'equal' ? 'وزن متساوٍ للجميع' : (b.baseSource === 'override' ? 'قيمة مخصصة لهذا الشخص' : 'قيمة الفئة «' + p.tier + '»'), Fmt.plain(b.base, 4), '');
        step('الحضور', o.attendance === 'ignore' ? 'الأيام لا تؤثر (حسب القواعد)' : Fmt.plain(b.days, 2) + ' من ' + st.periodDays + ' يوم', Fmt.pct(b.attendance, 1), '×');
        if (b.penalty > 0) step('الجزاء', 'خصم ' + Fmt.pctExact(b.penalty) + ' من الوزن', Fmt.pct(1 - b.penalty, 1), '×');
        if (b.manual !== 1) step('المعامل اليدوي', null, Fmt.plain(b.manual, 4), '×');
        step('الوزن', null, Fmt.egp(b.weight, 4), '=', 'strong');
        step('نصيب وحدة الوزن', 'صافٍ لكل وحدة وزن', Fmt.egp(res.kEffective, 4), '×');
        step('الصافي المثالي', 'قبل تقريب القروش', Fmt.egp(r.ideal), '=', 'strong');
        var note = [];
        if (r.capped) note.push('بلغ الحد الأقصى ' + Fmt.egp(o.capNet) + ' ج.م');
        if (o.roundingStep > 1) note.push('التقريب لأقرب ' + Fmt.egp(o.roundingStep / 100) + ' ج.م على ' + (o.roundingTarget === 'net' ? 'الصافي' : 'الإجمالي'));
        if (o.allocation === 'assign') note.push('من مجمع «' + (r.pool || '—') + '»' + (p.pinnedPool ? ' (مثبّت)' : ' (اختاره المحرك للموازنة)'));
        step('الصافي الفعلي', note.join(' · ') || 'بعد توزيع القروش بطريقة أكبر باقٍ', Fmt.egp(r.net), '=', 'accent');
      }
      sec.appendChild(steps);
      if (r.parts && r.parts.length > 1) {
        var pt = el('table', 'dt compact mt3');
        var th = el('thead'), htr = el('tr');
        ['المجمع', 'الإجمالي', 'الخصم', 'الصافي'].forEach(function (h, i) { htr.appendChild(el('th', i ? 'num-col' : null, h)); });
        th.appendChild(htr);
        pt.appendChild(th);
        var tb = el('tbody');
        r.parts.forEach(function (x) {
          var tr = el('tr');
          tr.appendChild(el('td', null, x.pool));
          [x.grossPiastres, x.taxPiastres, x.netPiastres].forEach(function (v) { tr.appendChild(el('td', 'num-col', UI.moneyCell(v))); });
          tb.appendChild(tr);
        });
        pt.appendChild(tb);
        sec.appendChild(el('div', 'table-wrap', pt));
      }
      wrap.appendChild(sec);
    }

    var form = el('section', 'sheet-form');
    form.appendChild(el('h3', 'section-label', 'تعديل'));
    var g = el('div', 'grid-2');
    function textField(f) {
      var inp = UI.input({ value: displayValue(p, f), numeric: f.numeric, ariaLabel: f.label, placeholder: f.key === 'daysWorked' ? String(st.periodDays) : (f.key === 'manualFactor' ? '1' : ''), suffix: f.type === 'pct' ? '%' : (f.key === 'overrideValue' ? 'وزن' : null) });
      var real = inp.input || inp;
      real.addEventListener('change', function () {
        var res2 = parseCell(f, real.value);
        if (!res2.ok) { UI.toast(res2.msg, 'warn'); real.value = displayValue(Q.personById()[p.id], f); return; }
        if (Q.personById()[p.id][f.key] === res2.value) return;
        commit([p.id], function () { var o = {}; o[f.key] = res2.value; return o; }, 'تعديل ' + f.label + ' لـ ' + nameOf(p.id), { full: true });
      });
      real.addEventListener('keydown', function (e) { if (e.key === 'Enter') real.blur(); });
      return UI.field(f.label, inp);
    }
    var F = {};
    GRID_FIELDS.forEach(function (f) { F[f.key] = f; });
    g.appendChild(textField(F.name));
    g.appendChild(textField(F.code));
    g.appendChild(textField({ key: 'job', label: 'الوظيفة', type: 'text' }));
    g.appendChild(textField(F.dept));
    g.appendChild(UI.field('الفئة', choiceControl(p.id, true, 'ps-tier', null, function () {})));
    g.appendChild(UI.field('مثبّت على مجمع', choiceControl(p.id, false, 'ps-pool', null, function () {})));
    g.appendChild(textField(F.daysWorked));
    g.appendChild(textField(F.penaltyRate));
    g.appendChild(textField(F.manualFactor));
    g.appendChild(textField(F.overrideValue));
    form.appendChild(g);
    var notesF = textField(F.notes);
    notesF.classList.add('mt3');
    form.appendChild(notesF);
    var tg = UI.toggle({ checked: !!p.excluded, label: 'مستبعد من التوزيع', onChange: function (v) { commit([p.id], function () { return { excluded: v }; }, (v ? 'استبعاد ' : 'إرجاع ') + nameOf(p.id), { full: true }); } });
    tg.classList.add('mt3');
    form.appendChild(tg);
    var dangerRow = el('div', 'row g2 mt4');
    dangerRow.appendChild(btn('حذف هذا الصف', { size: 'sm', variant: 'danger', icon: 'trash', onClick: function () {
      var id = p.id;
      var snap = Q.snapshot();
      st.people = st.people.filter(function (x) { return x.id !== id; });
      Q.pushUndo('حذف ' + (p.name || 'صف ' + id), snap);
      delete st.selection[id];
      Q.recompute();
      UI.closeAllModals();
      if (Q.hosts.gridBody) { renderGridBody(); renderGridSummary(); paintReviewNotices(); } else Q.renderScreen();
      UI.toast('تم حذف الصف', 'ok', { label: 'تراجع', onClick: Q.undo });
    } }));
    form.appendChild(dangerRow);
    wrap.appendChild(form);
    return wrap;
  }
})(Q);
