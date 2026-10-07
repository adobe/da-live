# DA Live (dark-alley)

Author experience for https://da.live — a browser-based document/spreadsheet
authoring UI built as plain ES modules (no bundler, no framework build step)
on top of Adobe's Franklin/Edge Delivery Services (EDS) block conventions.

## Build, Test, Lint

- `npm ci` then `npm install` — `postinstall` builds vendored deps (see Dependencies below).
- `npm run lint` — runs `lint:js` (eslint) and `lint:css` (stylelint on `blocks/**/*.css` and `styles/*.css`).
- `npm t` / `npm test` — runs all unit tests via `@web/test-runner` (`wtr "./test/unit/**/*.test.js" --node-resolve --port=2000 --coverage`).
  - Run a single test file: `npx wtr "test/unit/blocks/shared/prose2aem.test.js" --node-resolve`.
  - `npm run test:watch` — watch mode.
- E2E (Playwright, separate package in `test/e2e`):
  - `cd test/e2e && npm i` once, then `npm run test` (chromium only) or `npm run test:all` (chromium+firefox+webkit).
  - Run a single spec: `npx playwright test tests/sheet.spec.js --project=chromium`.
  - `SKIP_AUTH=true` variant exists as `npm run test:nonauth` for specs that don't need IMS auth.
- CI (`.github/workflows/lint_test.yaml`) runs `npm ci`, `npm run lint`, `npm t` on push/PR to `main`. Playwright runs in a separate workflow.

### Dependencies (`deps/`)
Several libraries (prosemirror, yjs, lit, da-parser, jspreadsheet-ce, etc.) are vendored
and pre-built into `deps/<name>/dist` rather than pulled from `node_modules` at runtime.
If you touch `deps/lit`, `deps/da-y-wrapper`, or `deps/da-parser` sources, rebuild with
`npm run build:da-lit`, `npm run build:da-y-wrapper`, or `npm run build:da-parser`.
Unit tests map `da-y-wrapper`, `da-lit`, `da-parser` import specifiers to these built
files via the import-map plugin in `web-test-runner.config.js`.

## Architecture

- **No bundler**: everything under `blocks/`, `scripts/`, `styles/` is loaded directly as
  ES modules by the browser, following the Franklin/EDS block pattern (each folder under
  `blocks/` is a route/feature: `browse`, `canvas`, `edit`, `media`, `sheet`, `shared`, `start`).
- **`scripts/scripts.js`** is the entry point. It dynamically imports a shared UI/behavior
  library called **`nx`** (da-nx, a sibling Adobe repo) from `/nx`, sets up IMS auth
  (`initIms`), color scheme, and calls `loadArea()` from nx to decorate/hydrate the page.
  `?nx=local` in the URL points this at a local `da-nx` checkout for cross-repo development.
- **`blocks/edit`**: the classic split/WYSIWYG document & sheet editor (`da-editor`,
  `da-content`, prose-mirror based `prose/`, `da-preview`, `da-versions`, etc.).
- **`blocks/canvas`**: a newer canvas-style editor (`ew-*` custom elements: `ew-editor-wysiwyg`,
  `ew-editor-split`, `ew-canvas-header`, `ew-file-explorer`, `ew-tool-panel`, `ew-comments`,
  `ew-page-outline`, etc.) that hosts a **quick-edit iframe** (the WYSIWYG overlay) inside
  the host page.
- **`blocks/shared`**: cross-cutting utilities used by both editors — `prose2aem.js`
  (ProseMirror doc ⇄ AEM/EDS HTML conversion), `daFiles.js`, `sheet.js`, dialog web
  components (`da-dialog`, `da-name-dialog`, `da-link-dialog`, `da-alt-dialog`),
  `constants.js`, IMS/auth helpers in `utils.js`, and `aem-assets/` (AEM Assets picker).
- Auth is Adobe IMS. Environment mapping matters for local dev: `localhost`/`aem.page` →
  IMS Stage; `aem.live`/`da.live` → IMS Prod. Admin/collab backends are switched via URL
  params (`?da-admin=stage&da-collab=stage`, or `local`/`reset`), persisted in local storage.

## Key Conventions

- **Branch names**: max 8 lowercase alphanumeric characters, no hyphens/underscores/mixed
  case (e.g. `multiimg`, `fixauth`). This is an IMS constraint — longer/other names break
  auth in CI/CD and preview environments.
- **Canvas eventing** (`blocks/canvas/**` only): use `canvasBus`
  (`blocks/canvas/utils/canvas-bus.js`) — `canvasBus.<name>.emit()` / `.subscribe()` — for
  any new in-process event or state broadcast. Don't dispatch a new DOM `CustomEvent` or
  add a new one-off observable; see the naming convention in `canvas-bus.js` itself
  (`*Request` for a command, `*State`/`*Ready` for a broadcast).
  - For boundaries `canvasBus` can't reach, use the mechanism that already owns that
    boundary instead of inventing a new one:
    - Shared panel or chat → da-nx's `PANEL_EVENT` / `CHAT_EVENT` DOM CustomEvents
      (see da-nx's `docs/workspace.md`, `docs/chat-ui-component.md`).
    - The quick-edit iframe boundary (host ↔ WYSIWYG overlay) → `MESSAGE_TYPES`
      (`blocks/canvas/utils/quick-edit-messages.js`, re-exporting da-nx's
      `nx/utils/message-types.js`; see da-nx's `docs/quick-edit-events.md`). Extend an
      existing message type's payload rather than adding a parallel one if the data is
      already carried.
- **Unit tests disallow real network/external script access.** `web-test-runner.config.js`
  patches `fetch`/`XMLHttpRequest`/script injection to error on non-local requests — mock
  external calls instead of hitting the network.
- Lint config: ESLint uses `@adobe/eslint-config-helix`; CSS uses `stylelint-config-standard`
  scoped to `blocks/**/*.css` and `styles/*.css`.
