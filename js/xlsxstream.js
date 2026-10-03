var XlsxStream = (function () {
  'use strict';
  var MAX_ROWS = 1048576;
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crcUpdate(crc, bytes) {
    var c = crc ^ 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  var enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  function canDeflate() {
    if (typeof CompressionStream === 'undefined') return false;
    try { new CompressionStream('deflate-raw'); return true; } catch (e) { return false; }
  }
  function available() { return !!enc && typeof Blob !== 'undefined'; }

  var INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;
  var ESC = /[&<>"]/g, ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  function esc(s) {
    s = String(s);
    if (INVALID.test(s)) { INVALID.lastIndex = 0; s = s.replace(INVALID, ''); }
    INVALID.lastIndex = 0;
    return s.replace(ESC, function (ch) { return ESC_MAP[ch]; });
  }
  var COLS = [];
  function colName(c) {
    if (COLS[c]) return COLS[c];
    var s = '', n = c + 1;
    while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    COLS[c] = s;
    return s;
  }

  var FMT_STYLE = { '#,##0.00': 2, '#,##0.0000': 3, '0.00%': 4, '#,##0': 5 };
  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.0000"/></numFmts>' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF5F3EC"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="7">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  function uniqueName(name, used) {
    var base = String(name || 'ورقة').slice(0, 31), s = base, n = 2;
    while (used[s.toLowerCase()]) { var suf = ' (' + n + ')'; s = base.slice(0, Math.max(1, 31 - suf.length)) + suf; n++; }
    used[s.toLowerCase()] = true;
    return s;
  }

  function normalize(sheets) {
    var used = Object.create(null), out = [];
    sheets.forEach(function (sh) {
      var o = sh.opts || {};
      var headerRows = o.headerRows == null ? 1 : o.headerRows;
      var head, count, rowAt, tail;
      if (sh.rows) {
        head = sh.rows.slice(0, headerRows);
        var body = sh.rows.slice(headerRows);
        count = body.length; rowAt = function (i) { return body[i]; }; tail = [];
      } else {
        head = [sh.header]; count = sh.count; rowAt = sh.rowAt; tail = sh.tail || [];
        headerRows = 1;
      }
      var room = MAX_ROWS - head.length - tail.length;
      var parts = Math.max(1, Math.ceil(count / room));
      for (var p = 0; p < parts; p++) {
        var from = p * room, to = Math.min(count, from + room);
        out.push({
          name: uniqueName(parts > 1 ? sh.name + ' ' + (p + 1) : sh.name, used),
          head: head, headerRows: headerRows, from: from, to: to, rowAt: rowAt,
          tail: p === parts - 1 ? tail : [], opts: o
        });
      }
    });
    return out;
  }

  function autoWidths(sh) {
    if (sh.opts.widths) return sh.opts.widths;
    var w = [], probe = [];
    sh.head.forEach(function (r) { probe.push(r); });
    for (var i = sh.from; i < Math.min(sh.to, sh.from + 400); i++) probe.push(sh.rowAt(i));
    probe.forEach(function (r) {
      (r || []).forEach(function (v, c) {
        var len = String(v == null ? '' : v).length;
        if (!(w[c] >= len)) w[c] = len;
      });
    });
    return w.map(function (x) { return Math.min(44, Math.max(8, x || 0) + 2); });
  }

  function cellXml(r, c, v, style) {
    if (v == null || v === '') return '';
    var ref = colName(c) + r;
    if (typeof v === 'number') {
      if (!isFinite(v)) return '';
      return '<c r="' + ref + '"' + (style ? ' s="' + style + '"' : '') + '><v>' + v + '</v></c>';
    }
    if (typeof v === 'boolean') return '<c r="' + ref + '" t="b"' + (style ? ' s="' + style + '"' : '') + '><v>' + (v ? 1 : 0) + '</v></c>';
    var s = String(v);
    var sp = /^\s|\s$/.test(s) ? ' xml:space="preserve"' : '';
    return '<c r="' + ref + '" t="inlineStr"' + (style ? ' s="' + style + '"' : '') + '><is><t' + sp + '>' + esc(s) + '</t></is></c>';
  }

  function rowXml(rIdx, row, sh, kind) {
    if (!row || !row.length) return '<row r="' + rIdx + '"/>';
    var out = '<row r="' + rIdx + '">', formats = sh.opts.formats || {}, cf = sh.opts.cellFmt;
    for (var c = 0; c < row.length; c++) {
      var v = row[c], style = 0;
      if (kind === 'header') style = 1;
      else if (kind === 'title') style = 6;
      else if (typeof v === 'number') {
        var f = (cf && cf(rIdx - 1, c)) || formats[c];
        style = f ? (FMT_STYLE[f] || 0) : 0;
      } else if (kind === 'total') style = 6;
      out += cellXml(rIdx, c, v, style);
    }
    return out + '</row>';
  }

  function maxWidth(sh) {
    var m = 0;
    sh.head.forEach(function (r) { if (r && r.length > m) m = r.length; });
    if (sh.to > sh.from) { var r0 = sh.rowAt(sh.from); if (r0 && r0.length > m) m = r0.length; }
    return Math.max(1, m);
  }

  function sheetChunks(sh, onRows) {
    var lastHead = sh.head.length, width = maxWidth(sh), total = lastHead + (sh.to - sh.from) + sh.tail.length;
    var widths = autoWidths(sh);
    var frozen = lastHead > 0 && lastHead <= 8;
    var start = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<dimension ref="A1:' + colName(width - 1) + Math.max(1, total) + '"/>' +
      '<sheetViews><sheetView rightToLeft="1" workbookViewId="0"' + (sh.index === 0 ? ' tabSelected="1"' : '') + '>' +
      (frozen ? '<pane ySplit="' + lastHead + '" topLeftCell="A' + (lastHead + 1) + '" activePane="bottomLeft" state="frozen"/>' : '') +
      '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>';
    if (widths.length) {
      start += '<cols>';
      widths.forEach(function (w, i) { start += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; });
      start += '</cols>';
    }
    start += '<sheetData>';
    var filter = sh.opts.autofilter !== false && lastHead > 0 && sh.to > sh.from;
    sh.filterRef = filter ? 'A' + lastHead + ':' + colName(width - 1) + (lastHead + (sh.to - sh.from)) : null;
    var phase = 0, i = sh.from, BATCH = 2500;
    return function next() {
      if (phase === 0) {
        phase = 1;
        var s = start;
        for (var h = 0; h < sh.head.length; h++) s += rowXml(h + 1, sh.head[h], sh, h === sh.head.length - 1 ? 'header' : 'title');
        return s;
      }
      if (phase === 1) {
        if (i < sh.to) {
          var end = Math.min(sh.to, i + BATCH), parts = new Array(end - i);
          for (var k = i; k < end; k++) parts[k - i] = rowXml(lastHead + 1 + (k - sh.from), sh.rowAt(k), sh, 'body');
          if (onRows) onRows(end - i);
          i = end;
          return parts.join('');
        }
        phase = 2;
        var t = '', base = lastHead + (sh.to - sh.from);
        for (var z = 0; z < sh.tail.length; z++) t += rowXml(base + 1 + z, sh.tail[z], sh, 'total');
        t += '</sheetData>';
        if (sh.filterRef) t += '<autoFilter ref="' + sh.filterRef + '"/>';
        return t + '</worksheet>';
      }
      return null;
    };
  }

  function u16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
  function u32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }
  function dosTime(d) {
    var t = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var dt = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time: t, date: dt };
  }
  function yieldTick() { return new Promise(function (r) { setTimeout(r, 0); }); }

  function ZipWriter() {
    this.parts = [];
    this.entries = [];
    this.offset = 0;
    this.deflate = canDeflate();
    this.stamp = dosTime(new Date());
  }
  ZipWriter.prototype.push = function (u8) { this.parts.push(u8); this.offset += u8.length; };
  ZipWriter.prototype.addEntry = function (name, nextChunk) {
    var self = this, nameBytes = enc.encode(name), method = this.deflate ? 8 : 0;
    var headerOffset = this.offset;
    var lh = [].concat(u32(0x04034b50), u16(20), u16(0x0808), u16(method), u16(this.stamp.time), u16(this.stamp.date), u32(0), u32(0), u32(0), u16(nameBytes.length), u16(0));
    var h = new Uint8Array(lh.length + nameBytes.length);
    h.set(lh, 0); h.set(nameBytes, lh.length);
    this.push(h);
    var crc = 0, usize = 0, csize = 0, lastYield = Date.now();
    function finish() {
      if (usize > 0xFFFFFFFF || self.offset > 0xFFFFFFFF) throw new Error('الملف أكبر من 4 جيجابايت — قسّم التصدير');
      self.push(new Uint8Array([].concat(u32(0x08074b50), u32(crc), u32(csize), u32(usize))));
      self.entries.push({ nameBytes: nameBytes, crc: crc, csize: csize, usize: usize, offset: headerOffset, method: method });
    }
    function maybeYield() {
      if (Date.now() - lastYield > 40) { lastYield = Date.now(); return yieldTick(); }
      return null;
    }
    if (!this.deflate) {
      return (function loop() {
        for (;;) {
          var s = nextChunk();
          if (s == null) { finish(); return Promise.resolve(); }
          if (!s) continue;
          var b = enc.encode(s);
          crc = crcUpdate(crc, b); usize += b.length; csize += b.length;
          self.push(b);
          var y = maybeYield();
          if (y) return y.then(loop);
        }
      })();
    }
    var cs = new CompressionStream('deflate-raw');
    var writer = cs.writable.getWriter(), reader = cs.readable.getReader();
    var reading = (function pump() {
      return reader.read().then(function (r) {
        if (r.done) return;
        csize += r.value.length;
        self.push(r.value);
        return pump();
      });
    })();
    function writeLoop() {
      var s = nextChunk();
      if (s == null) return writer.close();
      var b = enc.encode(s);
      crc = crcUpdate(crc, b); usize += b.length;
      return writer.write(b).then(function () {
        var y = maybeYield();
        return y ? y.then(writeLoop) : writeLoop();
      });
    }
    return Promise.all([writeLoop(), reading]).then(finish);
  };
  ZipWriter.prototype.addText = function (name, text) {
    var done = false;
    return this.addEntry(name, function () { if (done) return null; done = true; return text; });
  };
  ZipWriter.prototype.finish = function (mime) {
    var self = this, cdStart = this.offset, cdSize = 0;
    this.entries.forEach(function (e) {
      var c = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0808), u16(e.method), u16(self.stamp.time), u16(self.stamp.date), u32(e.crc), u32(e.csize), u32(e.usize), u16(e.nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(e.offset));
      var b = new Uint8Array(c.length + e.nameBytes.length);
      b.set(c, 0); b.set(e.nameBytes, c.length);
      self.push(b); cdSize += b.length;
    });
    this.push(new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(this.entries.length), u16(this.entries.length), u32(cdSize), u32(cdStart), u16(0))));
    return new Blob(this.parts, { type: mime });
  };

  function quoteSheet(n) { return "'" + n.replace(/'/g, "''") + "'"; }

  function write(sheets, meta, onProgress) {
    if (!available()) return Promise.reject(new Error('المتصفح لا يدعم الكتابة المتدفقة'));
    var list = normalize(sheets || []);
    if (!list.length) return Promise.reject(new Error('لا أوراق للتصدير'));
    meta = meta || {};
    var totalRows = 0, doneRows = 0;
    list.forEach(function (sh, i) { sh.index = i; totalRows += sh.to - sh.from; });
    function onRows(n) { doneRows += n; if (onProgress && totalRows) onProgress(Math.min(1, doneRows / totalRows)); }
    var zip = new ZipWriter();
    var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      list.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') +
      '</Types>';
    var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>';
    var iso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    var core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + esc(meta.title || 'Qisma') + '</dc:title><dc:creator>' + esc(meta.author || 'Qisma') + '</dc:creator>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + iso + '</dcterms:created></cp:coreProperties>';
    var wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      list.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
      '<Relationship Id="rId' + (list.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';

    var chain = zip.addText('[Content_Types].xml', ct)
      .then(function () { return zip.addText('_rels/.rels', rels); })
      .then(function () { return zip.addText('docProps/core.xml', core); })
      .then(function () { return zip.addText('xl/styles.xml', STYLES); })
      .then(function () { return zip.addText('xl/_rels/workbook.xml.rels', wbRels); });
    list.forEach(function (sh, i) {
      chain = chain.then(function () { return zip.addEntry('xl/worksheets/sheet' + (i + 1) + '.xml', sheetChunks(sh, onRows)); });
    });
    return chain.then(function () {
      var names = '';
      list.forEach(function (sh, i) {
        if (sh.filterRef) {
          var ref = sh.filterRef.split(':').map(function (x) { return x.replace(/^([A-Z]+)(\d+)$/, '$$$1$$$2'); }).join(':');
          names += '<definedName name="_xlnm._FilterDatabase" localSheetId="' + i + '" hidden="1">' + esc(quoteSheet(sh.name)) + '!' + ref + '</definedName>';
        }
      });
      var wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
        list.map(function (s, i) { return '<sheet name="' + esc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') +
        '</sheets>' + (names ? '<definedNames>' + names + '</definedNames>' : '') + '</workbook>';
      return zip.addText('xl/workbook.xml', wb);
    }).then(function () {
      if (onProgress) onProgress(1);
      return { blob: zip.finish('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), sheets: list.length, rows: totalRows, compressed: zip.deflate };
    });
  }

  return { write: write, available: available, canDeflate: canDeflate, crc32: function (b) { return crcUpdate(0, b); }, MAX_ROWS: MAX_ROWS, _normalize: normalize };
})();
