# DA Live — Playwright E2E

## One-time setup

```bash
cd test/e2e
npm ci
npx playwright install chromium   # or: npm run test:install
```

## Target URL (`utils/env.js`)

Precedence:

1. **`PLAYWRIGHT_BASE_URL`** or **`E2E_BASE_URL`** — use this for local dev (e.g. `http://localhost:3000`). Trailing slashes are stripped.
2. Else **`GITHUB_HEAD_REF=local`** → `http://localhost:3000` (start da-live first).
3. Else **`GITHUB_HEAD_REF`** set to a branch name → `https://<branch>--da-live--<owner>.aem.live`.
4. Else (typical local run with no env) → `https://da.live` (same as CI “main” for `adobe`).

Example:

```bash
export PLAYWRIGHT_BASE_URL=http://localhost:3000
SKIP_AUTH=true npm run test:nonauth
```

## Runs

**Smoke (no IMS password — public / unauthenticated specs only)**

```bash
SKIP_AUTH=true npm run test:nonauth
```

**Full suite (requires `TEST_PASSWORD` for `da-test@adobetest.com` and ACL config — see comments in `tests/auth.setup.js`)**

```bash
export TEST_PASSWORD='…'
npm test
```

**From repo root**

```bash
npm run test:e2e
```

## Troubleshooting

- `SKIP_AUTH=true` skips IMS login and writes an empty storage state; ACL tests under `tests/authenticated/` expect a real session and are not run by `test:nonauth`.
- If setup fails with ENOENT on `.playwright/.auth`, re-run once; the setup script creates the directory when skipping auth.
