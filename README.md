# beelot
Pilot for Bee-Keeping - The prediction of flowering phases based on the grassland temperature sum.


## Website

https://www.beelot.de

Hosted under github.

### Branches
```plaintext
"main" --> official current release
"dev"  --> current development
"v01"  --> version 0.1 (first release on Jan 1, 2025)
```


## Directory Tree
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


## Unit tests

Run
```
npm install
npm test
```

## Release workflow

- Releases are created via `scripts/release_from_dev.py`.
- The release version is the maximum of `assets/js/version.js` and `package.json`.
- The script syncs both files to that max version, tags `v<version>`, and pushes.
- GitHub Actions publishes a GitHub Release automatically on tag push.
