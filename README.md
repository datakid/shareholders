# قِسمة — Qisma

Fair distribution of incentive pools to people, calculated to the piastre, running entirely in the browser (Arabic, RTL). Built to stay responsive from a few rows to 1–2 million.

## Entry points
- `index.html` redirects to `qisma.html`
- `qisma.html` is the app, with 6 steps: file, columns, amounts, review, dashboard, export
- `qisma.html?selftest=1` runs the in-app self-test report
- `test.html` runs the automated harness (61 tests plus integration checks) and logs `QISMA_PERF` timings
- Upload screen → "اختبار الحمل" (or Ctrl+K) generates 10k to 2M synthetic rows to measure speed on the current device

## Structure
- `css/qisma.css` holds the styles: light/dark themes, responsive layout, refinement layer, busy overlay
- `js/engine.js` is the columnar allocation engine (typed arrays, O(n) remainder selection, bucketed ordering, capped warnings, lazy per-person objects)
- `js/core.js` holds formatting, search, sorting, UI primitives, `Pack` (columnar people), `IDB` (IndexedDB), `Busy` and `Store`
- `js/data.js` handles the model, import (fast CSV), reports (column-backed rows, memoized per result) and export
- `js/app.js` is the shell, the upload/mapping/amounts screens, view caches and the stress generator
- `js/review.js` is the review grid
- `js/views.js` covers the dashboard, export, settings and command palette
- `js/selftest.js` holds the self-tests and the boot code

## Performance (measured in headless Chromium)
| Rows | Engine | Load + first render | Search | Sort |
|---|---|---|---|---|
| 250,000 | 0.39 s | 1.3 s | 0.57 s | 0.10 s |
| 1,000,000 | 1.2 s | 4.8 s | 2.3 s | 0.33 s |

What makes it fast:
- The engine works on typed-array columns and never allocates per-person objects; `result.people` builds lazily only if something asks for it
- Leftover piastres go out through a histogram threshold rather than a full sort, with exact tie-breaking preserved
- Report rows read directly from the engine columns, and group/executive/special reports are memoized per result
- Filtering, sorting, flag counts and group counts are cached by signature; sorting uses typed keys and pre-ranked strings
- Single-row edits copy one array slot rather than re-mapping every row; id→position maps replace object indexes
- Undo depth shrinks as the dataset grows, to bound memory
- Over 15k rows, sessions are saved to IndexedDB as packed columns (dictionary-encoded tiers/pools, Float64 numbers); localStorage keeps only a stub
- Over 200k rows, exports switch to streamed CSV (Excel can't hold it in-browser); backups use the packed format
- Heavy operations show a non-blocking busy indicator

## Storage
- localStorage: `qisma.settings.v1`, small sessions, and a stub for large ones
- IndexedDB `qisma/kv`: the `session` key for large sessions
- No server and no tables

## Not implemented / next steps
- Web Worker offload so the UI stays interactive during multi-second computes at 1M+ rows
- Virtualized scrolling grid as an alternative to pagination
- Bundle SheetJS locally for offline Excel
- Streamed XLSX writer for full-fidelity Excel above 200k rows
