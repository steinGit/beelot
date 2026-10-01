# AGENTS.md

## General

- Prefer `emacs`; never use `nano`.
- Use UTF-8 for all source files.
- Code comments, documentation, commit-style summaries, and identifiers should be in English unless existing project content intentionally uses another language.
- Do not use emoji or emoticons in code, comments, documentation, logs, or CLI output.
- Keep changes minimal, focused, maintainable, and reversible.
- Preserve existing project structure and coding style unless there is a concrete technical reason to change them.
- Do not perform unrelated refactoring while implementing a requested change.
- Do not rename, move, or delete files unless required by the task.
- Do not introduce new dependencies without a concrete technical reason.
- Prefer standard browser APIs over additional libraries.
- Preserve backward compatibility unless the task explicitly requires a breaking change.
- Never put secrets, credentials, API keys, tokens, passwords, private URLs, or personal data into source code, tests, logs, documentation, or configuration examples.

## Project Structure

The project is a browser-based website consisting primarily of HTML, JavaScript, and CSS.

Important locations:

```text
index.html          Main page
components/         Reusable HTML fragments
assets/css/         Stylesheets
assets/js/          Browser-side JavaScript
assets/img/         Images and static assets
tests/              Jest tests
scripts/            Maintenance and release tools
docs/develop/       Developer documentation
package.json        JavaScript dependencies and npm scripts
eslint.config.js    ESLint configuration
jest.config.cjs     Jest configuration
babel.config.cjs    Babel configuration
```

Do not assume a JavaScript framework is used. Prefer the project's existing vanilla HTML/JavaScript/CSS architecture unless explicitly requested otherwise.

## Before Changing Code

Before modifying a file:

1. Inspect the relevant implementation.
2. Inspect related tests.
3. Search for callers, DOM selectors, IDs, CSS classes, exported functions, and other dependencies that could be affected.
4. Check `package.json` for existing scripts and dependencies before proposing new tooling.
5. Reuse existing helpers and conventions where appropriate.

Do not duplicate functionality that already exists elsewhere in the project.

## HTML

- Use semantic HTML elements where appropriate.
- Maintain a valid and understandable document structure.
- Preserve accessibility.
- Every interactive control must be usable with a keyboard.
- Use `<button>` for actions and `<a>` for navigation.
- Form controls should have associated labels.
- Images should have meaningful `alt` text unless they are purely decorative.
- Do not introduce inline JavaScript event handlers such as:

```html
<button onclick="doSomething()">
```

Prefer JavaScript event listeners instead.

- Avoid inline CSS unless the existing architecture explicitly requires it.
- Do not insert unsanitized or untrusted data as HTML.

Prefer:

```javascript
element.textContent = value;
```

over:

```javascript
element.innerHTML = value;
```

when HTML parsing is not required.

## JavaScript

- Use modern JavaScript supported by the project's existing Babel/browser configuration.
- Prefer `const`; use `let` only when reassignment is necessary.
- Do not use `var`.
- Prefer strict equality with `===` and `!==`.
- Avoid implicit type coercion when it makes behavior unclear.
- Keep functions small and focused.
- Prefer pure functions for business logic where practical.
- Avoid global mutable state.
- Reuse existing modules and utilities.
- Handle asynchronous errors explicitly.
- Check HTTP responses before processing them.

Example:

```javascript
const response = await fetch(url);

if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${url}`);
}

