var ImportWorker = (function () {
  'use strict';
  var CHUNK = 4 * 1024 * 1024;

  function CsvStream(delimiter) {
    this.D = delimiter ? delimiter.charCodeAt(0) : 0;
    this.rows = [];
    this.row = [];
    this.cell = '';
    this.inQuote = false;
    this.afterQuote = false;
    this.filled = false;
    this.pendingCR = false;
    this.started = false;
    this.headSample = '';
  }
  CsvStream.prototype.detect = function (text) {
    var counts = { ',': 0, ';': 0, '\t': 0 }, quoted = false;
    for (var h = 0; h < text.length && (quoted || text[h] !== '\n'); h++) {
      if (text[h] === '"') { if (quoted && text[h + 1] === '"') h++; else quoted = !quoted; }
      else if (!quoted && Object.prototype.hasOwnProperty.call(counts, text[h])) counts[text[h]]++;
    }
    var d = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];
    this.D = d.charCodeAt(0);
  };
  CsvStream.prototype.endCell = function () {
    var c = this.cell;
    this.row.push(c);
    if (!this.filled && c !== '' && c.trim() !== '') this.filled = true;
    this.cell = '';
    this.afterQuote = false;
  };
  CsvStream.prototype.endRow = function () {
    this.endCell();
    if (this.filled) this.rows.push(this.row);
    this.row = [];
    this.filled = false;
  };
  CsvStream.prototype.push = function (text, last) {
    if (!this.started) {
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      this.headSample += text;
      if (!this.D) {
        if (this.headSample.indexOf('\n') === -1 && !last && this.headSample.length < 1048576) return;
        this.detect(this.headSample);
      }
      text = this.headSample;
      this.headSample = '';
      this.started = true;
    }
    var D = this.D, n = text.length, i = 0;
    if (this.pendingCR) { this.pendingCR = false; if (text.charCodeAt(0) === 10) i = 1; }
    while (i < n) {
      if (this.inQuote) {
        var q = text.indexOf('"', i);
        if (q === -1) { this.cell += text.slice(i); i = n; break; }
        this.cell += text.slice(i, q);
        if (q + 1 >= n) {
          if (last) { this.inQuote = false; this.afterQuote = true; i = n; break; }
          this.cell += '\u0000QQ';
          i = n; break;
        }
        if (text.charCodeAt(q + 1) === 34) { this.cell += '"'; i = q + 2; continue; }
        this.inQuote = false; this.afterQuote = true; i = q + 1;
        continue;
      }
      var c = text.charCodeAt(i);
      if (c === 34 && this.cell === '' && !this.afterQuote) { this.inQuote = true; i++; continue; }
      if (c === D) { this.endCell(); i++; continue; }
      if (c === 13) { this.endRow(); i++; if (i >= n) this.pendingCR = true; else if (text.charCodeAt(i) === 10) i++; continue; }
      if (c === 10) { this.endRow(); i++; continue; }
      var s = i;
      while (i < n) { var u = text.charCodeAt(i); if (u === D || u === 10 || u === 13 || (u === 34 && i === s && this.cell === '')) break; i++; }
      if (i === s) { this.cell += text[i]; i++; } else this.cell += text.slice(s, i);
    }
    if (last) {
      if (this.cell !== '' || this.row.length) this.endRow();
    }
  };
  CsvStream.prototype.fixSplitQuote = function (nextText) {
    if (this.cell.slice(-3) !== '\u0000QQ') return nextText;
    this.cell = this.cell.slice(0, -3);
    if (nextText.charCodeAt(0) === 34) { this.cell += '"'; return nextText.slice(1); }
    this.inQuote = false; this.afterQuote = true;
    return nextText;
  };

  function workerBody() {
    function decoderFor(sample) {
      try { new TextDecoder('utf-8', { fatal: true }).decode(sample, { stream: true }); return new TextDecoder('utf-8'); }
      catch (e) { try { return new TextDecoder('windows-1256'); } catch (e2) { return new TextDecoder('utf-8'); } }
    }
    function readCsv(file, id) {
      var total = file.size, offset = 0, parser = new CsvStream(), dec = null, lastPost = 0;
      function step() {
        if (offset >= total) {
          var tail = parser.fixSplitQuote(dec ? dec.decode() : '');
          parser.push(tail, true);
          self.postMessage({ id: id, ok: true, res: { sheets: [{ name: '', grid: parser.rows }], bytes: total } });
          return;
        }
        var end = Math.min(total, offset + CHUNK);
        file.slice(offset, end).arrayBuffer().then(function (buf) {
          var bytes = new Uint8Array(buf);
          if (!dec) dec = decoderFor(bytes.subarray(0, Math.min(bytes.length, 65536)));
          offset = end;
          var text = dec.decode(bytes, { stream: offset < total });
          text = parser.fixSplitQuote(text);
          parser.push(text, false);
          var now = Date.now();
          if (now - lastPost > 120) { lastPost = now; self.postMessage({ id: id, progress: offset / total, rows: parser.rows.length }); }
          step();
        }).catch(function (e) { self.postMessage({ id: id, ok: false, error: String(e && e.message || e) }); });
      }
      step();
    }
    function readXlsx(file, id) {
      self.postMessage({ id: id, progress: 0.05, stage: 'read' });
      file.arrayBuffer().then(function (buf) {
        self.postMessage({ id: id, progress: 0.35, stage: 'parse' });
        var wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true, dense: true, cellHTML: false, cellFormula: false, cellStyles: false });
        var sheets = [];
        wb.SheetNames.forEach(function (n, k) {
          self.postMessage({ id: id, progress: 0.6 + 0.35 * (k / Math.max(1, wb.SheetNames.length)), stage: 'sheet' });
          var grid = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, blankrows: false, defval: '', raw: true });
          for (var r = 0; r < grid.length; r++) {
            var row = grid[r];
            if (!row) continue;
            for (var c = 0; c < row.length; c++) if (row[c] instanceof Date) row[c] = row[c].toISOString().slice(0, 10);
          }
          if (grid.length) sheets.push({ name: n, grid: grid });
        });
        self.postMessage({ id: id, ok: true, res: { sheets: sheets, bytes: file.size } });
      }).catch(function (e) { self.postMessage({ id: id, ok: false, error: String(e && e.message || e) }); });
    }
    self.onmessage = function (e) {
      var m = e.data;
      try {
        if (m.kind === 'xlsx') {
          if (typeof XLSX === 'undefined') { try { importScripts(m.xlsxUrl); } catch (err) { self.postMessage({ id: m.id, ok: false, error: 'xlsx-unavailable' }); return; } }
          readXlsx(m.file, m.id);
        } else readCsv(m.file, m.id);
      } catch (err) { self.postMessage({ id: m.id, ok: false, error: String(err && err.message || err) }); }
    };
  }

  var worker = null, failed = false, seq = 0, pending = Object.create(null);
  function supported() {
    return !failed && typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof Blob.prototype.arrayBuffer === 'function' && typeof TextDecoder !== 'undefined';
  }
  function ensure() {
    if (worker) return worker;
    if (!supported()) return null;
    try {
      var src = 'var CHUNK=' + CHUNK + ';\n' + CsvStream.toString() + '\n' +
        ['detect', 'endCell', 'endRow', 'push', 'fixSplitQuote'].map(function (k) { return 'CsvStream.prototype.' + k + '=' + CsvStream.prototype[k].toString() + ';'; }).join('\n') +
        '\n(' + workerBody.toString() + ')();';
      worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      worker.onmessage = function (e) {
        var m = e.data, p = pending[m.id];
        if (!p) return;
        if (m.progress != null && m.ok == null) { if (p.onProgress) p.onProgress(m.progress, m); return; }
        delete pending[m.id];
        if (m.ok) p.resolve(m.res); else p.reject(new Error(m.error));
      };
      worker.onerror = function (e) {
        failed = true;
        Object.keys(pending).forEach(function (k) { pending[k].reject(new Error((e && e.message) || 'import-worker-error')); delete pending[k]; });
        try { worker.terminate(); } catch (x) {}
        worker = null;
        if (e && e.preventDefault) e.preventDefault();
      };
    } catch (err) { failed = true; worker = null; }
    return worker;
  }
  function xlsxUrl() {
    var s = document.querySelector('script[src*="xlsx.full.min.js"]');
    return s ? new URL(s.getAttribute('src'), location.href).href : new URL('vendor/xlsx.full.min.js', location.href).href;
  }
  function read(file, kind, onProgress) {
    var w = ensure();
    if (!w) return Promise.reject(new Error('no-worker'));
    var id = ++seq;
    return new Promise(function (resolve, reject) {
      pending[id] = { resolve: resolve, reject: reject, onProgress: onProgress };
      try { w.postMessage({ id: id, kind: kind, file: file, xlsxUrl: kind === 'xlsx' ? xlsxUrl() : null }); }
      catch (err) { delete pending[id]; reject(err); }
    });
  }
  function parseText(text, chunkSize) {
    var p = new CsvStream(), size = chunkSize || text.length || 1;
    for (var i = 0; i < text.length; i += size) {
      var part = p.fixSplitQuote(text.slice(i, i + size));
      p.push(part, false);
    }
    p.push(p.fixSplitQuote(''), true);
    return p.rows;
  }
  return { read: read, supported: supported, parseText: parseText, CHUNK: CHUNK, terminate: function () { if (worker) { worker.terminate(); worker = null; } } };
})();
