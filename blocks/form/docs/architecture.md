# Form — Architecture

JSON Schema-driven structured content editor. A thin Lit element wires [da-sc-sdk](https://github.com/adobe-rnd/da-sc-sdk) (the headless engine for state, mutation, validation, and HTML serialization) to a set of Lit components that render the model and dispatch user input back into the SDK.

The block runs inside the Experience Workspace (EW). It lives under `blocks/form` in da-live and was moved there from da-nx's `nx/blocks/form`. On da.live today the `/form` page still loads the da-nx copy, because the nx2 loader routes `nx-form` there (`NX_BLOCKS` in da-nx's [`nx2/scripts/nx.js`](https://github.com/adobe/da-nx/blob/main/nx2/scripts/nx.js)). A page with a plain `form` block loads this copy instead, so switching `/form` over is a content change from `nx-form` to `form`. The block adopts nx2 platform utilities (`loadStyle`, `hashChange`, the `source` api, `openPanel`, `getEWFlags`) through inline `` await import(`${getNx2()}/...`) `` calls, using `getNx2()` from da-live's `scripts/utils.js`. On a page with `<meta name="nxver" content="2">` those URLs match the nx2 modules the page already loaded, so stateful modules such as `nx2/scripts/nx.js` are shared. `form.js` is the EW workspace wrapper (app-frame grid, canvas header, docked chat); `editor.js` is the `nx-form` Lit element that owns the SDK and the editing UI.

For engine internals — schema compilation, model build, validation, defaults policy, persistence semantics — see the SDK's [architecture.md](https://github.com/adobe-rnd/da-sc-sdk/blob/main/docs/architecture.md). This document only covers the nexter shell and what it adds on top.

---

## 1. Layout

```txt
blocks/form/
  form.js               EW workspace wrapper: app-frame grid, floating chat toggle, docked chat (flag-gated)
  form.css              workspace layout
  editor.js / .css      nx-form Lit element: routes (ctx/hash), mounts SDK, state snapshot + nav
  icons.js              sprite-backed icon() helper
  fields/               Spectrum 2 field components (input, picker, checkbox, button, number)
  utils/
    context.js          loadFormContext — routes documents to ready / blocked / select-schema
    da-api.js           fetch/save against DA source via the nx2 source api
    schemas.js          loadSchemas — schema discovery + module cache
    persistence.js      attachPersistence — single-flight save with re-queue
  views/
    editor.js / .css    field rendering + array rendering
    sidebar.js / .css   navigation tree
    preview.js / .css   read-only JSON preview
    array-menu.js       per-item actions
    reorder.js          reorder dialog
  deps/                 prism syntax highlighting
  docs/                 (this directory)
```

The SDK is consumed via the bundled artifact at [`deps/da-sc-sdk/dist/index.js`](../../../deps/da-sc-sdk/dist/index.js), built from the published [`@adobe/da-sc-sdk`](https://www.npmjs.com/package/@adobe/da-sc-sdk) npm package (see [`deps/da-sc-sdk/src/index.js`](../../../deps/da-sc-sdk/src/index.js) for the re-export shim). It lives in the shared `deps/` shelf alongside `lit`, `da-y-wrapper`, `da-parser`, etc. To rev the version, bump the dep in `package.json`, `npm install`, then `npm run build:da-sc-sdk` from the repo root. To rev the version, bump the dep in `package.json`, `npm install`, then `npm run build:da-sc-sdk` from the repo root.

---

## 2. Dependency direction

```txt
form.js (workspace) →  editor.js          (mounts the nx-form element; sets up header + chat)
editor.js (element) →  da-sc-sdk          (createEngine, convertJsonToHtml)
editor.js          →  utils/              (loadFormContext, attachPersistence)
editor.js          →  views/ + fields/    (editor, sidebar, preview; S2 field components)
utils/context.js   →  da-sc-sdk          (convertHtmlToJson)
utils/persistence.js → da-sc-sdk        (convertJsonToHtml)
views/           →  (SDK engine only via prop binding from the element — no direct imports)
```

The SDK is the only piece that holds canonical state. Everything in `utils/` and `views/` is nexter-specific: DA I/O, UI components, schema discovery, single-flight save.

---

## 3. Shell wiring

`editor.js` (the `nx-form` element) instantiates the SDK engine with the (schema, document, onChange) triple, holds the current state snapshot, and the navigation state. (`form.js` is only the EW workspace wrapper — it mounts the element via `decorateEditor(block)` and, when `ew.enabled` is set, the header + docked chat.) The element passes the engine plus the selection callback to the children:

```js
<nx-editor
  .editor=${this._editor}
  .state=${this._state}
  .nav=${this._nav}
  .onSelect=${this._onSelect}
></nx-editor>

<nx-sidebar
  .state=${this._state}
  .nav=${this._nav}
  .onSelect=${this._onSelect}
></nx-sidebar>
```

Components call the engine directly (`engine.setField(...)`, `engine.addItem(...)`). They do not signal the shell — the engine calls its `onChange` callback after every mutation, and the shell pulls a fresh snapshot in response. The engine has only one notification path (mutations); save-status updates live entirely in the form block's `persistence.js` and are not signalled through the SDK. Selection changes go through `onSelect(pointer, origin)`.

Shell ↔ direct-child communication uses property bindings and callbacks. CustomEvents are used only for bubbled signals from nested components that cross a shadow root (e.g. `array-menu` → editor).

---

## 4. Navigation state

Lives in the shell only. Shape:

```js
nav = { pointer, origin, seq }
```

- `pointer` — RFC 6901 pointer of the focused field
- `origin` — `'editor' | 'sidebar' | null`. Drives scroll-sync: when origin is `'sidebar'`, the editor scrolls; when `'editor'`, the sidebar scrolls.
- `seq` — monotonic counter so re-selecting the same pointer still triggers scroll.

Components receive `nav` as a prop and call `onSelect(pointer, origin)` to update it.

---

## 5. Input debouncing

Lives in [views/editor.js](../views/editor.js), keyed per pointer, default 350ms. Boolean, select, and array mutations are immediate.

```js
_mutateDebounced(pointer, fn) {
  clearTimeout(this._inputTimers.get(pointer));
  this._inputTimers.set(pointer, setTimeout(() => {
    this._inputTimers.delete(pointer);
    this._mutate(fn);   // → fn(this.editor); state notification flows through editor.onChange
  }, DEBOUNCE_MS));
}
```

Debouncing lives in the UI component, not the SDK. The SDK's mutations are synchronous and assume the caller has already decided when to apply them.

Note: a navigation away within the debounce window currently drops the last keystroke. Address with a `beforeunload` flush if it becomes a problem.

---

## 6. Context routing

`utils/context.js#loadFormContext` decides what to show for a given document. See [request-flow.md](./request-flow.md) for the full state machine. Possible outcomes:

- `ready` — document loaded, schema bound, mount the editor.
- `select-schema` — empty document, project has schemas, show a picker.
- `no-schemas` — empty document, project has no schemas, link to the schema editor.
- `blocked` — not a document / wrong shape / no access / load failed / missing schema.

Schema discovery (`utils/schemas.js`) and DA storage (`utils/da-api.js`) live in nexter — the SDK only operates on a schema object.

---

## 7. Persistence — owned by the form block

The SDK engine is a pure state machine; it does not persist. The form block owns persistence entirely via [`utils/persistence.js`](../utils/persistence.js), which exposes a `notify()` method that the shell's `onChange` handler calls. When a mutation has actually changed the document, the persistence serializes and POSTs to DA. Single-flight with re-queue prevents out-of-order overwrites.

Wiring (in `editor.js`):

```js
import { createEngine } from '../../deps/da-sc-sdk/dist/index.js';
import { attachPersistence } from './utils/persistence.js';

// In _start — single synchronous creation. The SDK's createEngine doesn't
// fire onChange at init, so we never see a spurious "save" from the load
// itself — no flag, no observing toggle.
this._editor = createEngine({ schema, document: json, onChange: this._onChange });
this._state = this._editor.getState();
this._persistence = attachPersistence(this._editor, { path: this._details?.fullpath });

// On teardown (`_loadContext` reset, hashchange to a different doc):
this._persistence?.detach();
```

`persistence.js` is ~50 lines, self-contained: it imports `convertJsonToHtml` from the SDK and accepts a `save` function (default `saveSourceHtml` from `./da-api.js`). The form block's call site is one line — no callback factory needed. If a save-indicator UI is ever added, the persistence would gain a status callback at that time.

For test details on the single-flight + re-queue contract, see [test/unit/blocks/form/utils/persistence.test.js](../../../test/unit/blocks/form/utils/persistence.test.js).

---

## 8. Configuration

The form reads these keys from the Experience Workspace config sheet. Site config overrides org config. See the public [Structured content](https://www.aem.live/docs/ew/administering/structured-content) and [Configs](https://www.aem.live/docs/ew/administering/configs) guides.

| Key | Value | Effect |
|---|---|---|
| `editor.path` | `/<ORG>/<SITE>/<FOLDER>=https://da.live/form#` | Opens documents in that folder with the structured content editor. Read by da-live, not by this block. |
| `editor.structuredContent.jsonPreview` | `false` | Removes the JSON preview panel, which is shown by default (`editor.js`, `utils/config.js`). |

---

## 9. Rules

### NEVER

- Let UI mutate document state directly (always via `engine.setField` etc).
- Let UI call persistence directly. Mutations flow into the SDK engine; persistence observes engine state via the shell's `onChange` → `persistence.notify()` path.
- Re-implement engine concerns (schema compilation, validation, serialization) in the shell — those belong in the SDK.

### ALWAYS

- Keep UI/navigation state local to the shell (`_nav`, focus, scroll, debounce).
- Use JSON Pointer for canonical addressing in props and event payloads.
- Refresh the bundled SDK via `npm install` + `npm run build:da-sc-sdk` after bumping `@adobe/da-sc-sdk` in `package.json`.
