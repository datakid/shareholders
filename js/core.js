var APP_VERSION = '4.0.0';
var APP_NAME = 'قِسمة';
var APP_NAME_LATIN = 'Qisma';
var APP_TAGLINE = 'قسمة عادلة، محسوبة بالقرش';

var Fmt = (function () {
  'use strict';
  var NUM = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var NUM0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  var NUM4 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

  function safe(v) { return (v == null || !isFinite(v)) ? 0 : v; }
  function egp(value, digits) {
    var v = safe(value);
    if (digits === 0) return NUM0.format(v);
    if (digits === 4) return NUM4.format(v);
    return NUM.format(v);
  }
  function piastres(pi) { return egp(safe(pi) / 100, 2); }
  function int(value) { return NUM0.format(safe(value)); }
  function pct(value, digits) {
    if (value == null || !isFinite(value)) return '—';
    return (value * 100).toFixed(digits == null ? 2 : digits) + '%';
  }
  function trim0(s) { return s.indexOf('.') === -1 ? s : s.replace(/0+$/, '').replace(/\.$/, ''); }
  function pctExact(value) {
    if (value == null || !isFinite(value)) return '—';
    return trim0((value * 100).toFixed(6)) + '%';
  }
  function pctValue(value) {
    if (value == null || !isFinite(value)) return '';
    return trim0((value * 100).toFixed(6));
  }
  function plain(value, maxDigits) {
    if (value == null || !isFinite(value)) return '';
    return trim0(Number(value).toFixed(maxDigits == null ? 4 : maxDigits));
  }
  function groupDigits(value) {
    var n = typeof value === 'number' ? value : parseNumber(value);
    if (n == null || !isFinite(n)) return '';
    var neg = n < 0, fixed = Math.abs(n).toFixed(2);
    if (fixed.slice(-3) === '.00') fixed = fixed.slice(0, -3);
    var parts = fixed.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + parts.join('.');
  }
  function splitMoney(value) {
    var v = safe(value), neg = v < 0;
    var s = NUM.format(Math.abs(v)), dot = s.lastIndexOf('.');
    return { neg: neg, zero: Math.abs(v) < 0.005, int: (neg ? '-' : '') + s.slice(0, dot), frac: s.slice(dot) };
  }
  function p2(n) { return n < 10 ? '0' + n : String(n); }
  function isoDate(ts) {
    var d = new Date(ts == null ? Date.now() : ts);
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }
  function fileStamp(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + '_' + p2(d.getHours()) + p2(d.getMinutes());
  }
  function humanTime(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    return d.getFullYear() + '/' + p2(d.getMonth() + 1) + '/' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  function relTime(ts) {
    if (!ts) return '';
    var s = Math.round((Date.now() - ts) / 1000);
    if (s < 10) return 'الآن';
    if (s < 60) return 'منذ ' + s + ' ثانية';
    var m = Math.round(s / 60);
    if (m < 60) return 'منذ ' + m + ' دقيقة';
    var h = Math.round(m / 60);
    if (h < 24) return 'منذ ' + h + ' ساعة';
    return humanTime(ts);
  }
  function kb(bytes) { return bytes < 1024 ? int(bytes) + ' بايت' : (bytes < 1048576 ? int(Math.round(bytes / 1024)) + ' ك.ب' : (bytes / 1048576).toFixed(1) + ' م.ب'); }
  function parseNumber(value) {
    if (value == null) return null;
    if (typeof value === 'number') return isFinite(value) ? value : null;
    if (typeof value === 'boolean') return null;
    var s = Engine.normalizeArabic(String(value)).trim();
    if (!s) return null;
    s = s.replace(/[\u200e\u200f\u061c]/g, '').replace(/(ج\.?\s?م\.?|جنيه|egp)/gi, '').trim();
    var negative = /^\(.*\)$/.test(s) || /^[-\u2212]/.test(s) || /[-\u2212]$/.test(s);
    s = s.replace(/^\(|\)$/g, '').replace(/^[-\u2212]|[-\u2212]$|[%\u066A]/g, '').replace(/\u066B/g, '.').replace(/[\u066C\s\u00a0\u202f']/g, '');
    if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) return null;
    var n = Number(s);
    return isFinite(n) ? (negative ? -n : n) : null;
  }
  function parseBool(value) {
    if (value == null) return false;
    if (value === true) return true;
    if (typeof value === 'number') return value !== 0;
    var s = Engine.normalizeLoose(value);
    if (!s) return false;
    return ['1', 'true', 'yes', 'y', 'نعم', 'اي', 'ايوه', 'صح', 'مستبعد', 'مقفول', 'x', 'v'].indexOf(s) !== -1;
  }
  return { egp: egp, piastres: piastres, int: int, pct: pct, pctExact: pctExact, pctValue: pctValue, plain: plain, groupDigits: groupDigits, splitMoney: splitMoney, isoDate: isoDate, fileStamp: fileStamp, humanTime: humanTime, relTime: relTime, kb: kb, parseNumber: parseNumber, parseBool: parseBool };
})();

var Icons = (function () {
  'use strict';
  var P = {
    search: 'M10.5 10.5 14 14M12 7.5a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z',
    x: 'M4 4l8 8M12 4l-8 8',
    check: 'M3.5 8.5l3 3 6-7',
    caret: 'M4 6.5l4 4 4-4',
    chevron: 'M10 4 6 8l4 4',
    chevronNext: 'M6 4l4 4-4 4',
    arrowUp: 'M8 12.5V3.5M4.5 7L8 3.5 11.5 7',
    external: 'M9 2.6h4.4V7M13.4 2.6 7.6 8.4M11.4 9.6v3.2a.8.8 0 0 1-.8.8H3.2a.8.8 0 0 1-.8-.8V5.4a.8.8 0 0 1 .8-.8h3.2',
    upload: 'M8 14V5M4.5 8.5L8 5l3.5 3.5M2.5 14h11',
    download: 'M8 2.5v9M4.5 8l3.5 3.5L11.5 8M2.5 14h11',
    info: 'M8 7.2v4.3M8 4.7v.6M14 8a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z',
    help: 'M6.2 6.2a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.1v.4M8 11.4v.2M14 8a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z',
    warn: 'M8 6v3.6M8 11.4v.6M7.1 2.6 1.6 12.2c-.4.7.1 1.6.9 1.6h11c.8 0 1.3-.9.9-1.6L8.9 2.6a1 1 0 0 0-1.8 0Z',
    ok: 'M5 8.3l2.2 2.2L11.4 6M14 8a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z',
    danger: 'M5.5 5.5l5 5M10.5 5.5l-5 5M14 8a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z',
    lock: 'M4.5 7.2V5.4a3.5 3.5 0 0 1 7 0v1.8M3.6 7.2h8.8v6.2H3.6z',
    pin: 'M9.6 2.4 13.6 6.4 11.4 7.2 8.8 9.8l.2 2.6-1 1-5-5 1-1 2.6.2 2.6-2.6z M4.4 11.6 2.4 13.6',
    table: 'M2.2 3.4h11.6v9.2H2.2zM2.2 6.6h11.6M6 6.6v6',
    sliders: 'M2.6 5h7M11.4 5h2M2.6 11h2M6.4 11h7M10.4 3.4v3.2M4.4 9.4v3.2',
    layers: 'M8 2.4 14 5.6 8 8.8 2 5.6zM2 8.8l6 3.2 6-3.2',
    coins: 'M2.5 5.2c0-1 2.2-1.8 5-1.8s5 .8 5 1.8-2.2 1.8-5 1.8-5-.8-5-1.8ZM2.5 5.2v5.6c0 1 2.2 1.8 5 1.8s5-.8 5-1.8V5.2',
    people: 'M10.6 13.6v-1.2a2.6 2.6 0 0 0-2.6-2.6H4.6A2.6 2.6 0 0 0 2 12.4v1.2M8.2 4.8a2.4 2.4 0 1 1-4.8 0 2.4 2.4 0 0 1 4.8 0M14 13.6v-1.2a2 2 0 0 0-2-2.5M11 2.5a2.4 2.4 0 0 1 0 4.6',
    person: 'M12.8 13.6v-1.2a2.6 2.6 0 0 0-2.6-2.6H5.8a2.6 2.6 0 0 0-2.6 2.6v1.2M10.4 4.8a2.4 2.4 0 1 1-4.8 0 2.4 2.4 0 0 1 4.8 0',
    file: 'M9.2 2.2H4.4v11.6h7.2V4.6zM9.2 2.2v2.4h2.4',
    chart: 'M2.4 13.6h11.2M4.6 13.6V8M8 13.6V4M11.4 13.6v-3.4',
    settings: 'M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM12.9 10a1.1 1.1 0 0 0 .2 1.2l.1.1a1.3 1.3 0 1 1-1.9 1.9l-.1-.1a1.1 1.1 0 0 0-1.2-.2 1.1 1.1 0 0 0-.7 1v.2a1.3 1.3 0 0 1-2.6 0v-.1a1.1 1.1 0 0 0-.7-1 1.1 1.1 0 0 0-1.2.2l-.1.1a1.3 1.3 0 1 1-1.9-1.9l.1-.1a1.1 1.1 0 0 0 .2-1.2 1.1 1.1 0 0 0-1-.7H2a1.3 1.3 0 0 1 0-2.6h.2a1.1 1.1 0 0 0 1-.7 1.1 1.1 0 0 0-.2-1.2l-.1-.1a1.3 1.3 0 1 1 1.9-1.9l.1.1a1.1 1.1 0 0 0 1.2.2H6a1.1 1.1 0 0 0 .7-1V2a1.3 1.3 0 0 1 2.6 0v.2a1.1 1.1 0 0 0 .7 1 1.1 1.1 0 0 0 1.2-.2l.1-.1a1.3 1.3 0 1 1 1.9 1.9l-.1.1a1.1 1.1 0 0 0-.2 1.2v.1a1.1 1.1 0 0 0 1 .7h.2a1.3 1.3 0 0 1 0 2.6h-.2a1.1 1.1 0 0 0-1 .7Z',
    undo: 'M5.4 6.4H10a3.4 3.4 0 0 1 0 6.8H6.6M5.4 6.4 7.8 4M5.4 6.4l2.4 2.4',
    redo: 'M10.6 6.4H6a3.4 3.4 0 0 0 0 6.8h3.4M10.6 6.4 8.2 4M10.6 6.4 8.2 8.8',
    fill: 'M3 13h10M4.6 3v6.4M4.6 9.4 2.4 7.2M4.6 9.4l2.2-2.2M11 3v6.4M11 9.4 8.8 7.2M11 9.4l2.2-2.2',
    plus: 'M8 3.4v9.2M3.4 8h9.2',
    minus: 'M3.4 8h9.2',
    trash: 'M2.8 4.6h10.4M6 4.6V3.2h4v1.4M4.2 4.6l.6 9h6.4l.6-9M6.6 7v4.4M9.4 7v4.4',
    eye: 'M1.4 8s2.4-4.2 6.6-4.2S14.6 8 14.6 8s-2.4 4.2-6.6 4.2S1.4 8 1.4 8ZM9.8 8a1.8 1.8 0 1 1-3.6 0 1.8 1.8 0 0 1 3.6 0Z',
    print: 'M4.4 6V2.6h7.2V6M4.4 11.4H2.6V6h10.8v5.4h-1.8M4.4 9.4h7.2v4H4.4z',
    save: 'M12.4 13.6H3.6a1.2 1.2 0 0 1-1.2-1.2V3.6a1.2 1.2 0 0 1 1.2-1.2h6.6l3.4 3.4v6.6a1.2 1.2 0 0 1-1.2 1.2ZM5 2.4v4h6v-4M5 13.6V9.4h6v4.2',
    folder: 'M14 12.2a1.2 1.2 0 0 1-1.2 1.2H3.2A1.2 1.2 0 0 1 2 12.2V3.8a1.2 1.2 0 0 1 1.2-1.2h3l1.4 2h5.2A1.2 1.2 0 0 1 14 5.8Z',
    reset: 'M2.8 8a5.2 5.2 0 1 0 1.6-3.8M2.8 2.6v2.8h2.8',
    filter: 'M2.4 3.4h11.2l-4.3 5v5.2L6.7 12V8.4z',
    sun: 'M8 11.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM8 1.6v1.4M8 13v1.4M14.4 8H13M3 8H1.6M12.5 3.5l-1 1M4.5 11.5l-1 1M12.5 12.5l-1-1M4.5 4.5l-1-1',
    moon: 'M13.4 9.4A5.8 5.8 0 0 1 6.6 2.6a5.8 5.8 0 1 0 6.8 6.8Z',
    monitor: 'M2.4 3.2h11.2v7.2H2.4zM6 13.4h4M8 10.4v3',
    split: 'M8 13.6V8M8 8 3.6 3.6M8 8l4.4-4.4M3.6 3.6v3M3.6 3.6h3M12.4 3.6v3M12.4 3.6h-3',
    cap: 'M2.4 4h11.2M4 13.4V8.4M8 13.4V6M12 13.4V4',
    equal: 'M3.4 6h9.2M3.4 10h9.2',
    calendar: 'M2.6 3.8h10.8v9.6H2.6zM2.6 7h10.8M5.4 2.4v2.6M10.6 2.4v2.6',
    keyboard: 'M1.8 4.2h12.4v7.6H1.8zM4 6.4h.1M6.6 6.4h.1M9.2 6.4h.1M11.8 6.4h.1M4.6 9.4h6.8',
    copy: 'M5.6 5.6h7.8v7.8H5.6zM10.4 5.6V2.6H2.6v7.8h3',
    target: 'M14 8a6 6 0 1 1-12 0 6 6 0 0 1 12 0ZM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM8 8h.01',
    sparkle: 'M8 2.2 9.4 6.6 13.8 8 9.4 9.4 8 13.8 6.6 9.4 2.2 8l4.4-1.4Z',
    more: 'M3.6 8h.1M8 8h.1M12.4 8h.1',
    history: 'M2.6 8a5.4 5.4 0 1 0 1.6-3.8M2.6 2.8v2.6h2.6M8 5v3.2l2.2 1.4'
  };
  var NS = 'http://www.w3.org/2000/svg';
  function svg(name, cls) {
    var el = document.createElementNS(NS, 'svg');
    el.setAttribute('viewBox', '0 0 16 16');
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', 'currentColor');
    el.setAttribute('stroke-width', '1.5');
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('stroke-linejoin', 'round');
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('focusable', 'false');
    if (cls) el.setAttribute('class', cls);
    var path = document.createElementNS(NS, 'path');
    path.setAttribute('d', P[name] || P.info);
    el.appendChild(path);
    return el;
  }
  function brandMark(cls) {
    var el = document.createElementNS(NS, 'svg');
    el.setAttribute('viewBox', '0 0 32 32');
    el.setAttribute('class', cls || 'brand-mark');
    el.setAttribute('aria-hidden', 'true');
    var c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', '16'); c.setAttribute('cy', '16'); c.setAttribute('r', '15');
    c.setAttribute('fill', 'var(--accent)');
    var w = document.createElementNS(NS, 'path');
    w.setAttribute('d', 'M16 1a15 15 0 0 1 13 7.5L16 16Z');
    w.setAttribute('fill', 'var(--surface)');
    w.setAttribute('opacity', '.92');
    w.setAttribute('class', 'wedge');
    var h = document.createElementNS(NS, 'circle');
    h.setAttribute('cx', '16'); h.setAttribute('cy', '16'); h.setAttribute('r', '2.6');
    h.setAttribute('fill', 'var(--surface)');
    el.appendChild(c); el.appendChild(w); el.appendChild(h);
    return el;
  }
  return { svg: svg, brandMark: brandMark, has: function (n) { return !!P[n]; } };
})();

var Search = (function () {
  'use strict';
  var EXACT = 1000, PREFIX = 700, WORD_PREFIX = 600, SUBSTRING = 500, SUBSEQ = 300, TYPO = 150;

  var WORDS = new Map(), EMPTY_WORDS = [];
  function wordsOf(s) {
    if (!s) return EMPTY_WORDS;
    var w = WORDS.get(s);
    if (w === undefined) { w = s.indexOf(' ') === -1 ? [s] : s.split(' '); if (WORDS.size > 300000) WORDS.clear(); WORDS.set(s, w); }
    return w;
  }
  function Entry(p, i) {
    this.id = p.id; this.i = i;
    this.name = Engine.normalizeLoose(p.name);
    this.dept = Engine.normalizeLoose(p.dept);
    this.tier = Engine.normalizeLoose(p.tier);
    this.job = Engine.normalizeLoose(p.job);
    this.code = Engine.normalizeLoose(p.code);
    this.num = String(p.id);
    this.words = wordsOf(this.name);
    this.deptWords = wordsOf(this.dept);
    this.tierWords = wordsOf(this.tier);
    this.jobWords = wordsOf(this.job);
  }
  Object.defineProperty(Entry.prototype, 'all', { get: function () { var v = this.name + ' ' + this.dept + ' ' + this.tier + ' ' + this.job + ' ' + this.code + ' ' + this.num; Object.defineProperty(this, 'all', { value: v, writable: true }); return v; } });
  function buildIndex(people) {
    var entries = new Array(people.length);
    for (var i = 0; i < people.length; i++) entries[i] = new Entry(people[i], i);
    return { entries: entries, size: people.length };
  }
  function isSubsequence(needle, hay) {
    var n = 0;
    for (var h = 0; h < hay.length && n < needle.length; h++) if (hay[h] === needle[n]) n++;
    return n === needle.length;
  }
  function subsequenceSpread(needle, hay) {
    var n = 0, first = -1, last = -1;
    for (var h = 0; h < hay.length && n < needle.length; h++) {
      if (hay[h] === needle[n]) { if (first === -1) first = h; last = h; n++; }
    }
    return n < needle.length ? -1 : last - first;
  }
  function withinOneEdit(a, b) {
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    var i = 0, j = 0, edits = 0;
    while (i < la && j < lb) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (la === lb) { i++; j++; } else if (la > lb) i++; else j++;
    }
    if (i < la || j < lb) edits++;
    return edits <= 1;
  }
  function scoreField(needle, field, words) {
    if (!field) return 0;
    if (field === needle) return EXACT;
    if (field.indexOf(needle) === 0) return PREFIX - Math.min(60, field.length - needle.length);
    for (var w = 0; w < words.length; w++) if (words[w].indexOf(needle) === 0) return WORD_PREFIX - Math.min(50, w * 6);
    var at = field.indexOf(needle);
    if (at > 0) return SUBSTRING - Math.min(80, at * 2);
    if (needle.length >= 3 && isSubsequence(needle, field)) {
      var spread = subsequenceSpread(needle, field);
      if (spread <= needle.length * 2.2) return SUBSEQ - Math.min(120, spread * 3);
    }
    if (needle.length >= 4) for (var k = 0; k < words.length; k++) if (withinOneEdit(needle, words[k])) return TYPO - Math.min(40, k * 5);
    return 0;
  }
  function scoreEntry(needle, entry) {
    var best = scoreField(needle, entry.name, entry.words);
    if (best >= PREFIX) return best;
    if (/^\d+$/.test(needle) && (entry.num === needle || entry.code === needle)) return Math.max(best, 900);
    if (entry.code && entry.code.indexOf(needle) === 0) best = Math.max(best, 650);
    var d = scoreField(needle, entry.dept, entry.deptWords || (entry.dept ? entry.dept.split(' ') : []));
    if (d > 0) best = Math.max(best, Math.round(d * 0.55));
    var t = scoreField(needle, entry.tier, entry.tierWords || (entry.tier ? entry.tier.split(' ') : []));
    if (t > 0) best = Math.max(best, Math.round(t * 0.5));
    if (entry.job) {
      var j = scoreField(needle, entry.job, entry.jobWords || []);
      if (j > 0) best = Math.max(best, Math.round(j * 0.45));
    }
    return best;
  }
  function mayMatch(needle, e, fuzzy) {
    if (fuzzy) return true;
    return e.name.indexOf(needle) !== -1 || e.dept.indexOf(needle) !== -1 || e.tier.indexOf(needle) !== -1 || e.job.indexOf(needle) !== -1 || e.code.indexOf(needle) === 0 || e.num === needle;
  }
  function run(index, query, limitFn) {
    var raw = Engine.normalizeLoose(query);
    if (!raw) return null;
    var terms = raw.split(' ').filter(Boolean);
    var entries = index.entries, n = entries.length, hits = [], fuzzy = raw.length >= 3;
    var sIdx = new Int32Array(n), sScore = new Int32Array(n), m = 0;
    for (var i = 0; i < n; i++) {
      var e = entries[i];
      if (limitFn && !limitFn(i)) continue;
      var s = mayMatch(raw, e, fuzzy) ? scoreEntry(raw, e) : 0;
      if (s === 0 && terms.length > 1) {
        var all = e.all, okAll = true;
        for (var t = 0; t < terms.length; t++) if (all.indexOf(terms[t]) === -1) { okAll = false; break; }
        if (okAll) s = 120;
      }
      if (s > 0) { sIdx[m] = i; sScore[m] = s; m++; }
    }
    var order = new Array(m);
    for (var k = 0; k < m; k++) order[k] = k;
    order.sort(function (a, b) { return (sScore[b] - sScore[a]) || (sIdx[a] - sIdx[b]); });
    var ids = new Set(), rankMap = new Map(), rows = new Uint8Array(n), rankArr = new Int32Array(n).fill(-1);
    for (var h = 0; h < m; h++) {
      var ix = sIdx[order[h]], en = entries[ix];
      ids.add(en.id); rankMap.set(en.id, h); rows[ix] = 1; rankArr[ix] = h;
      if (h < 200) hits.push({ id: en.id, i: ix, score: sScore[order[h]] });
    }
    var idsObj = { has: function (id) { return ids.has(id); } };
    var proxyIds = new Proxy(idsObj, { get: function (t, k) { if (k === 'has') return t.has; return ids.has(k) || ids.has(Number(k)) ? true : undefined; } });
    var proxyOrder = new Proxy({}, { get: function (t, k) { var v = rankMap.get(k); if (v === undefined) v = rankMap.get(Number(k)); return v; } });
    return { needle: raw, terms: terms, ids: proxyIds, order: proxyOrder, rows: rows, rank: rankArr, count: m, ranked: hits };
  }
  function highlight(text, needle) {
    var frag = document.createDocumentFragment();
    var raw = text == null ? '' : String(text);
    if (!raw) { frag.appendChild(document.createTextNode('—')); return frag; }
    if (!needle) { frag.appendChild(document.createTextNode(raw)); return frag; }
    var m = Engine.normMap(raw);
    var terms = String(needle).split(' ').filter(Boolean).sort(function (a, b) { return b.length - a.length; });
    var marks = [];
    terms.forEach(function (term) {
      var from = 0, at;
      while ((at = m.norm.indexOf(term, from)) !== -1) {
        var s = m.idx[at], e = m.idx[at + term.length - 1] + 1;
        while (e < raw.length && /[\u064B-\u065F\u0670\u0640]/.test(raw[e])) e++;
        marks.push([s, e]);
        from = at + term.length;
      }
    });
    if (!marks.length) { frag.appendChild(document.createTextNode(raw)); return frag; }
    marks.sort(function (a, b) { return a[0] - b[0]; });
    var merged = [];
    marks.forEach(function (mk) {
      var last = merged[merged.length - 1];
      if (last && mk[0] <= last[1]) last[1] = Math.max(last[1], mk[1]); else merged.push(mk.slice());
    });
    var pos = 0;
    merged.forEach(function (mk) {
      if (mk[0] > pos) frag.appendChild(document.createTextNode(raw.slice(pos, mk[0])));
      var span = document.createElement('mark');
      span.className = 'mark';
      span.textContent = raw.slice(mk[0], mk[1]);
      frag.appendChild(span);
      pos = mk[1];
    });
    if (pos < raw.length) frag.appendChild(document.createTextNode(raw.slice(pos)));
    return frag;
  }
  return { buildIndex: buildIndex, run: run, highlight: highlight, scoreEntry: scoreEntry, withinOneEdit: withinOneEdit, isSubsequence: isSubsequence, TIERS: { EXACT: EXACT, PREFIX: PREFIX, WORD_PREFIX: WORD_PREFIX, SUBSTRING: SUBSTRING, SUBSEQ: SUBSEQ, TYPO: TYPO } };
})();

var Sorter = (function () {
  'use strict';
  var collator = (function () {
    try { return new Intl.Collator('ar', { numeric: true, sensitivity: 'base' }); }
    catch (e) { return { compare: function (a, b) { return a < b ? -1 : (a > b ? 1 : 0); } }; }
  })();
  function compareValues(a, b) {
    var an = (a == null || a === ''), bn = (b == null || b === '');
    if (an && bn) return 0;
    if (an) return 1;
    if (bn) return -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return collator.compare(String(a), String(b));
  }
  function sortRows(rows, key, dir, accessor) {
    if (!key || !dir) return rows.slice();
    var decorated = rows.map(function (r, i) { return { r: r, i: i, v: accessor(r, key) }; });
    var sign = dir === 'desc' ? -1 : 1;
    decorated.sort(function (x, y) {
      var an = x.v == null || x.v === '', bn = y.v == null || y.v === '';
      if (an !== bn) return an ? 1 : -1;
      var c = compareValues(x.v, y.v);
      return c !== 0 ? c * sign : x.i - y.i;
    });
    return decorated.map(function (d) { return d.r; });
  }
  function nextDir(current) { return current === 'asc' ? 'desc' : (current === 'desc' ? null : 'asc'); }
  function sortIndex(count, valueAt, dir) {
    var sign = dir === 'desc' ? -1 : 1, i, order = new Array(count);
    for (i = 0; i < count; i++) order[i] = i;
    var numeric = true, probe = Math.min(count, 64);
    for (i = 0; i < probe; i++) { var pv = valueAt(i); if (pv != null && pv !== '' && typeof pv !== 'number') { numeric = false; break; } }
    if (numeric) {
      var nv = new Float64Array(count), empty = new Uint8Array(count);
      for (i = 0; i < count; i++) {
        var v = valueAt(i);
        if (v == null || v === '' || typeof v !== 'number' || v !== v) empty[i] = 1;
        else nv[i] = v;
      }
      order.sort(function (a, b) {
        if (empty[a] !== empty[b]) return empty[a] ? 1 : -1;
        var d = nv[a] - nv[b];
        return d !== 0 ? d * sign : a - b;
      });
      return order;
    }
    var key = new Array(count), uniq = new Map(), list = [];
    for (i = 0; i < count; i++) {
      var s = valueAt(i);
      s = s == null ? '' : String(s);
      key[i] = s;
      if (s !== '' && !uniq.has(s)) { uniq.set(s, 0); list.push(s); }
    }
    list.sort(collator.compare);
    var rk = 0;
    for (i = 0; i < list.length; i++) { if (i && collator.compare(list[i - 1], list[i]) !== 0) rk++; uniq.set(list[i], rk); }
    var ranks = new Int32Array(count);
    for (i = 0; i < count; i++) ranks[i] = key[i] === '' ? -1 : uniq.get(key[i]);
    order.sort(function (a, b) {
      var ra = ranks[a], rb = ranks[b];
      if ((ra < 0) !== (rb < 0)) return ra < 0 ? 1 : -1;
      var d = ra - rb;
      return d !== 0 ? d * sign : a - b;
    });
    return order;
  }
  function sortRowsFast(rows, key, dir, accessor) {
    if (!key || !dir) return rows.slice();
    var order = sortIndex(rows.length, function (i) { return accessor(rows[i], key); }, dir);
    var out = new Array(rows.length);
    for (var i = 0; i < order.length; i++) out[i] = rows[order[i]];
    return out;
  }
  return { sortRows: sortRowsFast, sortRowsLegacy: sortRows, sortIndex: sortIndex, compareValues: compareValues, nextDir: nextDir };
})();

var Pack = (function () {
  'use strict';
  var STR = ['code', 'name', 'job', 'dept', 'notes'], NUMS = ['daysWorked', 'penaltyRate', 'manualFactor', 'overrideValue'];
  var cache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function dict(values) {
    var map = new Map(), keys = [], idx = new Uint32Array(values.length);
    for (var i = 0; i < values.length; i++) {
      var v = values[i] == null ? '' : values[i];
      var k = map.get(v);
      if (k === undefined) { k = keys.length; map.set(v, k); keys.push(v); }
      idx[i] = k;
    }
    return { keys: keys, idx: idx };
  }
  function people(list) {
    if (!Array.isArray(list)) return null;
    if (cache) { var hit = cache.get(list); if (hit) return hit; }
    var n = list.length, out = { kind: 'qisma.cols', v: 1, n: n }, i, f;
    var seq = true;
    for (i = 0; i < n; i++) if (list[i].id !== i + 1) { seq = false; break; }
    out.id = seq ? null : list.map(function (p) { return p.id; });
    STR.forEach(function (k) { var a = new Array(n); for (i = 0; i < n; i++) a[i] = list[i][k] || ''; out[k] = a; });
    out.tier = dict(list.map(function (p) { return p.tier || ''; }));
    out.pinnedPool = dict(list.map(function (p) { return p.pinnedPool || ''; }));
    NUMS.forEach(function (k) { var a = new Float64Array(n); for (i = 0; i < n; i++) { var v = list[i][k]; a[i] = v == null ? NaN : v; } out[k] = a; });
    f = new Uint8Array(n);
    for (i = 0; i < n; i++) if (list[i].excluded) f[i] = 1;
    out.excluded = f;
    if (cache) cache.set(list, out);
    return out;
  }
  function unpeople(c) {
    if (!c || c.kind !== 'qisma.cols') return c;
    var n = c.n, out = new Array(n);
    function num(a, i) { var v = a[i]; return v == null || v !== v ? null : v; }
    var tierK = c.tier.keys, tierI = c.tier.idx, pinK = c.pinnedPool.keys, pinI = c.pinnedPool.idx;
    for (var i = 0; i < n; i++) {
      var pin = pinK[pinI[i]];
      out[i] = {
        id: c.id ? c.id[i] : i + 1, code: c.code[i] || '', name: c.name[i] || '', job: c.job[i] || '', dept: c.dept[i] || '', tier: tierK[tierI[i]] || '',
        daysWorked: num(c.daysWorked, i), penaltyRate: num(c.penaltyRate, i), manualFactor: num(c.manualFactor, i), overrideValue: num(c.overrideValue, i),
        pinnedPool: pin ? pin : null, excluded: !!c.excluded[i], notes: c.notes[i] || ''
      };
    }
    if (cache) cache.set(out, c);
    return out;
  }
  function toJson(c) {
    var o = {};
    Object.keys(c).forEach(function (k) {
      var v = c[k];
      if (v && v.idx) o[k] = { keys: v.keys, idx: Array.prototype.slice.call(v.idx) };
      else if (ArrayBuffer.isView(v)) o[k] = Array.prototype.map.call(v, function (x) { return x !== x ? null : x; });
      else o[k] = v;
    });
    return o;
  }
  return { people: people, unpeople: unpeople, toJson: toJson };
})();

var IDB = (function () {
  'use strict';
  var NAME = 'qisma', STORE = 'kv', dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') { reject(new Error('no-idb')); return; }
      var req;
      try { req = indexedDB.open(NAME, 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
      req.onblocked = function () { reject(new Error('blocked')); };
    });
    dbp.catch(function () { dbp = null; });
    return dbp;
  }
  function tx(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode), out;
        t.oncomplete = function () { resolve(out); };
        t.onerror = t.onabort = function () { reject(t.error); };
        out = fn(t.objectStore(STORE));
        if (out && 'onsuccess' in out) { var r = out; r.onsuccess = function () { out = r.result; }; }
      });
    });
  }
  return {
    get: function (k) { return tx('readonly', function (s) { return s.get(k); }); },
    put: function (k, v) { return tx('readwrite', function (s) { s.put(v, k); }); },
    del: function (k) { return tx('readwrite', function (s) { s.delete(k); }); },
    available: function () { return typeof indexedDB !== 'undefined'; }
  };
})();

