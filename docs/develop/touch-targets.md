# Touch target improvements

## Scope and implementation

Hallmark was used for a focused accessibility polish, starting with date
navigation. The minimum target size is 44 by 44 CSS pixels on desktop and mobile.
The existing colors, fonts, symbols, borders, radii, and button shadows are kept.
Controls and table rows gain the space needed for the larger targets.

- `assets/css/style.css` defines `--touch-target-size: 44px` for buttons, native
  fields, selects, FAQ disclosures, and navigation links. Checkbox and radio
  labels provide the larger target while their native indicator stays small.
  New focus outlines use a dark token so they remain visible around buttons
  with white text. Narrow header navigation uses smaller gaps to fit its targets.
- `index.html` groups the date field and its three actions. The group wraps on
  narrow screens while retaining the existing order, IDs, values, and symbols.
  Its accessible names are "Datum für GTS und imkerliche Informationen",
  "Nächster Tag", "Vorheriger Tag", and "Heute anzeigen".
- The shared header and all four fallback headers name the logo link
  "BeeLot-Startseite" and the settings link "Einstellungen öffnen". Map and
  address close buttons have distinct, contextual accessible names.
- `assets/css/index.css` allows dialog action rows to wrap. The map uses a
  flexible column layout so its larger toolbar leaves the remaining space for
  the map. The `!important` display rule specifically overrides the existing
  controller's inline `display: block`; controller code is unchanged. Map zoom
  and popup close controls also receive the minimum target size.
- `assets/js/settings.js` only adds a native label around each generated row
  checkbox. Existing click handlers, data processing, persistence, and row
  updates are unchanged. `assets/css/einstellungen.css` keeps the checkbox
  centered inside that label.
- The footer participates in normal document flow so its larger link target
  cannot cover date or form controls while scrolling.

The minimum applies to standalone controls and checkbox/radio label targets.
Application calculations, fetching, exports, date handling, and storage formats
are unchanged. No dependencies were added.

This follows the [mobile overflow correction](mobile-overflow.md). This change
intentionally increases control spacing on both desktop and mobile; the earlier
pixel-identical desktop comparison describes the overflow-only change.

## Chrome verification

Tested on 2026-11-03 in Google Chrome 156.0.8078.73, using an isolated profile,
the browser sandbox, a local HTTP server, a 900 CSS pixel viewport height, and
device scale factor 1. A temporary Node.js harness used the Chrome DevTools
Protocol without additional packages.

At each width, seven scenarios were measured and captured: the initial main
page, date navigation, diagram controls, address dialog, map dialog, expanded
settings, and the FAQ with all disclosures open. The scenarios used an
unconfigured weather location; diagram controls were checked without live curves.

| Viewport width | Available page width | Scenarios passed | Undersized standalone controls / label targets | Horizontal page overflow |
| ---: | ---: | ---: | ---: | --- |
| 320 | 305 | 7 / 7 | 0 | None |
| 375 | 360 | 7 / 7 | 0 | None |
| 768 | 753 | 7 / 7 | 0 | None |
| 1920 | 1905 | 7 / 7 | 0 | None |

The 15-pixel difference is Chrome's vertical scrollbar. Minimum-size checks use
the input's associated label for checkboxes and radio buttons, and the control's
own bounding rectangle for other standalone controls. This avoids confusing the
native indicator size with its clickable area.

| Date control | Before | After, at every tested width |
| --- | ---: | ---: |
| Date field | 109.33 by 21.33 px | 109.33 by 44 px |
| Next day | 23.80 by 21 px | 44 by 44 px |
| Previous day | 20.45 by 21 px | 44 by 44 px |
| Today | 49.36 by 21 px | 49.36 by 44 px |

Additional checks at every width:

- Touch events three pixels inside the date buttons' top-left corners advanced
  February 28, 2024 to February 29 and March 1, moved back to February 29, and
  returned to the current local date through Today.
- Chrome's accessibility tree exposed all three descriptive date action names.
- Real Enter and Space key events activated the focused date buttons, and a
  visible focus outline was present.
- Touching the blank corner of the first row checkbox label toggled its value
  once; touching the replacement label restored it. The small checkbox glyph
  was not the touch point.
- FAQ images remained within their containers. The table retained its local
  horizontal scroll area. Narrow and desktop screenshots were inspected.
- No browser runtime exceptions were recorded.

## Automated regression checks

`tests/mainPredictionControls.test.js` now covers the named actions across leap
days and year boundaries, returning to Today, preserving the date field label,
the existing plus/minus shortcuts, and exactly one refresh per action.
`tests/settingsAccessibility.test.js` verifies label activation without a double
toggle and without changing the stored row's other values.

```bash
npm test -- --runInBand tests/mainPredictionControls.test.js tests/settingsAccessibility.test.js tests/settingsInteractions.test.js tests/responsiveCss.test.js tests/deploymentCompatibility.test.js tests/pageFragments.test.js tests/dialogFocus.test.js tests/keyboardShortcuts.test.js tests/locationTabNavigation.test.js tests/mainPlotExport.test.js
npm run lint
git diff --check
```

Results: 10 suites and 48 tests passed; ESLint and whitespace validation passed.

Hallmark's static preservation check retained 17 links, 14 named fields, and
one recorded script hook. Its integrated renderer was unavailable because
`puppeteer-core` was not installed, so Chrome verification ran separately. The
complete Hallmark scan still reports existing design findings and a required
CSS stamp; this focused change does not claim a complete Hallmark pass.

## Repeat the browser checks

Serve the repository root with `python3 -m http.server 8000 --bind 127.0.0.1`.
In Chrome, use the four viewport widths above and open the main page, dialogs,
settings sections, and FAQ disclosures. Verify the target sizes and independent
table scrolling, then repeat the date and checkbox touch checks. Use keyboard
Tab, Enter, Space, plus, and minus to check focus and activation. Confirm that
`document.documentElement.scrollWidth` does not exceed
`document.documentElement.clientWidth` and that adjacent targets do not overlap.

No commit was created.
