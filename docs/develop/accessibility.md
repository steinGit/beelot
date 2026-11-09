# Accessibility improvements

## Scope

Hallmark was used for a focused accessibility polish of text contrast, keyboard
focus, and diagram disclosure semantics. BeeLot's logo, layout, typography,
button shapes, and 44-pixel touch targets remain intact. Calculations, weather
fetching, storage formats, and export behavior are unchanged.

The text contrast target is at least 4.5:1, based on
[WCAG 2.2 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
Focus visibility follows
[WCAG 2.2 Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html).
This work addresses those requirements and the requested ARIA attributes; it
does not claim complete WCAG conformance for the application.

## Changes

`assets/css/style.css` supplies shared text color tokens. Gray secondary text,
orange text highlights, olive upcoming information, and red error/destructive
text retain their color families with darker values. Red filled buttons also use
a darker background for their existing white labels. FAQ hover text, inactive
settings rows, and application-owned disabled address buttons use the shared
tokens. The green location buttons and yellow diagram buttons are unchanged.

Dynamic information and empty/error messages in `information.js` and
`plotUpdater.js` reference the same tokens. Only presentation strings and style
assignments changed in those modules.

The shared `:focus-visible` rule now draws an immediate 3-pixel dark outline on
every focused element, including inline links, tooltip anchors, and elements
with `tabindex`. Inputs, selects, the location panel, and the table scroll region
use an inset outline to keep it visible at scroll-container and viewport edges.
The native date widget also uses `:focus-within`: Chrome can focus its internal
calendar button without applying `:focus-visible` to the outer input. Both cases
use the same outline. Conflicting settings-specific outline rules were removed.

The GTS and temperature buttons in `index.html` have `aria-controls` pointing to
their existing containers and initial `aria-expanded="false"`. A small helper in
`main.js` updates their expanded states after opening/closing, restoring saved
visibility, and entering/leaving comparison mode. Existing visibility classes,
button text, calculations, and persistence behavior are preserved.

The chart's neutral prediction-axis background changes from `#303030` to
`#242424`. This raises the contrast of the existing red Today label from 4.20:1
to 4.94:1. The red label, red Today grid line, queen colors, temperature colors,
data-series colors, fills, and forecast dash patterns are unchanged.

## Contrast measurements

Ratios use computed foreground and composited background colors, relative sRGB
luminance, and unrounded values for pass/fail. The table rounds only the displayed
results. All listed UI combinations exceed 4.5:1 after the change.

| Text and background | Before | After |
| --- | ---: | ---: |
| Version on the gray header | 3.47:1 | 5.04:1 |
| Empty-location text on the cream panel | 3.85:1 | 5.60:1 |
| Footer on white | 3.95:1 | 5.74:1 |
| Navigation hover on the gray header | 2.21:1 | 5.23:1 |
| Today information on the cream panel | 2.45:1 | 5.81:1 |
| Upcoming information on the cream panel | 4.46:1 | 5.94:1 |
| RESET label on its native button background | 3.48:1 | 6.42:1 |
| White label on a destructive button | 4.00:1 | 6.48:1 |
| FAQ summary hover on its near-white background | 2.50:1 | 5.91:1 |
| Red Today label on the dark chart axis | 4.20:1 | 4.94:1 |

## Chrome and keyboard verification

Tested on 2026-11-03 with Google Chrome 156.0.8078.73, an isolated profile,
the browser sandbox enabled, a local HTTP server, a 900-pixel viewport height,
and device scale factor 1. A temporary Node.js harness used the Chrome DevTools
Protocol without adding dependencies.

At every width, contrast checks covered the main page, navigation hover, both
diagram disclosures, address dialog, deterministic information fixtures,
expanded settings, RESET hover, expanded FAQ, FAQ hover, and the legal page.

| Viewport | Scenarios passed | DOM text combinations below 4.5:1 | Horizontal page overflow |
| ---: | ---: | ---: | --- |
| 320 px | 11 / 11 | 0 | None |
| 375 px | 11 / 11 | 0 | None |
| 768 px | 11 / 11 | 0 | None |
| 1920 px | 11 / 11 | 0 | None |

Native Tab, Shift+Tab, and Enter events were used to verify:

- Focus remains clearly outlined while traversing navigation, location controls,
  date segments and the calendar button, diagram controls, and settings fields.
- Enter opens and closes the GTS and temperature diagrams; `aria-expanded`
  agrees with the controlled container's visibility.
- Tab enters an expanded GTS panel and skips its controls after collapse.
- The address dialog can be opened and closed with Enter, keeps Tab navigation
  inside the dialog, and restores focus to its opener when closed.
- Settings and FAQ disclosures open with Enter. The plant field's outline is
  dark, inset, and 3 pixels wide instead of the previous 1-pixel orange outline.

A real Chart.js curve generated from local fixture data was rendered at all
four widths. Its Today text color and data-series color remained unchanged,
and the neutral axis background used the new value. Mobile and desktop focus,
information, and chart screenshots were inspected. No browser runtime
exceptions were recorded.

DOM contrast checks cover visible text on solid/composited CSS backgrounds.
Text embedded in existing screenshot/image assets, map tiles, and browser-owned
picker/option popups are outside that automated measurement. Inactive native
controls were excluded from the minimum-text check; the application-owned
disabled address button colors were improved separately.

## Regression tests

`tests/plotAccessibility.test.js` adds seven cases for saved open/closed states,
opening and closing each diagram without recalculating data, and comparison-mode
transitions. The chart regression now tests the Today label's contrast directly
while retaining assertions for the original red label and red grid line.
Existing queen-color, forecast-dash, calculation, information, export, and focus
tests continue to pass.

```bash
npm test -- --runInBand tests/plotAccessibility.test.js tests/mainPredictionControls.test.js tests/locationSync.test.js tests/information.test.js tests/plotUpdaterErgebnis.test.js tests/plotUpdaterComparison.test.js tests/dialogFocus.test.js tests/settingsAccessibility.test.js tests/settingsInteractions.test.js tests/responsiveCss.test.js tests/mainPlotExport.test.js tests/charts.test.js
npm run lint
git diff --check
```

Results: all 12 suites and 74 tests passed; ESLint and whitespace checks passed.

Hallmark's static preservation check retained 17 recorded links, 14 named
fields, and one script hook. Its integrated renderer could not run because
`puppeteer-core` was unavailable; the separate Chrome checks above were used.
Existing Hallmark findings outside this focused change remain, so a complete
Hallmark pass is not claimed.

## Repeat the manual checks

Serve the repository root with `python3 -m http.server 8000 --bind 127.0.0.1`.
In Chrome, repeat the four viewport widths above. Use Tab and Enter to open and
close each diagram, then inspect the button's `aria-expanded` and `aria-controls`
attributes. Tab through both open and closed panels, the address dialog, the
native date widget, a settings plant field, and FAQ summaries. Check focus at
the edges of the horizontally scrolling table. Verify the color pairs above
using computed styles rather than antialiased screenshot pixels.

No commit was created.