var Busy = (function () {
  'use strict';
  var host = null, label = null, depth = 0, timer = null;
  function ensure() {
    if (host) return;
    host = document.createElement('div');
    host.className = 'busy';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    host.hidden = true;
    var card = document.createElement('div');
    card.className = 'busy-card';
    var spin = document.createElement('span');
    spin.className = 'busy-spin';
    label = document.createElement('span');
    label.className = 'busy-label';
    card.appendChild(spin);
    card.appendChild(label);
    host.appendChild(card);
    document.body.appendChild(host);
  }
  function show(text) { ensure(); label.textContent = text || 'لحظة…'; depth++; clearTimeout(timer); timer = setTimeout(function () { if (depth) host.hidden = false; }, 120); }
  function hide() { depth = Math.max(0, depth - 1); if (!depth && host) { clearTimeout(timer); host.hidden = true; } }
  function run(text, fn) {
    return new Promise(function (resolve, reject) {
      ensure(); label.textContent = text || 'لحظة…'; depth++; host.hidden = false;
      requestAnimationFrame(function () {
        setTimeout(function () {
          try { var v = fn(); depth = Math.max(0, depth - 1); if (!depth) host.hidden = true; resolve(v); }
          catch (e) { depth = Math.max(0, depth - 1); if (!depth) host.hidden = true; reject(e); }
        }, 0);
      });
    });
  }
  function maybe(size, text, fn) { return size > 30000 ? run(text, fn) : Promise.resolve(fn()); }
  var soft = null, softLabel = null, softDepth = 0, softTimer = null;
  function softShow(text) {
    if (!soft) {
      soft = document.createElement('div');
      soft.className = 'busy-soft';
      soft.setAttribute('role', 'status');
      soft.setAttribute('aria-live', 'polite');
      soft.hidden = true;
      var spin = document.createElement('span');
      spin.className = 'busy-spin';
      softLabel = document.createElement('span');
      soft.appendChild(spin);
      soft.appendChild(softLabel);
      document.body.appendChild(soft);
    }
    softLabel.textContent = text || 'جارٍ الحساب في الخلفية…';
    softDepth++;
    clearTimeout(softTimer);
    softTimer = setTimeout(function () { if (softDepth) soft.hidden = false; }, 150);
  }
  function softHide() {
    softDepth = Math.max(0, softDepth - 1);
    if (!softDepth && soft) { clearTimeout(softTimer); soft.hidden = true; }
  }
  return { show: show, hide: hide, run: run, maybe: maybe, softShow: softShow, softHide: softHide, softActive: function () { return softDepth > 0; }, set: function (t) { if (label) label.textContent = t; } };
})();

