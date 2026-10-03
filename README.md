# قِسمة — Qisma

Fair distribution of incentive pools to people, calculated to the piastre, running entirely in the browser (Arabic, RTL). Built to stay responsive from a few rows to 1–2 million. Installable, and works fully offline after the first visit.

## Entry points
- `index.html` redirects to `qisma.html`
- `qisma.html` is the app, with 6 steps: file, columns, amounts, review, dashboard, export
- `qisma.html?selftest=1` runs the in-app self-test report
- `test.html` runs the automated harness (69 tests plus integration checks: worker compute, worker diffs, worker search, streamed import, streamed XLSX round-trip, OOXML validation, virtual grid, manifest, offline SheetJS) and logs `QISMA_TESTS` / `QISMA_PERF`
- Upload screen → "اختبار الحمل" (or Ctrl+K) generates 10k to 2M synthetic rows to measure speed on the current device

## Completed
- Six-step workflow: import (Excel, CSV, TSV, paste, JSON backup), column mapping, amounts and rules, editable review grid with undo/redo, dashboard, export center
- Piastre-exact allocation engine with conservation checks, caps, rounding steps, split or single-pool assignment
- Web Worker compute from 30,000 rows. The worker keeps its own copy of the people list, so an edit sends only the changed rows
- Search and sort run in the worker from 150,000 rows
- Streamed import in a worker: CSV/TSV parsed in 4 MB chunks with progress; Excel files over 2 MB parsed in the worker. Text files up to 1 GB
- Two row views: paginated, or a virtualized continuous scroll
- Offline Excel: SheetJS bundled locally in `vendor/`
- Streamed XLSX export above 200,000 rows, with shared strings, and automatic sheet splitting above 1,048,576 rows
- Built-in OOXML validator (`XlsxStream.validate`) that checks every written file's structure
- PWA: manifest, icon, and a service worker that caches the app and SheetJS, with an in-app "update now" prompt
- Autosave to localStorage, with IndexedDB for large sessions, plus full JSON backup/restore
- Light/dark themes, reduced motion, keyboard shortcuts, command palette

## Structure
- `css/qisma.css` holds the styles: themes, responsive layout, busy overlay, non-blocking background indicator (`.busy-soft`), virtual grid
- `js/engine.js` holds the allocation engine, wrapped as `EngineFactory()` so the same source runs on the main thread and in the worker. `EngineWorker` keeps a versioned people copy in the worker (full `sync`, then `diff` of changed positions), and runs `compute`, `search` and `sort` jobs. It also has `packPeople` / `unpackPeople` / `dehydrate` / `hydrate`
- `js/core.js` holds formatting, `Search` (`SearchFactory`), `Sorter` (`SorterFactory`), UI primitives, `Pack`, `IDB`, `Busy`, `Store` and `Pwa`
- `js/importworker.js` is the streamed import: a chunk-safe CSV state machine (quotes, escaped quotes, CRLF and multi-line cells split across chunks), encoding detection (UTF-8, falling back to Windows-1256), and Excel parsing in a worker via `importScripts` of the local SheetJS
- `js/xlsxstream.js` is the streamed XLSX writer (shared strings table, chunked sheet XML, `CompressionStream` deflate with a store fallback, ZIP with data descriptors, sheet splitting) plus the `validate` checker
- `js/data.js` handles the model, import, reports and export. `Exporter.streamSpecs` describes every report sheet as lazy row sources
- `js/app.js` is the shell, upload/mapping/amounts screens, `recomputeAsync`, `prepareView` (worker search/sort), `readFile` (worker import) and the stress generator
- `js/review.js` is the review grid, filter bar, pager, view-mode toggle and `Q.virtualRows`
- `js/views.js` covers the dashboard, export, settings, command palette (worker search for large data) and boot
- `js/selftest.js` holds the self-tests and the boot code
- `sw.js` is the service worker (cache-first for app files, network-first for pages, font caching)
- `manifest.webmanifest` and `icons/icon.svg` are for installation
- `vendor/xlsx.full.min.js` is SheetJS 0.20.3

## Performance (measured in headless Chromium)
| Task | Rows | Result |
|---|---|---|
| Engine, first compute in worker | 300,000 | 0.9–1.3 s (full sync) |
| Engine, after editing 3 rows | 300,000 | 0.24–0.38 s; sync of 3 changed rows took 6–14 ms |
| Engine, main thread vs worker | 1,000,000 | 2.0 s frozen vs 3.3 s with 49 ms longest freeze |
| Search "سلمى" | 300,000 | Worker 583 ms with 58 ms longest freeze; main thread 549 ms frozen |
| Sort by net | 300,000 (filtered view) | 22–39 ms in worker |
| CSV import, 15.9 MB | 400,000 | ≈0.8–1.0 s in worker, with progress; the main-thread parser is faster (≈0.16 s) but freezes the page and needs the whole file as one string |
| XLSX export (full report) | 210,000 | 34.8 MB, 13 sheets, 637,630 rows in 14.3 s |

