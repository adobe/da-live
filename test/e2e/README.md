# DA Live — End-to-End Tests

- Test code: `test/e2e/tests/**`
- Shared helpers: `test/e2e/utils/**`
- Config: `test/e2e/playwright.config.js`

---

## Quick start

```bash
cd test/e2e
npm ci
npm run test:install          # one-time: download browsers

# Run the suite (chromium only) against the default da-admin backend:
TEST_PASSWORD=<ims-test-password> npm test

# Run against a local dev stack instead:
GITHUB_HEAD_REF=local TEST_PASSWORD=<pw> npm test    # points at localhost:3000
```

`TEST_PASSWORD` (the IMS password for the `da-test@adobetest.com` user) is
required for anything that touches a backend. Reports open with
`npm run test:report`.

---

## The run-folder content model

Every test run gets its **own folder** so runs never clobber each other:

```
/{TEST_ORG}/{TEST_SITE}/tests/
  pw-{branch}/                     <- this run's folder (RUN_FOLDER)
    pw-run-{ts}-marker             <- run marker page (created at setup)
    pw-edit1-{ts}-chromium         <- pages/sheets/folders created by tests
    ...
```

- `pw-{branch}` comes from `GITHUB_HEAD_REF` → `pw-main` by default, `pw-local`
  locally, `pw-<pr-branch>` on a PR (see `utils/env.js`).
- Individual resource names are `pw-{testId}-{ts}-{project}` (`utils/page.js`).

Cleanup happens in **three layers** — this is the whole point of the design:

| Layer | Where | When | Purpose |
|-------|-------|------|---------|
| **clean-at-start** | `auth.setup.js` (`setup` project) | before the suite, once | Correctness — wipes `pw-{branch}` and writes a fresh marker, so a run never inherits a previous crashed run's leftovers. |
| **teardown** | `teardown.spec.js` (`teardown` project) | after the whole suite | Tidiness — deletes `pw-{branch}`. Runs even if tests failed. |
| **sweeper** | `sweeper.spec.js` (`sweeper` project) | scheduled (every 6h) | Backstop — deletes `pw-*` folders whose marker is older than `PW_DELETE_HOURS` (default 2h), reclaiming branches that were merged/deleted and never ran again. |

Because both CI workflows serialize (`concurrency` on the workflow name) and the
two backends are different sites, a deterministic per-branch folder name is
collision-safe.

---

## How a run flows

Playwright **projects** (in `playwright.config.js`) enforce the order:

```
setup  ──►  chromium / firefox / webkit  ──►  teardown
(login +     (all *.spec.js except              (delete this
 clean-at-    sweeper/teardown, which             run's folder)
 start)       the browser projects testIgnore)
```

1. **`setup`** — `ims.setup.js` (branch-name sanity check) and `auth.setup.js`
   (IMS login → saves `storageState`; then wipes `pw-{branch}` and writes the
   run marker). Runs once; its result is shared by all browser projects.
2. **`chromium` / `firefox` / `webkit`** — the actual e2e specs. They depend on
   `setup` and `testIgnore` `sweeper.spec.js` + `teardown.spec.js` so those never
   run mid-suite.
3. **`teardown`** — wired as `setup`'s `teardown`, so Playwright guarantees it
   runs **last**, after every browser project finishes (regardless of worker
   count or how the suite was launched).
4. **`sweeper`** — a separate project run **only** via `npm run test:cleanup`
   (used by the scheduled `cleanup.yml`); never part of a normal run.

---

## npm scripts

| Script | What it does |
|--------|--------------|
| `npm test` | Full suite, **chromium only**. |
| `npm run test:all` | Full suite on chromium + firefox + webkit (what CI runs). |
| `npm run test:nonauth` | `SKIP_AUTH=true` — runs only the specs that don't need a backend (skips login and backend-touching tests). |
| `npm run test:cleanup` | Runs the **sweeper** (`--project=sweeper`). Used by `cleanup.yml`. |
| `npm run test:ui` / `test:debug` | Playwright UI mode / step debugger. |
| `npm run test:report` | Open the last HTML report. |
| `npm run test:install` | Download browser binaries. |

---

## Environment variables

| Variable | Default | Effect |
|----------|---------|--------|
| `TEST_PASSWORD` | — (required) | IMS password for `da-test@adobetest.com`. Needed for any backend/login. |
| `GITHUB_HEAD_REF` | `main` | Chooses the target env **and** the run folder. `local` → `http://localhost:3000` + `pw-local`; a PR branch → the branch preview host + `pw-<branch>`. |
| `TEST_ORG` | `da-sites` | Org the tests write into. |
| `TEST_SITE` | `da-status` | Site the tests write into. Also selects the **backend** (see below). |
| `SKIP_AUTH` | unset | Skips login (empty `storageState`); backend-touching tests skip. |
| `PW_DELETE_HOURS` | `2` | Sweeper age threshold — folders with an older marker are deleted. |

### Test backends sites

- **da-admin** — `TEST_SITE=da-status`
- **Helix 6** — `TEST_SITE`=`da-testautomation`
