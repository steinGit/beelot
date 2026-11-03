# Mobile overflow correction

## Scope

Hallmark was used for a focused correction of horizontal overflow on the settings
and FAQ pages. The existing desktop layout, application logic, text, table
columns, image assets, and shared stylesheet remain unchanged.

- `components/einstellungen.html` wraps the existing Tracht table in a named,
  keyboard-focusable region. The table ID, structure, and controls are preserved.
- `assets/css/einstellungen.css` makes that region horizontally scrollable when
  necessary and supplies a visible keyboard focus outline.
- `assets/css/faq.css` limits FAQ images to their container width. `object-fit:
  contain` preserves the proportions of images with existing inline heights;
  images with automatic heights continue to scale proportionally. Long words
  and code examples may wrap instead of extending the page width.

All added CSS rules are inside `@media (max-width: 48rem)` (768 CSS pixels with
the default browser font size). There is no global clipping or hidden overflow;
table columns remain reachable by scrolling their own region. No JavaScript or
dependencies were changed.

## Chrome verification

Tested on 2026-11-03 with Google Chrome 156.0.8078.73 in headless mode, with the
browser sandbox enabled, an isolated profile, a 900 CSS pixel viewport height,
and device scale factor 1. The repository was served over local HTTP. A temporary
Node.js harness used the Chrome DevTools Protocol without additional packages.

Both pages were checked at each width with sections collapsed and with all
sections expanded, including nested FAQ entries. Image decoding and settings
table population completed before measurement. All 16 final page/state/width
combinations passed; no browser runtime exceptions were recorded.

The following measurements refer to expanded pages. Chrome's vertical scrollbar
occupied 15 pixels, so the document's available width was smaller than the
configured viewport. A page passes when `scrollWidth <= clientWidth`.

| Viewport | Available width | Settings scroll width, before / after | FAQ scroll width, before / after | Table's maximum horizontal scroll after |
| ---: | ---: | ---: | ---: | ---: |
| 320 | 305 | 611 / 305 | 661 / 305 | 357 |
| 375 | 360 | 611 / 360 | 661 / 360 | 302 |
| 768 | 753 | 753 / 753 | 753 / 753 | 0 |
| 1920 | 1905 | 1905 / 1905 | 1905 / 1905 | 0 |

Additional checks:

- All FAQ images fit within their parent containers at every tested width.
- The table's last column was reachable at every width. At 320 and 375 pixels,
  a real ArrowRight key event moved the focused table region by 40 pixels.
- At 768 and 1920 pixels, all measured visible element rectangles matched the
  baseline in both collapsed and expanded states. Eight screenshots covering
  page tops, the table, and FAQ images were byte-identical before and after.
- Screenshots at narrow widths were also inspected visually.

The Hallmark static preservation check retained all 17 recorded links and the
one named form field. Its integrated renderer could not run because
`puppeteer-core` was unavailable; the Chrome checks above were run separately.
The complete Hallmark scan is not clean: existing findings about colors,
typography, and other design rules remain, and the preservation run also requires
a Hallmark CSS stamp. Those changes are outside this correction's scope. No full
Hallmark pass is claimed.

## Repeat the browser regression check

From the repository root, serve the site:

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Open `/components/einstellungen.html` and `/components/faq.html` in Chrome.
Set the responsive viewport to 320, 375, 768, and 1920 pixels. Check the collapsed
state first, then run this snippet in the DevTools console on each page to test
the expanded state:

```javascript
document.querySelectorAll('.settings-heading[aria-expanded="false"]')
  .forEach(button => button.click());
document.querySelectorAll('details').forEach(details => { details.open = true; });
await Promise.all([...document.images].map(image => image.decode()));

const root = document.documentElement;
if (root.scrollWidth > root.clientWidth) {
  throw new Error(`Page overflow: ${root.scrollWidth} > ${root.clientWidth}`);
}

for (const image of document.querySelectorAll('main img')) {
  if (image.getBoundingClientRect().width > image.parentElement.clientWidth) {
    throw new Error(`Image overflow: ${image.getAttribute('src')}`);
  }
}

const region = document.querySelector('.table-scroll');
if (region) {
  region.scrollLeft = region.scrollWidth;
  const lastCell = region.querySelector('tbody tr td:last-child');
  if (lastCell.getBoundingClientRect().right > region.getBoundingClientRect().right + 1) {
    throw new Error('The last table column is not reachable');
  }
  region.scrollLeft = 0;
  region.focus();
}
```

At narrow widths, press ArrowRight with the table region focused and verify that
the table scrolls independently of the page. At wide widths, compare the page top,
table, and FAQ images with the baseline screenshots.

## Project checks

```bash
npm test -- --runInBand tests/responsiveCss.test.js tests/settingsAccessibility.test.js tests/settingsInteractions.test.js tests/pageFragments.test.js
npm run lint
git diff --check
```

Results: all 4 Jest suites and 14 tests passed; ESLint and whitespace validation
passed. No commit was created.
