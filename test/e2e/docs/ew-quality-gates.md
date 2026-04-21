# EW quality gates — developer guide

This document explains the automated quality gates that run when you contribute to the `ew` / `feat/experience-builder` branch of `da-nx`.

---

## 1. Pre-push hook (local, Husky)

**File:** `da-nx/.husky/pre-push`

Every time you run `git push`, Husky inspects the commits you are about to send and runs only the Playwright E2E specs that are relevant to what you changed — nothing more.

### How it works

The hook reads the diff between your local commits and the remote tip, matches changed file paths against a set of patterns, and builds a list of specs to run. If no tracked path is touched, the hook exits immediately and the push proceeds.

```
git push
 └─ pre-push runs
     ├─ diff: which files changed?
     ├─ match paths → specs (see table below)
     ├─ (no matches) → push proceeds, no tests run
     └─ (matches found)
         └─ cd ../da-live/test/e2e
             └─ npx playwright test <matched specs> --project=chromium
                 ├─ all pass → push proceeds
                 └─ any fail → push BLOCKED (fix and retry)
```

### Path → spec mapping

| Source path changed (in `da-nx`) | Playwright spec(s) run (in `da-live`) |
|---|---|
| `nx*/blocks/skills-lab/**` | `tests/skills-lab.spec.js` |
| `nx*/blocks/skills-editor/**` | `tests/skills-lab.spec.js` |
| `nx*/blocks/browse/skills*` | `tests/skills-lab.spec.js` |
| `nx*/blocks/browse/**` | `tests/browse.spec.js`, `tests/copy_rename.spec.js`, `tests/delete.spec.js` |
| `nx*/blocks/canvas/**` | `tests/edit.spec.js`, `tests/formatting.spec.js`, `tests/versions.spec.js` |
| `nx*/blocks/form/**` | `tests/edit.spec.js`, `tests/formatting.spec.js`, `tests/sheet.spec.js` |
| `nx*/blocks/quick-edit-portal/**` | `tests/edit.spec.js`, `tests/formatting.spec.js` |
| `nx*/blocks/loc/**` | `tests/sheet.spec.js` |
| `nx*/blocks/shared/**` | `tests/copy_rename.spec.js`, `tests/delete.spec.js` |
| `nx*/blocks/snapshot-admin/**` | `tests/versions.spec.js` |
| `nx*/blocks/nav/**`, `sidenav/**`, `profile/**` | *(placeholder — uncomment in hook when `nav.spec.js` lands)* |
| `nx*/blocks/chat/**` | *(placeholder — uncomment in hook when `canvas.spec.js` lands)* |

> `nx*` matches both `nx/` and `nx2/`.

### Prerequisites

`da-live` must be cloned as a **sibling** of `da-nx`:

```
Projects/DA/
├── da-nx/       ← pre-push hook lives here
└── da-live/     ← you are here; tests live in test/e2e/
    └── test/e2e/
        ├── docs/ew-quality-gates.md   ← this file
        └── tests/
```

The hook resolves the path automatically. If `da-live` is missing it prints a clear error and blocks the push.

### Bypassing (emergency use only)

```bash
git push --no-verify
```

Use this only when you deliberately need to skip (e.g. pushing a WIP branch you won't open a PR from). Do not make a habit of it — the gate exists to protect the team.

### Adding a new spec mapping

When a new Playwright spec lands in `da-live`:

1. Open `.husky/pre-push`
2. Find the commented placeholder block for the relevant feature area, or copy an existing block
3. Uncomment / add the pattern and spec filename
4. Commit the updated hook on your branch

---

## 2. EW PR template

**File:** `da-nx/.github/PULL_REQUEST_TEMPLATE/ew_pr_template.md`

When opening a PR that targets the `ew` branch, use the **EW template** instead of the default one. It contains the full Definition of Done checklist.

### How to select it

Append `?template=ew_pr_template.md` to the GitHub "Open pull request" URL:

```
https://github.com/adobe/da-nx/compare/ew...<your-branch>?template=ew_pr_template.md
```

Or use the template dropdown on the PR creation page if GitHub shows it.

### Checklist sections

| Section | What it covers |
|---|---|
| **Functional** | Smoke-test on preview URL, no regressions, theme |
| **Quality** | Unit tests, lint, no runtime errors, plain ESM |
| **Architecture & contracts** | No orchestration in client, wire shapes documented, scoped CSS, lazy-load |
| **Skills Lab** *(conditional)* | Tick "Skills Lab changed" to activate; verifies data model, dual storage, merge rule, public CSS selectors, DA admin API |
| **E2E / integration** | Playwright suite run locally |
| **Security** | No secrets, AuthN→AuthZ→capabilities→resolve order |
| **Branch hygiene** | Rebased on `origin/ew`, logical commits, correct PR target |

> The CI workflow enforces that required items are checked before merge (see section 3).

---

## 3. CI checklist workflow

**File:** `da-nx/.github/workflows/ew-pr-checklist.yml`

A GitHub Actions job runs on every PR opened or updated against `ew`. It:

1. Detects the `<!-- EW_PR_TEMPLATE -->` marker in the PR body (skips silently if the default template was used)
2. Fails the check if any **required** DoD items are still unchecked
3. If "Skills Lab changed in this PR" is ticked, additionally enforces all Skills Lab sub-items

This means **a PR cannot be merged with the EW template open and boxes unticked** — CI will block it.

---

## Quick-reference

```bash
# Normal workflow — hook runs automatically
git push origin feat/my-feature

# Check what specs would fire without actually pushing
git diff --name-only origin/ew..HEAD | grep -E "nx2?/blocks/"

# Run Skills Lab suite manually at any time
cd ../da-live/test/e2e
npx playwright test tests/skills-lab.spec.js --project=chromium

# Run the full suite manually
cd ../da-live/test/e2e
npx playwright test --project=chromium
```
