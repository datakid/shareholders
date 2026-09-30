# قِسمة — Qisma

Fair distribution of incentive pools to people, calculated to the piastre, running entirely in the browser (Arabic, RTL).

## Entry points
- `index.html` redirects to `qisma.html`
- `qisma.html` is the app, with 6 steps: file, columns, amounts, review, dashboard, export
- `qisma.html?selftest=1` runs the in-app self-test report
- `test.html` runs the automated test harness (57 engine tests plus integration checks)

## Structure
- `css/qisma.css` holds the styles (light and dark themes, responsive)
- `js/engine.js` is the allocation engine
- `js/core.js` holds formatting, UI primitives, modals, toasts and storage
- `js/data.js` handles the model, import/export and demo data
- `js/app.js` is the shell, the stepper, and the upload, mapping and amounts screens
- `js/review.js` is the review grid
- `js/views.js` covers the dashboard, export, settings and command palette
- `js/selftest.js` holds the self-tests and the boot code

## Storage
Uses browser localStorage only (`qisma.settings.v1`, session). No server or tables.

## Recent changes
- The step ribbon adapts to its width. It shows full labels, then compact pills, then only the current step's label, then numbers only. It never overflows between 320px and full desktop width.
- The phone top bar now uses a grid layout (brand, save status, actions, ribbon) so the save status can't overlap the brand.
- Confirm dialogs that have 3 actions stack full-width on phones.
- The test harness checks that the ribbon fits at 7 widths.

## Next steps
- SheetJS loads from a CDN. Bundle it locally if the app must read and write Excel files offline.