var Store = (function () {
  'use strict';
  var SCHEMA = 2;
  var KEYS = { settings: 'qisma.settings.v1', tiermap: 'qisma.tiermap.v1', session: 'qisma.session.v1', snapshots: 'qisma.snapshots.v1' };
  var memory = Object.create(null);
  var available = null, reason = '';

  function probe() {
    if (available !== null) return available;
    try {
      var k = '__qisma_probe__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      available = true;
    } catch (e) {
      available = false;
      reason = (e && e.name === 'SecurityError') ? 'التخزين معطّل في هذا المتصفح' : 'التخزين المحلي غير متاح';
    }
    return available;
  }
  function readRaw(key) {
    if (probe()) { try { var v = window.localStorage.getItem(key); return v != null ? v : (memory[key] || null); } catch (e) { return memory[key] || null; } }
    return memory[key] || null;
  }
  function writeRaw(key, value) {
    memory[key] = value;
    if (!probe()) return { ok: false, fallback: true };
    try { window.localStorage.setItem(key, value); return { ok: true }; }
    catch (e) {
      var quota = e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
      return { ok: false, fallback: true, quota: !!quota };
    }
  }
  function removeRaw(key) {
    delete memory[key];
    if (!probe()) return;
    try { window.localStorage.removeItem(key); } catch (e) {}
  }
  function load(name) {
    var raw = readRaw(KEYS[name]);
    if (!raw) return null;
    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) { return { __error: 'CORRUPT' }; }
    if (parsed && parsed.schemaVersion != null && parsed.schemaVersion > SCHEMA) return { __error: 'NEWER_SCHEMA', found: parsed.schemaVersion, supported: SCHEMA };
    return parsed;
  }
  function save(name, payload) {
    var body = {};
    Object.keys(payload || {}).forEach(function (k) { body[k] = payload[k]; });
    body.schemaVersion = SCHEMA;
    body.appVersion = APP_VERSION;
    body.savedAt = Date.now();
    var text;
    try { text = JSON.stringify(body); } catch (e) { return { ok: false, error: 'SERIALIZE' }; }
    var res = writeRaw(KEYS[name], text);
    if (!res.ok && res.quota && name === 'session' && payload && ((payload.sourceGrid && payload.sourceGrid.length) || (payload.undo && payload.undo.length))) {
      var lean = {};
      Object.keys(body).forEach(function (k) { lean[k] = body[k]; });
      lean.sourceGrid = [];
      lean.rawDropped = true;
      var t2 = JSON.stringify(lean);
      var res2 = writeRaw(KEYS[name], t2);
      if (res2.ok) { res2.lean = true; res2.bytes = t2.length; return res2; }
    }
    res.bytes = text.length;
    return res;
  }
  var BIG_ROWS = 15000;
  function isBig(payload) {
    return !!payload && ((payload.people && payload.people.length > BIG_ROWS) || (payload.sourceGrid && payload.sourceGrid.length > BIG_ROWS));
  }
  function saveBig(payload, onResult) {
    var body = {};
    Object.keys(payload).forEach(function (k) { body[k] = payload[k]; });
    body.people = Pack.people(payload.people || []);
    body.sourceGrid = null;
    body.rawDropped = !!(payload.sourceGrid && payload.sourceGrid.length);
    body.schemaVersion = SCHEMA; body.appVersion = APP_VERSION; body.savedAt = Date.now();
    var stub = JSON.stringify({ schemaVersion: SCHEMA, appVersion: APP_VERSION, savedAt: body.savedAt, inIdb: true, fileName: payload.fileName, count: (payload.people || []).length, screen: payload.screen });
    IDB.put('session', body).then(function () {
      writeRaw(KEYS.session, stub);
      if (onResult) onResult({ ok: true, idb: true, lean: body.rawDropped && false });
    }, function () {
      if (onResult) onResult({ ok: false, quota: true });
    });
  }
  function loadBig() {
    return IDB.get('session').then(function (s) {
      if (!s) return null;
      if (s.people && s.people.kind === 'qisma.cols') { s.people = Pack.unpeople(s.people); s.__packed = true; }
      return s;
    });
  }
  var timers = Object.create(null), pending = Object.create(null);
  function clear(name) {
    clearTimeout(timers[name]);
    delete pending[name];
    timers[name] = null;
    removeRaw(KEYS[name]);
    if (name === 'session' && IDB.available()) IDB.del('session').catch(function () {});
  }
  function clearAll() { Object.keys(KEYS).forEach(function (n) { clear(n); }); }
  function usage() {
    var total = 0, detail = {};
    Object.keys(KEYS).forEach(function (n) { var raw = readRaw(KEYS[n]); var size = raw ? raw.length * 2 : 0; detail[n] = size; total += size; });
    return { total: total, detail: detail, available: probe(), reason: reason };
  }
  function flush(name) {
    var task = pending[name];
    if (!task) return;
    clearTimeout(timers[name]);
    timers[name] = null;
    delete pending[name];
    var payload;
    try { payload = task.getPayload(); } catch (e) { return; }
    if (payload == null) return;
    if (name === 'session' && isBig(payload) && IDB.available()) { saveBig(payload, task.onResult); return; }
    if (name === 'session') IDB.del('session').catch(function () {});
    var res = save(name, payload);
    if (task.onResult) task.onResult(res);
  }
  function flushAll() { Object.keys(pending).forEach(flush); }
  function debouncedSave(name, getPayload, delay, onResult) {
    if (timers[name]) clearTimeout(timers[name]);
    pending[name] = { getPayload: getPayload, onResult: onResult };
    timers[name] = setTimeout(function () { flush(name); }, delay == null ? 1000 : delay);
  }
  function hasPending() { return Object.keys(pending).length > 0; }
  window.addEventListener('pagehide', flushAll);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushAll(); });

  var BUNDLE_FIELDS = ['title', 'period', 'periodDays', 'tiers', 'pools', 'options', 'people', 'sourceGrid', 'headerRow', 'headers', 'rawRows', 'mapping', 'fileName', 'sheetName', 'penaltyScale', 'tierAliases', 'baseline'];
  function serializeBundle(state, scope) {
    scope = scope || { settings: true, people: true };
    var out = {};
    BUNDLE_FIELDS.forEach(function (k) {
      if (!scope.people && (k === 'people' || k === 'rawRows' || k === 'headers' || k === 'mapping' || k === 'sourceGrid' || k === 'headerRow' || k === 'baseline')) return;
      if (state[k] !== undefined) out[k] = state[k];
    });
    var big = out.people && out.people.length > BIG_ROWS;
    if (big) {
      out.people = Pack.toJson(Pack.people(out.people));
      if (out.sourceGrid && out.sourceGrid.length > BIG_ROWS) { out.sourceGrid = []; out.rawDropped = true; }
      delete out.rawRows;
    }
    return JSON.stringify({ kind: 'qisma.bundle', schemaVersion: SCHEMA, appVersion: APP_VERSION, exportedAt: new Date().toISOString(), state: out }, null, big ? 0 : 2);
  }
  function deserializeBundle(input) {
    var obj = input;
    if (typeof input === 'string') { try { obj = JSON.parse(input); } catch (e) { return { ok: false, error: 'الملف ليس JSON صالحًا' }; } }
    if (!obj || typeof obj !== 'object') return { ok: false, error: 'الملف فارغ أو غير صالح' };
    var v = obj.schemaVersion;
    if (v != null && Number(v) > SCHEMA) return { ok: false, error: 'الملف من إصدار أحدث (' + v + ') وهذه النسخة تقرأ حتى ' + SCHEMA + ' — حدِّث التطبيق أولًا' };
    var st = null, kind = obj.kind || 'qisma.bundle';
    if (kind === 'qisma.bundle') st = obj.state;
    else if (kind === 'qisma.session') st = obj.session;
    else if (kind === 'qisma.settings') {
      st = {};
      var s = obj.settings || {};
      ['tiers', 'pools', 'options', 'periodDays', 'tierAliases'].forEach(function (k) { if (s[k] != null) st[k] = s[k]; });
      if (obj.people) st.people = obj.people;
      if (s.ui) st.ui = s.ui;
    } else return { ok: false, error: 'هذا الملف ليس نسخة أو إعدادات من قِسمة' };
    if (!st || typeof st !== 'object') return { ok: false, error: 'الملف لا يحتوي على بيانات' };
    if (st.people && st.people.kind === 'qisma.cols') st.people = Pack.unpeople(st.people);
    return { ok: true, kind: kind, state: st, schemaVersion: v == null ? 1 : Number(v), appVersion: obj.appVersion || null };
  }

  return {
    SCHEMA: SCHEMA, KEYS: KEYS, load: load, save: save, clear: clear, clearAll: clearAll, usage: usage,
    debouncedSave: debouncedSave, flushAll: flushAll, hasPending: hasPending, loadBig: loadBig, BIG_ROWS: BIG_ROWS,
    serializeBundle: serializeBundle, deserializeBundle: deserializeBundle,
    isAvailable: probe, unavailableReason: function () { probe(); return reason; }
  };
})();

