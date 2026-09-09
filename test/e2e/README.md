# DA Live — End-to-End Tests

Browser-based [Playwright](https://playwright.dev/) tests that drive the **real**
DA app against **real** backends (they are not unit tests — they log in via IMS,
create pages/sheets/folders, and preview/publish them). A small number of pure
logic tests (no browser) live here too, for the cleanup helpers.

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

## The run-folder model (most important concept)

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

### Two backends

`TEST_SITE` decides which admin API the helpers talk to (`utils/cleanup.js`):

- **da-admin (legacy)** — `TEST_SITE=da-status` → `admin.da.live`. The default.
- **Helix 6** — any other `TEST_SITE` (CI uses `da-testautomation` /
  `da-e2e-tests`) → `api.aem.live`. Some tests (e.g. ACL) `test.skip` here.

> Note: the ACL specs under `tests/authenticated/` intentionally hardcode
> `da-testautomation/acltest` (their permission fixture lives only there) and
> ignore `TEST_ORG`/`TEST_SITE`.

---

## Key files

| Path | Purpose |
|------|---------|
| `playwright.config.js` | Projects (setup/teardown/sweeper/browsers), reporters, timeouts. |
| `utils/env.js` | Resolves the target `ENV` URL, `TEST_ORG`/`TEST_SITE`, and `RUN_FOLDER`. |
| `utils/page.js` | Test-URL builders (`getTestPageURL`/`getTestFolderURL`/`getTestSheetURL`), marker-age parsing, editor helpers. |
| `utils/cleanup.js` | Admin-API helpers for both backends: create marker, list/select stale folders, delete. |
| `utils/fixtures.js` | Re-exports `test`/`expect`; documents the cleanup lifecycle. |
| `tests/auth.setup.js` | IMS login + clean-at-start + marker. |
| `tests/teardown.spec.js` | The `teardown` project's single test. |
| `tests/sweeper.spec.js` | The `sweeper` project's single test. |
| `tests/cleanup-helpers.spec.js` | **Unit** tests (no browser) for the `cleanup.js` logic. |
| `tests/*.spec.js` | Feature e2e tests (edit, sheet, copy/rename, preview/publish, versions, collab, ACL, …). |

---

## GitHub Actions (`.github/workflows/`)

| File | Trigger | What it does |
|------|---------|--------------|
| `playwright.yml` — *Playwright Tests (Da-Admin)* | PR, push to `main`, manual | Runs the full e2e suite (`test:all`) against the **da-admin** backend (`da-sites`/`da-status`). |
| `playwright-hlx.yml` — *Playwright Tests (Helix)* | PR, push to `main`, manual | Same suite against the **Helix 6** backend (`da-testautomation`/`da-e2e-tests`). |
| `cleanup.yml` — *Cleanup stale test resources* | every 6h (cron) + manual | Runs the **sweeper** (`test:cleanup`) via a matrix over both backends, deleting stale `pw-*` run folders by marker age. |
| `lint_test.yaml` — *Lint and Test* | PR, push to `main` | Repo-level **eslint + unit tests** (`npm run lint`, `npm t`) at the project root. Does **not** run the e2e suite. |
| `da-email-bot.yaml` | — | Unrelated to tests. |

Both Playwright workflows use `concurrency: group: ${{ github.workflow }}` with
`cancel-in-progress: false`, so runs of each workflow **serialize** (a second run
queues behind the first) — which is what makes the per-branch run folder safe.
