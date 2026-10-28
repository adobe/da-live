# Testing

Run these checks in order before you open a pull request. CI runs the same three on every pull request.

| Stage | Command |
| :--- | :--- |
| [Linting](#1-linting) | `npm run lint` |
| [Unit tests](#2-unit-tests) | `npm test` |
| [End-to-end tests](#3-end-to-end-tests) | `npm run test:e2e` |

## 0. Setup

Use Node.js 24, then install from the repository root.

```bash
npm ci
```

The install builds the bundles in `deps/` (`da-lit`, `da-y-wrapper`, `da-parser`). Unit tests import them, so the install must succeed before you test.

## 1. Linting

JavaScript is checked with ESLint (the Helix config) and CSS with Stylelint.

```bash
npm run lint           # both
npm run lint:js        # ESLint only
npm run lint:css       # Stylelint only
npx eslint . --fix     # auto-fix what can be fixed
```

ESLint skips `test/e2e` and `deps/`.

### Commit messages

A `commit-msg` hook checks every commit message with commitlint. Use [Conventional Commits](https://www.conventionalcommits.org/), for example `test: cover edge case`. Use `test:` for test-only changes. The `pr-title.yaml` workflow applies the same check to pull request titles.

## 2. Unit tests

Unit tests run in a real browser through [Web Test Runner](https://modern-web.dev/docs/test-runner/overview/), with Mocha-style `describe`/`it`, Chai assertions and Sinon for stubs. They need no backend. The runner logs an error when a spec reaches the network.

### Run

```bash
npm test                 # whole suite once, with coverage
npm run test:watch       # re-run on change
npx wtr "./test/unit/scripts/utils.test.js" --node-resolve --port=2000    # one file
```

### Files

| Path | Purpose |
| :--- | :--- |
| `test/unit/**/*.test.js` | Specs, mirroring the source tree (`blocks/`, `scripts/`) |
| `test/unit/setup-nx.js` | Points the NX loader at local fixtures |
| `test/fixtures/` | Stubs and fake modules, including a fake `nx` tree |
| `web-test-runner.config.js` | Import map, reporters and coverage exclusions |

### Unit test patterns

- **Mock the network.** Specs that request an external URL or add an external script log an error. Several specs replace `window.fetch` and restore it afterwards.
- **Set NX before importing.** Some modules read the NX location when they are imported. Call `setNx('/test/fixtures/nx', { hostname: 'example.com' })` first, as in the example below.
- **One behavior per test.** Arrange the setup, act once and assert the result. Specs stay fast, independent of each other, repeatable and self-validating, so they pass or fail without anyone reading the output.

Editor code built on ProseMirror and Yjs can be tested without a server. See the [editor testing notes](test/unit/blocks/edit/prose/README.md).

### Unit test example

```js
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

describe('DaListItem', () => {
  let DaListItem;

  before(async () => {
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    ({ default: DaListItem } = await import('../../../../../blocks/browse/da-list-item/da-list-item.js'));
  });

  it('sanitizes the name', () => {
    const target = { value: 'Foo Bar' };

    new DaListItem().handleRename({ target });

    expect(target.value).to.equal('foo-bar');
  });
});
```

### Coverage

The `npm test` command prints a coverage report. Files under `test`, `mocks`, `deps` and `node_modules` are excluded.

## 3. End-to-end tests

End-to-end (E2E) tests drive the real application with [Playwright](https://playwright.dev) in Chromium, Firefox and WebKit. They log in, create content in a real DA backend and clean up after themselves. Use them for user flows that unit tests cannot cover. The complete reference is [test/e2e/README.md](test/e2e/README.md).

### First run

```bash
cd test/e2e
npm ci
npm run test:install                  # one-time browser download
TEST_PASSWORD=<password> npm test     # Chromium only
```

The password is for the test user. From the repository root, `npm run test:e2e` installs and runs the full suite on all three browsers.

### Target environment

The `GITHUB_HEAD_REF` variable selects what the tests run against.

| Value | Target | IMS tier |
| :--- | :--- | :--- |
| unset or `main` | `https://da.live` | Prod |
| a branch name | that branch's preview on `aem.live` | Prod |

### Test organization and site

Tests create their content in `/{TEST_ORG}/{TEST_SITE}/tests/pw-<branch>`. Two variables choose the organization and the site.

| Variable | Default |
| :--- | :--- |
| `TEST_ORG` | `da-sites` |
| `TEST_SITE` | `da-status` |

CI runs the suite twice. The `playwright.yml` workflow uses the defaults for da-admin. The `playwright-hlx.yml` workflow sets `TEST_ORG=da-testautomation` and `TEST_SITE=da-e2e-tests` for Helix.

```bash
# Helix, as in CI
TEST_ORG=da-testautomation TEST_SITE=da-e2e-tests TEST_PASSWORD=<password> npm test
```

### How a run works

Playwright projects run in a fixed order.

1. The `setup` project logs in once, then wipes and recreates this run's `pw-<branch>` folder.
2. The `chromium`, `firefox` and `webkit` projects run every spec against that folder.
3. The `teardown` project deletes the folder, even when tests failed.

A scheduled sweeper deletes `pw-*` folders from interrupted runs.

### Test files

| Path | Purpose |
| :--- | :--- |
| `test/e2e/tests/*.spec.js` | Specs |
| `test/e2e/tests/authenticated/` | Further specs, such as ACL, collaboration and media |
| `test/e2e/tests/*.setup.js` | Login and environment checks |
| `test/e2e/utils/` | Helpers for environment, URLs and cleanup |
| `test/e2e/playwright.config.js` | Projects, timeouts and retries |

### E2E test patterns

- **Test URLs.** Build them with `getTestPageURL` and its siblings in `utils/page.js`, so created content lands in the run folder and is cleaned up.
- **Saves.** Call `waitForSave(page)` before the change that triggers the save, then await it.
- **No backend.** Backend specs start with `test.skip(!!process.env.SKIP_AUTH, 'No backend under SKIP_AUTH')`.
- **Timeouts.** Slower flows call `test.setTimeout(...)`.

### E2E test example

```js
import { test, expect } from '../utils/fixtures.js';
import { getTestPageURL } from '../utils/page.js';

test('Create document', async ({ page }, workerInfo) => {
  await page.goto(getTestPageURL('example', workerInfo));
  await page.getByText('Create document', { exact: true }).click();

  await expect(page.locator('div.ProseMirror')).toBeVisible();
});
```

### Debugging a failure

- Failed tests keep a screenshot and a video, and a trace is collected on the first retry. Open them with `npm run test:report`.
- CI retries a failed test up to three times.
- Use `npm run test:ui` to step through a spec and inspect the page.

## 4. Continuous integration

| Workflow | Trigger | Runs |
| :--- | :--- | :--- |
| `lint_test.yaml` | Pull requests, push to `main` | Lint and unit tests |
| `pr-title.yaml` | Pull request opened or edited | Conventional Commits check on the title |
| `playwright.yml` | Pull requests, push to `main`, manual | E2E against the da-admin backend |
| `playwright-hlx.yml` | Pull requests, push to `main`, manual | E2E against the Helix backend |
| `cleanup.yml` | Every 6 hours, manual | Sweeper for stale E2E content |

The E2E workflows upload the Playwright report as an artifact. Download it from the workflow run to inspect a failure.