var Theme = (function () {
  'use strict';
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : { matches: false };
  var pref = 'system';
  function resolve() { return (pref === 'dark' || (pref === 'system' && mq.matches)) ? 'dark' : 'light'; }
  function apply() {
    var mode = resolve(), r = document.documentElement;
    r.setAttribute('data-theme', mode);
    r.setAttribute('data-theme-pref', pref);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', mode === 'dark' ? '#1A1A18' : '#F0EEE6');
  }
  function set(v) { pref = (v === 'dark' || v === 'light') ? v : 'system'; apply(); }
  function init(v) {
    pref = v || document.documentElement.getAttribute('data-theme-pref') || 'system';
    var on = function () { if (pref === 'system') apply(); };
    if (mq.addEventListener) mq.addEventListener('change', on); else if (mq.addListener) mq.addListener(on);
    apply();
  }
  return { init: init, set: set, get: function () { return pref; }, resolve: resolve };
})();

var UI = (function () {
  'use strict';

  function el(tag, cls, kids) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (kids != null) append(n, kids);
    return n;
  }
  function append(parent, kids) {
    if (kids == null) return parent;
    if (!Array.isArray(kids)) kids = [kids];
    kids.forEach(function (k) {
      if (k == null || k === false) return;
      parent.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k);
    });
    return parent;
  }
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); return node; }
  var reduceMotion = function () { return document.documentElement.getAttribute('data-motion') === 'reduced' || !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); };
  var coarse = function () { return window.matchMedia && window.matchMedia('(pointer:coarse)').matches; };

  var uid = 0;
  function nextId(prefix) { uid++; return (prefix || 'q') + '-' + uid; }

  function btn(label, opts) {
    opts = opts || {};
    var b = el('button', 'btn' + (opts.variant ? ' btn-' + opts.variant : '') + (opts.size === 'sm' ? ' btn-sm' : '') + (opts.size === 'lg' ? ' btn-lg' : '') + (opts.block ? ' btn-block' : '') + (opts.cls ? ' ' + opts.cls : ''));
    b.type = 'button';
    if (opts.icon) b.appendChild(Icons.svg(opts.icon));
    if (label) b.appendChild(el('span', 'btn-label', label));
    if (opts.kbd) b.appendChild(el('kbd', 'kbd', opts.kbd));
    if (!label && opts.icon) { b.classList.add('btn-icon'); b.setAttribute('aria-label', opts.title || ''); }
    if (opts.title) { if (label) b.title = opts.title; else attachTip(b, opts.title); }
    if (opts.disabled) b.disabled = true;
    if (opts.onClick) b.addEventListener('click', opts.onClick);
    return b;
  }
  function iconBtn(icon, title, onClick, size) { return btn('', { icon: icon, title: title, onClick: onClick, variant: 'ghost', size: size }); }

  function field(label, control, help, opts) {
    opts = opts || {};
    var f = el('div', 'field' + (opts.cls ? ' ' + opts.cls : ''));
    if (label) {
      var l = el('label', 'field-label');
      l.appendChild(document.createTextNode(label));
      if (opts.required) l.appendChild(el('span', 'req', ' *'));
      var target = control && (control.id ? control : (control.querySelector && control.querySelector('input,button')));
      if (target && target.id) l.htmlFor = target.id;
      f.appendChild(l);
    }
    f.appendChild(control);
    if (help) {
      var h = el('div', 'field-help', help);
      h.id = nextId('help');
      var tgt = control && (control.tagName === 'INPUT' ? control : (control.querySelector && control.querySelector('input,button')));
      if (tgt) tgt.setAttribute('aria-describedby', h.id);
      f.appendChild(h);
    }
    return f;
  }

  function input(opts) {
    opts = opts || {};
    var wrapNeeded = !!(opts.suffix || opts.prefix);
    var i = el('input', 'input' + (opts.size === 'sm' ? ' input-sm' : '') + (opts.numeric ? ' num-input' : '') + (opts.cls ? ' ' + opts.cls : ''));
    i.id = opts.id || nextId('in');
    i.type = opts.numeric ? 'text' : (opts.type === 'number' ? 'text' : (opts.type || 'text'));
    if (opts.numeric) {
      i.setAttribute('inputmode', opts.integer ? 'numeric' : 'decimal');
      i.autocomplete = 'off';
      i.spellcheck = false;
      i.dir = 'ltr';
    }
    if (opts.value != null) i.value = opts.grouped ? Fmt.groupDigits(opts.value) : opts.value;
    if (opts.placeholder) i.placeholder = opts.placeholder;
    if (opts.disabled) i.disabled = true;
    if (opts.maxLength) i.maxLength = opts.maxLength;
    if (opts.ariaLabel) i.setAttribute('aria-label', opts.ariaLabel);
    if (opts.onInput) i.addEventListener('input', function () { opts.onInput(i.value, i); });
    if (opts.onChange) i.addEventListener('change', function () { opts.onChange(i.value, i); });
    if (opts.onKeyDown) i.addEventListener('keydown', opts.onKeyDown);
    if (opts.grouped) {
      i.addEventListener('focus', function () {
        var raw = Fmt.parseNumber(i.value);
        i.value = raw == null ? '' : String(raw);
        setTimeout(function () { try { i.select(); } catch (e) {} }, 0);
      });
      i.addEventListener('blur', function () {
        var raw = Fmt.parseNumber(i.value);
        i.value = raw == null ? '' : Fmt.groupDigits(raw);
      });
    }
    if (opts.numeric && opts.stepper) {
      i.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        var n = Fmt.parseNumber(i.value);
        if (n == null) n = 0;
        var st = (e.shiftKey ? 10 : 1) * (opts.stepper || 1);
        n = n + (e.key === 'ArrowUp' ? st : -st);
        if (opts.min != null && n < opts.min) n = opts.min;
        if (opts.max != null && n > opts.max) n = opts.max;
        i.value = Fmt.plain(n);
        e.preventDefault();
        i.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    if (!wrapNeeded) return i;
    var w = el('div', 'input-affix' + (opts.size === 'sm' ? ' input-affix-sm' : ''));
    if (opts.prefix) w.appendChild(el('span', 'affix affix-pre', opts.prefix));
    w.appendChild(i);
    if (opts.suffix) w.appendChild(el('span', 'affix affix-suf', opts.suffix));
    w.input = i;
    w.id = '';
    w.addEventListener('click', function (e) { if (e.target === w || e.target.classList.contains('affix')) i.focus(); });
    return w;
  }

  function checkbox(opts) {
    opts = opts || {};
    var wrap = el('label', 'check' + (opts.size === 'sm' ? ' check-sm' : ''));
    var cb = el('input');
    cb.type = 'checkbox';
    cb.checked = !!opts.checked;
    if (opts.id) cb.id = opts.id;
    if (opts.disabled) cb.disabled = true;
    if (opts.indeterminate) cb.indeterminate = true;
    if (opts.ariaLabel) cb.setAttribute('aria-label', opts.ariaLabel);
    var box = el('span', 'check-box');
    box.appendChild(Icons.svg('check'));
    wrap.appendChild(cb);
    wrap.appendChild(box);
    if (opts.label) {
      if (opts.hint) {
        var t = el('span', 'check-text');
        t.appendChild(el('span', 'check-label', opts.label));
        t.appendChild(el('span', 'field-help', opts.hint));
        wrap.appendChild(t);
      } else wrap.appendChild(el('span', 'check-label', opts.label));
    }
    if (opts.onChange) cb.addEventListener('change', function () { opts.onChange(cb.checked, cb); });
    wrap.input = cb;
    return wrap;
  }

  function toggle(opts) {
    opts = opts || {};
    var wrap = el('label', 'switch');
    var cb = el('input');
    cb.type = 'checkbox';
    cb.setAttribute('role', 'switch');
    cb.checked = !!opts.checked;
    if (opts.id) cb.id = opts.id;
    if (opts.ariaLabel) cb.setAttribute('aria-label', opts.ariaLabel);
    if (opts.disabled) cb.disabled = true;
    wrap.appendChild(cb);
    wrap.appendChild(el('span', 'switch-track', el('span', 'switch-thumb')));
    if (opts.label) wrap.appendChild(el('span', 'switch-label', opts.label));
    if (opts.onChange) cb.addEventListener('change', function () { opts.onChange(cb.checked, cb); });
    wrap.input = cb;
    return wrap;
  }

  function segmented(opts) {
    var wrap = el('div', 'seg' + (opts.size === 'sm' ? ' seg-sm' : '') + (opts.block ? ' seg-block' : ''));
    wrap.setAttribute('role', 'radiogroup');
    if (opts.ariaLabel) wrap.setAttribute('aria-label', opts.ariaLabel);
    var current = opts.value;
    var buttons = [];
    function paint() {
      buttons.forEach(function (b) {
        var on = b.__value === current;
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
      });
    }
    opts.options.forEach(function (o) {
      var b = el('button', 'seg-btn');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.__value = o.value;
      if (o.icon) b.appendChild(Icons.svg(o.icon));
      b.appendChild(el('span', null, o.label));
      if (o.title) b.title = o.title;
      b.addEventListener('click', function () {
        if (current === o.value) return;
        current = o.value;
        paint();
        if (opts.onChange) opts.onChange(o.value);
      });
      b.addEventListener('keydown', function (e) {
        var dir = 0;
        if (e.key === 'ArrowLeft') dir = 1; else if (e.key === 'ArrowRight') dir = -1;
        if (!dir) return;
        e.preventDefault();
        var i = buttons.indexOf(b);
        var n = buttons[(i + dir + buttons.length) % buttons.length];
        n.focus(); n.click();
      });
      buttons.push(b);
      wrap.appendChild(b);
    });
    paint();
    wrap.setValue = function (v) { current = v; paint(); };
    wrap.getValue = function () { return current; };
    return wrap;
  }

  var openPanel = null;
  function closeOpenPanel() {
    if (!openPanel) return;
    var p = openPanel;
    openPanel = null;
    if (p.trigger) p.trigger.setAttribute('aria-expanded', 'false');
    if (p.panel && p.panel.parentNode) p.panel.parentNode.removeChild(p.panel);
    if (p.onClose) p.onClose();
  }
  document.addEventListener('pointerdown', function (e) {
    if (!openPanel) return;
    if (openPanel.panel.contains(e.target) || (openPanel.trigger && openPanel.trigger.contains(e.target))) return;
    closeOpenPanel();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && openPanel) {
      var t = openPanel.trigger;
      e.stopPropagation();
      closeOpenPanel();
      if (t) t.focus();
    }
  }, true);

  function placePanel(panel, trigger, align) {
    var tRect = trigger.getBoundingClientRect();
    var vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    var pw = Math.min(Math.max(tRect.width, panel.offsetWidth), vw - 16);
    panel.style.width = pw + 'px';
    var rtl = getComputedStyle(document.documentElement).direction === 'rtl';
    var anchorRight = align === 'end' ? !rtl : rtl;
    var left = anchorRight ? (tRect.right - pw) : tRect.left;
    left = Math.max(8, Math.min(left, vw - pw - 8));
    panel.style.left = left + 'px';
    var ph = panel.offsetHeight;
    var below = vh - tRect.bottom - 8, above = tRect.top - 8;
    var openUp = ph > below && above > below;
    if (openUp && ph > above) panel.style.maxHeight = Math.max(160, above - 6) + 'px';
    if (!openUp && ph > below) panel.style.maxHeight = Math.max(160, below - 6) + 'px';
    ph = panel.offsetHeight;
    panel.style.top = (openUp ? Math.max(8, tRect.top - ph - 6) : (tRect.bottom + 6)) + 'px';
    panel.classList.toggle('from-top', openUp);
  }

  function portalPanel(trigger, panel, align, onClose) {
    document.body.appendChild(panel);
    placePanel(panel, trigger, align);
    function onScroll(e) {
      if (panel.contains(e.target)) return;
      var r = trigger.getBoundingClientRect();
      if (r.bottom < 0 || r.top > document.documentElement.clientHeight || !trigger.isConnected) { closeOpenPanel(); return; }
      placePanel(panel, trigger, align);
    }
    function onResize() { placePanel(panel, trigger, align); }
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    trigger.setAttribute('aria-expanded', 'true');
    openPanel = {
      panel: panel, trigger: trigger,
      onClose: function () {
        window.removeEventListener('scroll', onScroll, true);
        window.removeEventListener('resize', onResize);
        if (onClose) onClose();
      }
    };
  }

  function dropdown(opts) {
    opts = opts || {};
    var wrap = el('div', 'dd' + (opts.block ? ' dd-block' : ''));
    var trigger = el('button', 'dd-trigger' + (opts.size === 'sm' ? ' dd-sm' : ''));
    trigger.type = 'button';
    trigger.id = opts.id || nextId('dd');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    if (opts.ariaLabel) trigger.setAttribute('aria-label', opts.ariaLabel);
    if (opts.disabled) trigger.disabled = true;
    if (opts.icon) trigger.appendChild(Icons.svg(opts.icon, 'dd-icon'));
    var valueEl = el('span', 'dd-value');
    trigger.appendChild(valueEl);
    trigger.appendChild(Icons.svg('caret', 'dd-caret'));
    wrap.appendChild(trigger);
    var current = opts.value == null ? '' : opts.value;
    function optionList() { return typeof opts.options === 'function' ? opts.options() : opts.options; }
    function labelFor(v) {
      var list = optionList();
      for (var i = 0; i < list.length; i++) if (!list[i].group && !list[i].separator && list[i].value === v) return list[i].short || list[i].label;
      return opts.placeholder || '—';
    }
    function paint() {
      valueEl.textContent = (opts.prefixLabel ? opts.prefixLabel + ': ' : '') + labelFor(current);
      trigger.classList.toggle('is-set', !!opts.highlightSet && current !== '' && current != null);
    }
    paint();

    function open() {
      if (trigger.getAttribute('aria-expanded') === 'true') { closeOpenPanel(); return; }
      closeOpenPanel();
      var list = optionList();
      var panel = el('div', 'dd-panel dd-panel-portal');
      panel.setAttribute('role', 'listbox');
      panel.setAttribute('aria-labelledby', trigger.id);
      var searchable = opts.searchable || list.length > 12;
      var q = null, listHost = el('div', 'dd-list');
      if (searchable) {
        q = el('input', 'input input-sm dd-search');
        q.type = 'text';
        q.placeholder = 'ابحث…';
        q.setAttribute('aria-label', 'تصفية الخيارات');
        panel.appendChild(q);
      }
      panel.appendChild(listHost);
      var buttons = [], idx = 0;
      function build(filter) {
        clear(listHost);
        buttons = [];
        var needle = filter ? Engine.normalizeLoose(filter) : '';
        list.forEach(function (o) {
          if (o.group) { if (!needle) listHost.appendChild(el('div', 'dd-group', o.group)); return; }
          if (o.separator) { if (!needle) listHost.appendChild(el('div', 'dd-sep')); return; }
          if (needle && Engine.normalizeLoose(o.label).indexOf(needle) === -1) return;
          var b = el('button', 'dd-opt');
          b.type = 'button';
          b.setAttribute('role', 'option');
          b.setAttribute('aria-selected', o.value === current ? 'true' : 'false');
          b.appendChild(Icons.svg('check', 'dd-tick'));
          if (o.icon) b.appendChild(Icons.svg(o.icon, 'dd-opt-icon'));
          var tx = el('span', 'dd-opt-text');
          tx.appendChild(el('span', null, o.label));
          if (o.hint) tx.appendChild(el('span', 'dd-opt-hint', o.hint));
          b.appendChild(tx);
          if (o.count != null) b.appendChild(el('span', 'dd-opt-count', Fmt.int(o.count)));
          if (o.tone) b.classList.add('tone-' + o.tone);
          b.addEventListener('click', function () {
            current = o.value;
            paint();
            closeOpenPanel();
            trigger.focus();
            if (opts.onChange) opts.onChange(o.value, o);
          });
          buttons.push(b);
          listHost.appendChild(b);
        });
        if (!buttons.length) listHost.appendChild(el('div', 'dd-empty', 'لا نتائج'));
      }
      build('');
      portalPanel(trigger, panel, opts.align);
      function focusAt(n, focusIt) {
        if (!buttons.length) return;
        idx = (n + buttons.length) % buttons.length;
        buttons.forEach(function (b) { b.classList.remove('active'); });
        buttons[idx].classList.add('active');
        if (focusIt !== false) buttons[idx].focus();
        else buttons[idx].scrollIntoView({ block: 'nearest' });
      }
      if (q) {
        q.addEventListener('input', function () { build(q.value); idx = 0; focusAt(0, false); });
        q.addEventListener('keydown', function (e) {
          if (e.key === 'ArrowDown') { e.preventDefault(); focusAt(idx, true); }
          else if (e.key === 'Enter') { e.preventDefault(); if (buttons[idx]) buttons[idx].click(); }
        });
      }
      panel.addEventListener('keydown', function (e) {
        if (e.target === q) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); focusAt(idx + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); if (q && idx === 0) q.focus(); else focusAt(idx - 1); }
        else if (e.key === 'Home') { e.preventDefault(); focusAt(0); }
        else if (e.key === 'End') { e.preventDefault(); focusAt(buttons.length - 1); }
        else if (e.key === 'Tab') { closeOpenPanel(); }
        else if (q && e.key.length === 1 && !e.ctrlKey && !e.metaKey) { q.focus(); }
      });
      var sel = buttons.findIndex(function (b) { return b.getAttribute('aria-selected') === 'true'; });
      setTimeout(function () {
        if (q && !coarse()) { q.focus(); focusAt(sel < 0 ? 0 : sel, false); }
        else focusAt(sel < 0 ? 0 : sel);
      }, 0);
    }
    trigger.addEventListener('click', open);
    trigger.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); }
    });
    wrap.trigger = trigger;
    wrap.setValue = function (v) { current = v; paint(); };
    wrap.getValue = function () { return current; };
    wrap.refresh = paint;
    return wrap;
  }

  function menu(trigger, items, opts) {
    opts = opts || {};
    if (trigger.getAttribute('aria-expanded') === 'true') { closeOpenPanel(); return; }
    closeOpenPanel();
    var panel = el('div', 'dd-panel dd-panel-portal dd-menu');
    panel.setAttribute('role', 'menu');
    var buttons = [];
    items.forEach(function (it) {
      if (!it) return;
      if (it.separator) { panel.appendChild(el('div', 'dd-sep')); return; }
      if (it.group) { panel.appendChild(el('div', 'dd-group', it.group)); return; }
      var b = el('button', 'dd-opt' + (it.danger ? ' tone-danger' : ''));
      b.type = 'button';
      b.setAttribute('role', it.checked != null ? 'menuitemradio' : 'menuitem');
      if (it.checked != null) { b.setAttribute('aria-checked', it.checked ? 'true' : 'false'); b.appendChild(Icons.svg('check', 'dd-tick')); if (it.checked) b.setAttribute('aria-selected', 'true'); }
      if (it.icon) b.appendChild(Icons.svg(it.icon, 'dd-opt-icon'));
      var tx = el('span', 'dd-opt-text');
      tx.appendChild(el('span', null, it.label));
      if (it.hint) tx.appendChild(el('span', 'dd-opt-hint', it.hint));
      b.appendChild(tx);
      if (it.kbd) b.appendChild(el('kbd', 'kbd', it.kbd));
      if (it.disabled) b.disabled = true;
      b.addEventListener('click', function () { closeOpenPanel(); if (it.onClick) it.onClick(); });
      buttons.push(b);
      panel.appendChild(b);
    });
    portalPanel(trigger, panel, opts.align || 'end');
    var idx = 0;
    function focusAt(n) { var enabled = buttons.filter(function (b) { return !b.disabled; }); if (!enabled.length) return; idx = (n + enabled.length) % enabled.length; enabled[idx].focus(); }
    panel.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); focusAt(idx + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); focusAt(idx - 1); }
      else if (e.key === 'Tab') closeOpenPanel();
    });
    setTimeout(function () { focusAt(0); }, 0);
  }

  function popover(trigger, buildBody, opts) {
    opts = opts || {};
    if (trigger.getAttribute('aria-expanded') === 'true') { closeOpenPanel(); return; }
    closeOpenPanel();
    var panel = el('div', 'dd-panel dd-panel-portal dd-pop');
    if (opts.width) panel.style.minWidth = opts.width;
    buildBody(panel, closeOpenPanel);
    portalPanel(trigger, panel, opts.align, opts.onClose);
    var first = panel.querySelector('input, button, [tabindex]');
    if (first) setTimeout(function () { first.focus(); }, 0);
  }

  function badge(text, tone, icon) {
    var b = el('span', 'badge badge-' + (tone || 'neutral'));
    if (icon) b.appendChild(Icons.svg(icon));
    b.appendChild(document.createTextNode(text));
    return b;
  }

  function notice(opts) {
    var n = el('div', 'notice' + (opts.tone ? ' notice-' + opts.tone : '') + (opts.compact ? ' notice-compact' : ''));
    var iconName = opts.icon || ({ ok: 'ok', warn: 'warn', danger: 'danger', accent: 'info' }[opts.tone] || 'info');
    n.appendChild(Icons.svg(iconName, 'notice-icon'));
    var body = el('div', 'notice-body');
    if (opts.title) body.appendChild(el('div', 'notice-title', opts.title));
    if (opts.text) body.appendChild(el('div', 'notice-text', opts.text));
    if (opts.children) append(body, opts.children);
    if (opts.actions && opts.actions.length) body.appendChild(append(el('div', 'notice-actions'), opts.actions));
    n.appendChild(body);
    if (opts.onDismiss) {
      var x = iconBtn('x', 'إخفاء', function () { n.remove(); opts.onDismiss(); }, 'sm');
      x.classList.add('notice-x');
      n.appendChild(x);
    }
    if (opts.tone === 'danger') n.setAttribute('role', 'alert');
    return n;
  }

  function moneyCell(piastres, opts) {
    opts = opts || {};
    var parts = Fmt.splitMoney((piastres || 0) / 100);
    var w = el('span', 'money' + (opts.size ? ' money-' + opts.size : '') + (parts.neg ? ' money-neg' : '') + (parts.zero && !opts.keepTone ? ' money-zero' : ''));
    w.appendChild(el('span', 'money-int', parts.int));
    w.appendChild(el('span', 'money-frac', parts.frac));
    if (opts.currency) w.appendChild(el('span', 'cur', 'ج.م'));
    if (opts.title) w.title = opts.title;
    return w;
  }
  function moneyEGP(value, opts) { return moneyCell(Math.round((value || 0) * 100), opts); }
  function numText(text, size) { return el('span', 'money' + (size ? ' money-' + size : ''), el('span', 'money-int', text)); }
  function dash() { return el('span', 'money-zero', '—'); }
  function delta(value) {
    if (value == null || !isFinite(value)) return dash();
    if (Math.abs(value) < 0.005) return el('span', 'money-zero', '0.00');
    var w = el('span', 'money delta ' + (value < 0 ? 'delta-neg' : 'delta-pos'));
    w.appendChild(el('span', 'delta-sign', value > 0 ? '+' : '−'));
    var parts = Fmt.splitMoney(Math.abs(value));
    w.appendChild(el('span', 'money-int', parts.int));
    w.appendChild(el('span', 'money-frac', parts.frac));
    return w;
  }
  function emptyState(title, hint, action, icon) {
    var e = el('div', 'empty-state');
    var ic = el('div', 'empty-icon');
    ic.appendChild(Icons.svg(icon || 'table'));
    e.appendChild(ic);
    e.appendChild(el('div', 'empty-state-title', title));
    if (hint) e.appendChild(el('div', 'small muted', hint));
    if (action) e.appendChild(Array.isArray(action) ? append(el('div', 'row g2 wrap center'), action) : action);
    return e;
  }

  var toastHost = null;
  function toast(message, tone, duration, action) {
    if (!toastHost) toastHost = document.getElementById('toasts');
    if (!toastHost) return null;
    if (typeof duration === 'object' && duration) { action = duration; duration = null; }
    var t = el('div', 'toast' + (tone ? ' is-' + tone : ''));
    t.setAttribute('role', tone === 'danger' ? 'alert' : 'status');
    t.appendChild(Icons.svg(tone === 'ok' ? 'ok' : (tone === 'danger' ? 'danger' : (tone === 'warn' ? 'warn' : 'info'))));
    t.appendChild(el('div', 'toast-body', message));
    var gone = false, timer = null, started = 0;
    var remaining = duration == null ? (action ? 6500 : (tone === 'danger' ? 9000 : 3800)) : duration;
    function pause() { if (!timer) return; clearTimeout(timer); timer = null; remaining -= Date.now() - started; }
    function resume() { if (!gone && !timer) { started = Date.now(); timer = setTimeout(dismiss, Math.max(1200, remaining)); } }
    function dismiss() {
      if (gone) return;
      gone = true;
      if (timer) clearTimeout(timer);
      t.classList.add('leaving');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 200);
    }
    if (action) {
      var ab = el('button', 'toast-action', action.label);
      ab.type = 'button';
      ab.addEventListener('click', function () { dismiss(); action.onClick(); });
      t.appendChild(ab);
    }
    var x = iconBtn('x', 'إغلاق', dismiss, 'sm');
    x.classList.add('toast-x');
    t.appendChild(x);
    toastHost.appendChild(t);
    while (toastHost.children.length > 3) toastHost.firstElementChild.remove();
    t.addEventListener('mouseenter', pause);
    t.addEventListener('mouseleave', resume);
    t.addEventListener('focusin', pause);
    t.addEventListener('focusout', function (e) { if (!t.contains(e.relatedTarget)) resume(); });
    resume();
    return { el: t, dismiss: dismiss };
  }

  var openModals = [];
  var bodyOverflowBefore = '';
  function modal(opts) {
    var scrim = el('div', 'modal-scrim');
    var box = el('div', 'modal' + (opts.wide ? ' modal-lg' : '') + (opts.size === 'sm' ? ' modal-sm' : '') + (opts.cls ? ' ' + opts.cls : ''));
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    var titleId = nextId('mt');
    box.setAttribute('aria-labelledby', titleId);
    var head = el('div', 'modal-head');
    var titles = el('div', 'modal-titles');
    var h = el('h2', 'modal-title', opts.title);
    h.id = titleId;
    titles.appendChild(h);
    if (opts.subtitle) titles.appendChild(el('div', 'modal-sub', opts.subtitle));
    head.appendChild(titles);
    head.appendChild(iconBtn('x', 'إغلاق', function () { close(); }));
    box.appendChild(head);
    var body = el('div', 'modal-body');
    box.appendChild(body);
    var foot = null;
    if (opts.footer !== false) { foot = el('div', 'modal-foot'); box.appendChild(foot); }
    scrim.appendChild(box);
    var lastFocus = document.activeElement;
    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      closeOpenPanel();
      var i = openModals.indexOf(handle);
      if (i >= 0) openModals.splice(i, 1);
      document.removeEventListener('keydown', onKey, true);
      function finish() {
        if (scrim.parentNode) scrim.parentNode.removeChild(scrim);
        if (!openModals.length) document.body.style.overflow = bodyOverflowBefore;
        if (lastFocus && lastFocus.focus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
        if (opts.onClose) opts.onClose();
      }
      if (reduceMotion()) finish();
      else { scrim.classList.add('leaving'); setTimeout(finish, 160); }
    }
    function onKey(e) {
      if (openModals[openModals.length - 1] !== handle) return;
      if (e.key === 'Escape' && !openPanel) { e.stopPropagation(); if (opts.dismissable !== false) close(); return; }
      if (e.key === 'Enter' && opts.onEnter && (e.ctrlKey || e.metaKey)) { e.preventDefault(); opts.onEnter(); return; }
      if (e.key !== 'Tab') return;
      var f = Array.prototype.filter.call(box.querySelectorAll('button:not(:disabled), input:not(:disabled), select, textarea, [tabindex]:not([tabindex="-1"])'), function (n) { return n.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    var downOnBackdrop = false;
    scrim.addEventListener('pointerdown', function (e) { downOnBackdrop = e.target === scrim; });
    scrim.addEventListener('click', function (e) {
      if (downOnBackdrop && e.target === scrim && opts.dismissable !== false) close();
      downOnBackdrop = false;
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(scrim);
    var handle = { scrim: scrim, box: box, body: body, foot: foot, head: head, close: close };
    if (!openModals.length) { bodyOverflowBefore = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    openModals.push(handle);
    setTimeout(function () {
      if (coarse()) { box.setAttribute('tabindex', '-1'); box.focus(); return; }
      var f = (opts.initialFocus && box.querySelector(opts.initialFocus)) || box.querySelector('.modal-body input:not(:disabled), .modal-foot .btn-primary, .modal-foot .btn-danger, button');
      if (f) f.focus();
    }, 30);
    return handle;
  }

  function confirmModal(opts) {
    var m = modal({ title: opts.title, subtitle: opts.subtitle, size: 'sm', cls: 'confirm-modal' + (opts.altLabel ? ' has-alt' : ''), dismissable: true, onClose: function () { if (opts.onCancel) opts.onCancel(); } });
    if (opts.message) m.body.appendChild(notice({ tone: opts.tone || (opts.danger ? 'danger' : 'warn'), text: opts.message }));
    if (opts.content) m.body.appendChild(opts.content);
    m.foot.appendChild(el('div', 'spacer'));
    m.foot.appendChild(btn(opts.cancelLabel || 'إلغاء', { variant: 'ghost', onClick: function () { m.close(); } }));
    if (opts.altLabel) m.foot.appendChild(btn(opts.altLabel, { onClick: function () { opts.onCancel = null; m.close(); if (opts.onAlt) opts.onAlt(); } }));
    m.foot.appendChild(btn(opts.confirmLabel || 'تأكيد', {
      variant: opts.danger ? 'danger-solid' : 'primary',
      onClick: function () { opts.onCancel = null; m.close(); if (opts.onConfirm) opts.onConfirm(); }
    }));
    return m;
  }

  var tipEl = null, tipAnchor = null, tipTimer = null;
  function dismissTip() {
    clearTimeout(tipTimer);
    if (tipEl) { tipEl.remove(); tipEl = null; }
    if (tipAnchor) tipAnchor.removeAttribute('aria-describedby');
    tipAnchor = null;
  }
  document.addEventListener('scroll', dismissTip, { passive: true, capture: true });
  document.addEventListener('pointerdown', dismissTip, { passive: true });
  function showTip(node, text) {
    dismissTip();
    if (!node.isConnected) return;
    tipEl = el('div', 'tooltip', text);
    tipEl.id = nextId('tip');
    tipEl.setAttribute('role', 'tooltip');
    node.setAttribute('aria-describedby', tipEl.id);
    tipAnchor = node;
    document.body.appendChild(tipEl);
    var r = node.getBoundingClientRect(), tr = tipEl.getBoundingClientRect();
    var top = r.top - tr.height - 8;
    if (top < 6) { top = r.bottom + 8; tipEl.classList.add('below'); }
    tipEl.style.top = top + 'px';
    tipEl.style.left = Math.max(6, Math.min(window.innerWidth - tr.width - 6, r.left + r.width / 2 - tr.width / 2)) + 'px';
  }
  function attachTip(node, text) {
    if (!text) return node;
    if (coarse()) { node.title = typeof text === 'function' ? text() : text; return node; }
    node.addEventListener('mouseenter', function () {
      clearTimeout(tipTimer);
      tipTimer = setTimeout(function () { showTip(node, typeof text === 'function' ? text() : text); }, 280);
    });
    node.addEventListener('focus', function () { if (node.matches(':focus-visible')) showTip(node, typeof text === 'function' ? text() : text); });
    node.addEventListener('mouseleave', function () { clearTimeout(tipTimer); if (tipAnchor === node) dismissTip(); });
    node.addEventListener('blur', function () { if (tipAnchor === node) dismissTip(); });
    return node;
  }

  function countUp(node, target, duration) {
    function paint(v) {
      clear(node);
      var parts = Fmt.splitMoney(v);
      node.appendChild(el('span', 'money-int', parts.int));
      node.appendChild(el('span', 'money-frac', parts.frac));
    }
    var from = node.__value || 0;
    node.__value = target;
    if (reduceMotion() || !target || from === target) { paint(target); return; }
    var start = null, dur = duration || 420;
    function frame(ts) {
      if (node.__value !== target) return;
      if (start == null) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      paint(from + (target - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      try {
        var ta = el('textarea');
        ta.value = text;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        resolve();
      } catch (e) { reject(e); }
    });
  }

  function kbd(keys) {
    var w = el('span', 'kbd-group');
    keys.split('+').forEach(function (k, i) {
      if (i) w.appendChild(document.createTextNode('+'));
      w.appendChild(el('kbd', 'kbd', k));
    });
    return w;
  }

  return {
    el: el, append: append, clear: clear, btn: btn, iconBtn: iconBtn, field: field, input: input,
    checkbox: checkbox, toggle: toggle, segmented: segmented, dropdown: dropdown, menu: menu, popover: popover, closePanel: closeOpenPanel,
    hasOpenPanel: function () { return !!openPanel; },
    badge: badge, notice: notice, moneyCell: moneyCell, money: moneyCell, moneyEGP: moneyEGP, numText: numText, delta: delta, dash: dash,
    emptyState: emptyState, toast: toast, modal: modal, confirmModal: confirmModal,
    hasOpenModal: function () { return openModals.length > 0; },
    closeAllModals: function () { openModals.slice().forEach(function (m) { m.close(); }); },
    attachTip: attachTip, dismissTip: dismissTip, countUp: countUp, nextId: nextId, copyText: copyText, kbd: kbd,
    reduceMotion: reduceMotion, coarse: coarse
  };
})();