The worker trades some total time for a page that keeps responding.

How it works:
- **Worker compute and diffs:** the first compute sends the whole people list as packed typed-array columns (transferred, not copied). After that, the app compares the new people array with the last one sent; if only a few rows changed (under 1/8 of rows, same ids in the same order), it sends just those rows and their positions. Otherwise it resyncs fully. A version number guards against out-of-order messages
- **Worker search and sort:** from 150,000 rows, the filter bar, column sort and command palette ask the worker first, then render. The worker builds its search index once per people version and patches it on diffs. Search results come back as typed arrays (match flags and ranks)
- **Streamed import:** the file is read in 4 MB slices with a streaming text decoder, and the CSV parser keeps its state between slices. A quote at the very end of a slice is resolved when the next slice arrives
- **Shared strings:** repeated text (departments, tiers, pool names, repeated names) is written once in `sharedStrings.xml`. On the 300k payroll sheet this saved about 5%, because unique names dominate; the gain is larger when text repeats more. Strings switch to inline after 2,000,000 unique values
- **Virtual scroll:** renders only the visible window (≈25–40 DOM rows) of any number of rows
- Over 15k rows, sessions are saved to IndexedDB as packed columns

## Verified end to end
Run in a real browser. Written files were read back with SheetJS and checked with `XlsxStream.validate`.

| Scenario | Result |
|---|---|
| Worker diffs, 300,000 rows | 1 full sync, then 1 diff of 3 rows; result identical to the main thread |
| Worker search, 300,000 rows | 28,569 hits, the same count as main-thread search |
| Worker sort | Net descending correct; name sort identical to main-thread order |
| Streamed CSV import, 400,000 rows | Identical to the main parser, including quoted commas and multi-line cells |
| CSV parser, chunk sizes 1–1000 bytes | Identical output for every split point (tests I1, I2) |
| Shared strings, payroll 300,000 rows | 285,805 unique / 857,149 refs; sum matches to the piastre |
| Validator: 300k payroll file | Valid: well-formed XML, CRCs, content types, relationships, row/column order, style and string indexes, RTL |
| Validator: full report (13 sheets) | Valid |
| Validator: corrupted input | Rejects a non-zip file and a file with one flipped byte |
| Multi-file custom export, 210,000 rows | Clicked through the real dialog: 3 files, each valid; payroll count and sum match |
| PWA over HTTPS | Service worker activated; 16 files cached, including SheetJS (951,904 bytes) |
| `test.html` | 69/69 tests, all integration checks true |

Still manual:
- **Opening the files in Microsoft Excel itself.** Excel isn't available in this environment. The validator checks the structural rules that commonly make Excel reject or "repair" a file, but it isn't Excel. Open one large export in Excel once to confirm
- **Install prompt and offline reload on a real device.** The service worker and caching were tested; the browser's install button and airplane-mode reload were not

## UI settings
- `ui.viewMode`: `pages` (default) or `scroll`. Toggle it from the pager, the scroll footer, or Settings → العرض. Printing always uses a full render

## Data and storage
- People: `{ id, code, name, job, dept, tier, daysWorked, penaltyRate, manualFactor, overrideValue, pinnedPool, excluded, notes }`
- Settings: tiers (name → value), pools (name → `{ gross, taxRate }`), options (rounding, allocation, weighting, attendance, capNet), periodDays, tierAliases, ui
- localStorage: `qisma.settings.v1`, small sessions, and a stub for large ones
- IndexedDB `qisma/kv`: the `session` key for large sessions (packed columns)
- Cache Storage: `qisma-4.1.0` (app files) and `qisma-4.1.0-fonts`
- No server, no tables, no external requests besides optional Google Fonts

## Public URLs
- None yet. Publish from the Publish tab. The service worker needs HTTPS (or localhost); over `file://` the app works but isn't installable

## Not implemented / next steps
- Build the review rows (`Reports.detailRows`) lazily from columns, so the first render at 1M+ rows doesn't allocate a million row objects
- Move filter-flag counting and group counts to the worker for 1M+ rows
- Write the streamed XLSX in the worker, so export doesn't use main-thread time
- Import the CSV straight into packed columns instead of a string grid, to cut memory for very large files
- Bump `VERSION` in `sw.js` on every release so users get the update prompt
