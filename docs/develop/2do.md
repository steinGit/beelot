# Development tasks

## Restore the release dependency audit

Status: open. Findings recorded on 2026-11-09 for version 0.3.6,
commit `4a5aef82ff9e426484a76f846c20e6907dc12e58`.

### Diagnosis

The [Release workflow run #10](https://github.com/steinGit/beelot/actions/runs/42632881825)
failed in the quality job's
[Audit dependencies step](https://github.com/steinGit/beelot/actions/runs/42632881825/job/129213391641).
Dependency installation, tests with coverage thresholds, tests in
`America/Los_Angeles`, and ESLint passed. The audit returned exit code 1;
maintenance checks and the dependent GitHub Release job were skipped.

The separate GitHub Pages deployment succeeded, so the website remains
available. The Ubuntu runner migration notice is informational and did not
cause this failure. This finding does not require a website rollback.

The local audit snapshot reported 22 affected packages: 19 moderate and three
low. All findings were in development dependencies around Jest, Babel coverage
tools, and ESLint. Underlying advisories included `deepmerge`, `glob`, and
`minimatch`; dependent packages account for additional reported entries.
`npm audit --omit=dev` reported no known vulnerabilities. Audit results change
as advisories and fixes are published; refresh them before choosing updates.
The npm audit does not cover all browser libraries loaded from CDNs.

Local maintenance tests (23 Python tests), the version-sync shell test, and
version consistency passed. Local Jest and lint also passed, but used an older
pre-existing installation on Node.js 18. Those results do not replace checks
with the declared runtime and locked dependencies.

### Next steps

- [ ] Use the workflow's Node.js 22.13.0 runtime, or another runtime allowed by
  `package.json`, and install the locked dependencies with `npm ci`.
- [ ] Refresh the full and production-only audits. Inspect each dependency
  path and available patched versions before selecting changes.
- [ ] Update only the affected development dependencies and their required
  transitive dependencies. Keep the Jest packages aligned and ESLint compatible
  with `@eslint/js`. Generate lockfile changes with npm.
- [ ] Review existing overrides and add an override only when compatibility
  is established and the technical reason is documented. Do not apply
  `npm audit fix --force` blindly or weaken the audit gate to obtain a green run.
- [ ] Run every validation command below and inspect the dependency diff for
  unrelated changes. Update regression tests if behavior changes.
- [ ] Prepare the next available patch version, for example 0.3.7 if unused,
  through the documented [release procedure](../../README.md#release-workflow).
  Keep the existing `v0.3.6` tag intact. Start with the release script's dry run
  from a clean worktree.
- [ ] Confirm that the new tag's complete quality job and GitHub Release job
  succeed. Verify the separate Pages deployment and check the live website.

To inspect the refreshed dependency findings:

```bash
npm ci
npm audit --audit-level=low
npm audit --omit=dev
```

After applying the targeted dependency updates, run the complete release checks:

```bash
npm run test:coverage
TZ=America/Los_Angeles npm test -- --runInBand
npm run lint
npm audit --audit-level=low
python3 -m unittest discover -s scripts/tests -p 'test_*.py'
bash scripts/tests/test_sync_versions_max.sh
python3 scripts/sync_versions.py --source max --check
git diff --check
```

### Completion criteria

The full audit reports no known vulnerabilities, all release checks pass with
the intended runtime and locked dependency versions, and the new tagged release
completes successfully. Record the final dependency changes, validation results,
and successful workflow link here before marking this task complete.
