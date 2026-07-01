# Design: Hide "Cut" in Browse Action Bar for HLX6 Sites

**Date:** 2026-07-01
**Issue:** https://github.com/adobe/da-live/issues/1039

---

## Problem

The browse toolbar's action bar shows a "Cut" button (which triggers a move operation). For HLX6 sites the move operation works differently — we want to remove the Cut option entirely from the UI for HLX6 users to avoid confusion.

---

## Solution

Pass an `isHlx6` flag from `da-list` down to `da-actionbar`. The actionbar hides the Cut button when the flag is true.

The HLX6 check uses `isHlx6(org, site)` exported from NX's `/utils/api.js`, accessed via the existing `getNx2Api()` helper in `scripts/utils.js`. This function is already used in `da-list.js` (line 490-491) for delete handling, and caches results in memory + localStorage per org/site path.

---

## Architecture

### Data flow

```
da-list (fullpath → extract org/site → isHlx6 call → _isHlx6 state)
  └── <da-actionbar .isHlx6=${this._isHlx6}>
        └── Cut button: hidden when isHlx6 === true
```

### Why not check in `da-actionbar` directly?

The actionbar already receives `currentPath` and could call `isHlx6` itself. We prefer keeping the actionbar as a dumb display component: its job is to render buttons based on props/state passed in. Async API logic belongs in the orchestrating component (`da-list`), which already owns the HLX6 check for other operations.

---

## Changes

### 1. `blocks/browse/da-list/da-list.js`

- Add `_isHlx6: { state: true }` to `static properties`.
- In `getList()` — which is already called whenever `fullpath` changes — extract `org` and `site` from `this.fullpath` using `sanitizePathParts` (already imported), then call `isHlx6(org, site)` from `getNx2Api()` (already imported). Assign the resolved boolean to `this._isHlx6`.
- Pass `.isHlx6=${this._isHlx6 ?? false}` to `<da-actionbar>` in the render template.

### 2. `blocks/browse/da-actionbar/da-actionbar.js`

- Add `isHlx6: { type: Boolean }` to `static properties`.
- In the Cut button template, change the visibility condition from `${this._canWrite ? '' : 'hide'}` to `${this._canWrite && !this.isHlx6 ? '' : 'hide'}`. No other button is affected.

### 3. `test/unit/blocks/browse/da-actionbar/da-actionbar.test.js`

- Add a `isHlx6` describe block with two tests:
  - Cut button is visible when `isHlx6` is false and `_canWrite` is true (existing behavior, now explicit).
  - Cut button class includes `hide` when `isHlx6` is true (even if `_canWrite` is true).
- Note: the actionbar test suite operates on the class directly (not the rendered DOM), so we test via the property values that drive the class expression rather than querying shadow DOM.

---

## Error handling / edge cases

- **Org-only path (no site):** `isHlx6(org, undefined)` returns `false` (per NX api.js implementation — site is required). Cut remains visible. Correct behaviour since org-level browsing isn't HLX6.
- **API failure / auth issue:** `isHlx6` resolves to `false` on network error (no upgrade header → not upgraded). Cut remains visible. Safe default.
- **`_isHlx6` undefined before first `getList` call:** The `?? false` fallback in the template ensures the actionbar always receives a boolean.

---

## Out of scope

- The Paste button is not affected — it only appears after Cut is initiated, and Cut is blocked at the UI level.
- No changes to the move/paste logic itself; this is display-only.
- The "Copy" button (not cut/move) is unaffected.
