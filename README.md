# قِسمة — Qisma

Fair distribution of incentive pools to people, calculated to the piastre, running entirely in the browser (Arabic, RTL). Built to stay responsive from a few rows to 1–2 million, and works fully offline once loaded.

## Entry points
- `index.html` redirects to `qisma.html`
- `qisma.html` is the app, with 6 steps: file, columns, amounts, review, dashboard, export
- `qisma.html?selftest=1` runs the in-app self-test report
- `test.html` runs the automated harness (65 tests plus integration checks: worker parity, streamed XLSX round-trip through SheetJS, virtual grid, offline SheetJS) and logs `QISMA_TESTS` / `QISMA_PERF`
- Upload screen → "اختبار الحمل" (or Ctrl+K) generates 10k to 2M synthetic rows to measure speed on the current device

## Structure
- `css/qisma.css` holds the styles: light/dark themes, responsive layout, refinement layer, busy overlay, non-blocking background indicator (`.busy-soft`), virtual grid
- `js/engine.js` holds the columnar allocation engine, wrapped as `EngineFactory()` so the same source runs on the main thread and in a Web Worker. Also contains `EngineWorker` (Blob-URL worker, transferable columns) and `packPeople` / `unpackPeople` / `dehydrate` / `hydrate`
- `js/core.js` holds formatting, search, sorting, UI primitives, `Pack`, `IDB`, `Busy` (blocking + soft modes) and `Store`
- `js/xlsxstream.js` is the streamed XLSX writer: inline strings, chunked sheet XML, `CompressionStream('deflate-raw')` with a store fallback, a ZIP writer using data descriptors, and automatic sheet splitting above 1,048,576 rows
- `js/data.js` handles the model, import, reports and export. `Exporter.streamSpecs` describes every report sheet as lazy row sources for the streamed writer
- `js/app.js` is the shell, the upload/mapping/amounts screens, async recompute (`recomputeAsync`) and the stress generator
- `js/review.js` is the review grid, pager, view-mode toggle and the shared `Q.virtualRows` virtualizer
- `js/views.js` covers the dashboard, export (SheetJS ≤200k rows, streamed writer above), settings and command palette
- `js/selftest.js` holds the self-tests and the boot code
- `vendor/xlsx.full.min.js` is SheetJS 0.20.3, bundled locally (no CDN dependency)

## Performance (measured in headless Chromium)
| Rows | Engine | Load + first render | Search | Sort |
|---|---|---|---|---|
| 250,000 | 0.39 s (≈0.9 s round-trip in worker, UI stays live) | 1.3 s | 0.57 s | 0.10 s |
| 1,000,000 | 1.2–2.4 s | 4.8 s | 2.3 s | 0.33 s |

What makes it fast:
- From 30,000 rows up, recomputes run in a Web Worker. People go across as packed typed-array columns (transferred, not copied), and result columns come back the same way. The UI keeps responding, and a small corner indicator replaces the blocking overlay. Stale results are discarded via a generation counter. If workers are unavailable, it falls back to the main thread
- The engine works on typed-array columns and never allocates per-person objects; `result.people` builds lazily
- Leftover piastres go out through a histogram threshold rather than a full sort, with exact tie-breaking preserved
- Report rows read directly from engine columns; group/executive/special reports are memoized per result
- Filtering, sorting, flag counts and group counts are cached by signature
- "Scroll" view mode renders only the visible window (≈25–40 DOM rows) of any number of rows. Above ~15M px of scroll height the scrollbar is scaled so even 2M rows stay addressable
- Over 15k rows, sessions are saved to IndexedDB as packed columns
- Over 200k rows, Excel exports are written by the streamed XLSX writer in 2,500-row chunks, with a progress percentage, number formats, frozen header, autofilter and RTL. CSV remains the fallback if streaming fails

## UI settings
- `ui.viewMode`: `pages` (default) or `scroll`. Toggle it from the pager, the scroll footer, or Settings → العرض. It applies to both the review grid and the dashboard table. Printing always uses a full render

## Storage
- localStorage: `qisma.settings.v1`, small sessions, and a stub for large ones
- IndexedDB `qisma/kv`: the `session` key for large sessions
- No server and no tables

## Not implemented / next steps
- Run search/sort index building in the worker too, for 1M+ rows
- Keep a persistent people copy inside the worker and send only diffs on single-cell edits
- Streamed CSV/XLSX import via a worker for 100MB+ files
- Shared strings in the streamed writer, for smaller files when names repeat heavily
- Service worker for installable offline use (PWA)