const data = await response.json();
```

- Never silently ignore rejected promises.
- Do not use `eval()`, `new Function()`, or equivalent dynamic code execution.
- Do not construct executable JavaScript from external data.
- Do not dynamically inject external scripts unless explicitly required and reviewed.
- Avoid `document.write()`.
- Prefer `addEventListener()` over assigning DOM event attributes.
- Do not depend on undocumented browser behavior.

## DOM Safety

Treat all externally supplied data as untrusted, including:

- URL parameters
- URL fragments
- API responses
- local storage
- session storage
- user-entered values
- geolocation-derived names
- imported JSON
- values returned by external services

Do not inject untrusted values using:

- `innerHTML`
- `outerHTML`
- `insertAdjacentHTML`
- dynamically constructed `<script>` elements

Prefer DOM APIs such as:

- `textContent`
- `createElement`
- `append`
- `replaceChildren`
- `setAttribute` where appropriate

If HTML insertion is genuinely required, document why the source can be trusted or use an established sanitizer already present in the project.

## URL and Link Safety

- Validate dynamically created URLs.
- Prefer the `URL` API for URL construction.
- Do not concatenate arbitrary user-controlled values into URLs without validation.
- Restrict expected protocols where external input influences links.

For example, dynamically generated links should normally accept only protocols such as:

```text
https:
http:
```

where appropriate.

Do not allow attacker-controlled values to create `javascript:` URLs.

For links opened with `target="_blank"`, ensure appropriate protection such as:

```html
rel="noopener noreferrer"
```

unless browser behavior or project requirements make this unnecessary.

## Web Security

Security regressions must be treated as bugs.

Pay particular attention to:

- Cross-site scripting (XSS)
- DOM-based XSS
- unsafe URL handling
- injection vulnerabilities
- exposed secrets
- insecure external resources
- unsafe redirects
- dependency vulnerabilities
- accidental leakage of personal information
- insecure use of browser storage

Never disable browser security mechanisms merely to make something work.

Do not weaken:

- Content Security Policy
- CORS restrictions
- integrity checks
- input validation
- authentication or authorization mechanisms

without a documented technical reason.

If modifying HTTP headers or deployment configuration, prefer a restrictive Content Security Policy that avoids `unsafe-inline` and `unsafe-eval` where the existing application permits it.

## Browser Storage

- Do not store passwords, authentication secrets, private API keys, or other sensitive credentials in `localStorage` or `sessionStorage`.
- Treat data loaded from browser storage as untrusted.
- Validate parsed JSON before using it.
- Handle malformed or obsolete stored values gracefully.
- Maintain backward compatibility for persisted data where practical.

## External Data and APIs

- Treat responses from external services as potentially malformed.
- Check required fields before using them.
- Handle unavailable services and network failures.
- Avoid infinite retry loops.
- Use timeouts where appropriate for scripts or server-side maintenance tools.
- Do not log sensitive external data unnecessarily.
- Do not bypass TLS certificate validation.

## CSS

- Reuse existing variables, classes, and layout conventions before creating new ones.
- Avoid excessive selector specificity.
- Avoid `!important` unless required to override third-party or otherwise unavoidable styles.
- Prefer classes over styling through element IDs.
- Keep responsive behavior intact.
- Test changes at narrow and wide viewport sizes where layout is affected.
- Avoid fixed dimensions when responsive alternatives are appropriate.
- Preserve visible keyboard focus indicators.
- Respect `prefers-reduced-motion` for significant animations where practical.

## Accessibility

Changes to the user interface must not unnecessarily reduce accessibility.

Check as applicable:

- keyboard navigation
- visible focus
- labels
- headings
- button semantics
- link semantics
- color contrast
- alternative text
- ARIA attributes

Prefer native HTML semantics over ARIA when native elements can provide the required behavior.

Do not add ARIA attributes that duplicate or contradict native semantics.

## Dependencies

- Do not add an npm package if the same functionality can reasonably be implemented using existing project code or standard browser APIs.
- Check whether a dependency already exists before adding another one with overlapping functionality.
- Production dependencies and development dependencies must be classified correctly.
- Do not manually edit dependency versions in `package-lock.json`.
- Use npm so that `package.json` and `package-lock.json` remain synchronized.
- Do not perform broad dependency upgrades as part of an unrelated task.
- Security-related dependency upgrades should remain narrowly scoped where possible.

## Tests

Behavior changes require corresponding tests where practical.

For JavaScript changes:

- Run the relevant Jest tests.
- Add regression tests for bugs being fixed.
- Test normal behavior.
- Test important boundary conditions.
- Test failure behavior where applicable.
- Avoid tests that depend on execution order.
- Avoid unnecessary timing-dependent tests.
- Mock external services rather than relying on live network access.

Do not weaken or delete an existing test merely to make a change pass unless the test itself is demonstrably incorrect.

Prefer fixing the implementation over changing expectations.

## ESLint

JavaScript changes must conform to the project's existing ESLint configuration.

Do not:

- disable ESLint globally
- add broad `eslint-disable` directives
- weaken lint rules merely to silence a warning

A local suppression is acceptable only when technically justified and should be as narrow as possible.

## Generated and Temporary Files

Do not intentionally modify or commit:

```text
node_modules/
__pycache__/
*.pyc
*~
*.swp
```

unless explicitly required.

Editor backup files such as:

```text
information.test.js.~1~
```

should not be treated as source files.

## Python Scripts

Scripts below `scripts/` that use Python must follow these rules:

- Use Python 3.
- Executable scripts should use:

```python
#!/usr/bin/env python3
```

- Use UTF-8.
- Use type annotations.
- Every Python module must have a module docstring containing:
  - a short description
  - a blank line
  - additional details where useful
- Comments and documentation must be in English.
- Handle division by zero explicitly.
- Use `numpy.isclose()` for floating-point comparisons where NumPy is already appropriate.
- Do not add Python dependencies without a concrete technical reason.
- Report malformed input clearly.
- JSON parsing errors should name the affected file and, when available, line and column.

## Shell Scripts

Shell scripts below `scripts/` must:

- use Bash when Bash-specific functionality is required
- start with an appropriate shebang
- quote variable expansions
- handle errors explicitly
- avoid hard-coded user-specific absolute paths
- implement a `usage()` function for command-line tools
- provide help using:

```text
-h
--help
-?
```

- use an option parser such as `getopts` where appropriate
- provide useful defaults such as the current directory where sensible

Do not use unsafe constructs such as:

```bash
eval "$value"
```

with external or user-controlled data.

## CLI Output

For command-line tools, use these categories when colored output is appropriate:

```text
ERROR:   red
WARNING: yellow
INFO:    cyan
SUCCESS: green
DEBUG:   gray
```

Output must remain understandable when ANSI colors are unavailable.

Error messages should state:

- what failed
- which resource or file was affected
- what was expected where useful

## Release and Maintenance Scripts

Files involved in releases, tagging, synchronization, or cleanup require additional care.

This includes scripts such as:

```text
scripts/cleanup.sh
scripts/release_current_hotfix.py
scripts/release_from_dev.py
scripts/retag_release_sync.sh
scripts/sync_versions.py
```

Before changing them:

- inspect their complete control flow
- understand their interaction with Git
- preserve dry-run behavior where available
- avoid destructive Git operations unless explicitly required
- do not automatically force-push
- do not silently delete tags, branches, files, or releases
- fail before modifying state when input validation fails

Commands such as the following require explicit task justification:

```text
git reset --hard
git clean -fd
git push --force
git push --force-with-lease
git tag -d
git branch -D
```

Never introduce them casually.

## Git

- Do not modify unrelated files.
- Do not discard existing user changes.
- Do not rewrite Git history unless explicitly requested.
- Do not automatically commit changes unless explicitly requested.
- Do not automatically push changes unless explicitly requested.
- Do not change branches unless required by the task.
- Inspect repository state before performing operations that modify branches, tags, or history.

## Validation

After modifying JavaScript, HTML, CSS, tests, or configuration, run the smallest relevant validation set first.

Use project-defined npm scripts from `package.json` whenever available.

Typical validation includes:

```bash
npm test
npm run lint
```

Do not invent npm script names without checking `package.json`.

For a focused change, run targeted tests before the complete test suite where Jest supports it.

A task is not complete when:

- relevant tests fail
- lint errors were introduced
- syntax errors remain
- known security regressions remain

If an existing unrelated test already fails, report it separately rather than masking it.

## Change Discipline

When implementing a task:

1. Make the smallest coherent change.
2. Preserve public behavior not mentioned by the task.
3. Add or update tests for changed behavior.
4. Run relevant validation.
5. Review the diff for accidental changes.
6. Report remaining limitations or failing checks clearly.

Do not replace working project architecture with a new framework, build system, CSS framework, package manager, testing framework, or bundler unless explicitly requested.

## Security Review Before Completion

For changes involving data from users, URLs, APIs, browser storage, or generated DOM content, verify before completion that:

- external input is not inserted into HTML unsafely
- dynamically generated URLs are validated
- no secret was introduced
- browser storage is used appropriately
- error messages do not expose sensitive information
- external resources use HTTPS where applicable
- no security mechanism was disabled to make the implementation work
