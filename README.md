# BeeLot

BeeLot predicts flowering phases for beekeeping from the grassland temperature
sum (Grünland-Temperatur-Summe, GTS). It is a static website built with HTML,
CSS, and vanilla JavaScript.


## Website

https://www.beelot.de

The production site is hosted with GitHub Pages.

### Branches

```plaintext
"main" --> official current release
"dev"  --> current development
"v01"  --> version 0.1 (first release on Jan 1, 2025)
```


## Local development

Development and maintenance scripts support Node.js 22 or newer, npm, Python 3,
and Bash. The website targets current versions of Chrome, Firefox, Safari, and
Edge; legacy browsers are not supported.

Install the exact JavaScript dependency versions and run the quality checks:

```bash
npm ci
npm test
npm run lint
```

Serve the repository root over HTTP before testing the website in a browser.
Opening `index.html` directly does not reliably load the HTML fragments.

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/`. Check both a narrow mobile-sized viewport
and a desktop viewport when changing layout or interaction behavior.

Additional maintenance checks:

```bash
python3 -m unittest discover -s scripts/tests -p 'test_*.py'
bash scripts/tests/test_sync_versions_max.sh
python3 scripts/sync_versions.py --source max --check
```

The live URL checker uses only the Python standard library. It performs network
requests and returns a nonzero status if a link cannot be validated:

```bash
python3 scripts/naturadb_url_check.py
```

## Runtime data

BeeLot has no application server or user account. Locations, display settings,
plant settings, map state, and weather/location-name caches are stored in the
browser's `localStorage`. Stored data remains on that browser profile and is not
automatically synchronized to other devices.

The browser contacts these third-party services directly:

- Open-Meteo for historical and forecast temperatures
- Nominatim and Photon for forward and reverse geocoding
- OpenStreetMap/Leaflet infrastructure for map tiles
- unpkg and jsDelivr for browser libraries

Requests expose normal connection metadata to those providers and may include
coordinates or an address search. Do not store secrets in the browser data.

## Directory tree

```plaintext
beelot
   ├── assets/
   │   ├── css/                # Stylesheets
   │   ├── js/                 # JavaScript Files
   │   ├── img/                # Images (PNG, JPEG, SVG, etc.)
   ├── components/             # HTML-components
   ├── tests/                  # Unit Tests
   ├── .gitignore              # ignored files for git
   ├── README.md               # project description
   ├── scripts/                # some useful little helpers
   └── index.html              # starting page of the website
```


## Release workflow

- Releases are created via `scripts/release_from_dev.py`.
- The release version is the maximum found in `assets/js/version.js` and `package.json`
  after synchronizing both `dev` and `main`.
- The script synchronizes that version into `package-lock.json`, tags `v<version>`,
  and pushes.
- GitHub Actions publishes a GitHub Release automatically on tag push.
