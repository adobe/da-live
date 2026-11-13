# Form — Architecture

JSON Schema-driven structured content editor. A thin Lit element wires [da-sc-sdk](https://github.com/adobe-rnd/da-sc-sdk) (the headless engine for state, mutation, validation, and HTML serialization) to a set of Lit components that render the model and dispatch user input back into the SDK.

The block runs inside the Experience Workspace (EW) and has two entry files.

- `form.js` decorates the block. It sets up the EW workspace (app-frame grid, canvas header, tools panel, docked chat) and mounts the editor.
- `editor.js` defines the `ew-form-editor` Lit element, which owns the SDK and the editing UI.

The block's elements use the `ew-form-` prefix, the way canvas uses `ew-canvas-`.

The code was moved from da-nx's `nx/blocks/form` to da-live's `blocks/form`.

The `/form` page content declares the block as `nx-form`. The nx2 loader loads `nx-` blocks listed in `NX_BLOCKS` ([`nx2/scripts/nx.js`](https://github.com/adobe/da-nx/blob/main/nx2/scripts/nx.js)) from da-nx. Pages that declare a `form` block load `blocks/form/form.js` from da-live's codeBase instead.

The block imports nx2 exports such as `loadStyle`, `hashChange`, `openPanel`, `getEWFlags` and the `source` api at runtime through `` await import(`${getNx2()}/...`) ``, with `getNx2()` from `scripts/utils.js`. Pages with `<meta name="nxver" content="2">` load nx2 from the same base URL, so these imports return the module instances the page already loaded. This includes the stateful `nx2/scripts/nx.js`.

For engine internals such as schema compilation, model build, validation, defaults policy and persistence semantics, see the SDK's [architecture.md](https://github.com/adobe-rnd/da-sc-sdk/blob/main/docs/architecture.md). This document only covers the da-live form block and what it adds on top.

---

## 1. Layout

```txt
blocks/form/
  form.js                 EW workspace wrapper with the app-frame grid, tools panel (outline) and docked chat (flag-gated)
  form.css                workspace layout
  editor.js / .css        ew-form-editor Lit element: routes (ctx/hash), mounts SDK, state snapshot + nav
  events.js               formEvents, the observable channels between ew-form-editor and its tool panel views
  icons.js                sprite-backed icon() helper
  fields/                 Spectrum 2 field components (ew-form-input, ew-form-picker, ew-form-checkbox, ...)
  tool-panel/
    host.js               toolPanelHost, the form's delegate for the shared tool panel
    outline/
      outline-view.js     createOutlineView, the form's Outline view of the tools panel
      outline.js / .css   ew-form-outline, the groups of the document in the tools panel
  utils/
    context.js            loadFormContext — routes documents to ready / blocked / select-schema
    da-api.js             fetch/save against DA source via the nx2 source api
    schemas.js            loadSchemas — schema discovery + module cache
    persistence.js        attachPersistence — single-flight save with re-queue
    safe-href.js          safeHref — drops links that run script or local programs
    rich-text/            rich-text editor setup, schema, codec, commands, toolset and floating toolbar placement
  views/
    editor.js / .css      ew-form-fields, field rendering + array rendering
    preview.js / .css     ew-form-preview, read-only JSON preview
    array-menu.js         ew-form-array-menu, per-item actions
    reorder.js            ew-form-reorder, reorder dialog
  deps/                   prism syntax highlighting
  docs/                   (this directory)
```

The block uses the bundled SDK at [`deps/da-sc-sdk/dist/index.js`](../../../deps/da-sc-sdk/dist/index.js). It is built from the published [`@adobe/da-sc-sdk`](https://www.npmjs.com/package/@adobe/da-sc-sdk) npm package, which [`deps/da-sc-sdk/src/index.js`](../../../deps/da-sc-sdk/src/index.js) re-exports. To update the SDK, bump its version in `package.json`, run `npm install`, then run `npm run build:da-sc-sdk` from the repo root.

---

## 2. Dependency direction

```txt
form.js (workspace) →  editor.js          (mounts the ew-form-editor element; sets up header + chat)
form.js (workspace) →  tool-panel/host.js (the tools panel views)
tool-panel/host.js →  tool-panel/outline/ (the Outline view, loaded lazily)
editor.js (element) →  da-sc-sdk          (createEngine, convertJsonToHtml)
editor.js          →  utils/              (loadFormContext, attachPersistence)
editor.js          →  views/ + fields/    (editor, preview, S2 field components)
editor.js          →  events.js           (publishes state and selection, handles jumps)
tool-panel/outline/ →  events.js           (subscribes to state and selection, publishes jumps)
utils/context.js   →  da-sc-sdk          (convertHtmlToJson)
utils/persistence.js → da-sc-sdk        (convertJsonToHtml)
fields/rich-text.js → utils/rich-text/  (editor, commands, tools, bubble)
fields/rich-text.js → da-y-wrapper      (ProseMirror, loaded on demand)
fields/rich-text.js → blocks/shared/    (da-link-dialog)
fields/rich-text-toolbar.js → nx2       (picker and popover, loaded on demand)
views/           →  (SDK engine only via prop binding from the element — no direct imports)
```

The SDK is the only piece that holds canonical state. Everything in `utils/`, `views/` and `tool-panel/` is specific to the form block. That covers DA I/O, UI components, schema discovery and single-flight save.

Rich-text fields (`"x-semantic-type": "rich-text"`) render a ProseMirror editor in `fields/rich-text.js`. The SDK owns their value contract and storage, as its [schema spec](https://github.com/adobe/da-sc-sdk/blob/main/docs/schema-spec.md) describes. ProseMirror comes from the `da-y-wrapper` bundle the Canvas editor already loads, so the form block does not bundle it.

The editor schema in `utils/rich-text/schema.js` only allows the subset the SDK keeps. The field gets its editor from `utils/rich-text/editor.js`, which loads ProseMirror on demand and puts the schema, the codec and the toolset together, so the field does not depend on ProseMirror. The codec in `utils/rich-text/codec.js` reads and writes values with ProseMirror today. The SDK brings each value into its canonical HTML when it saves. Parity tests run every case through the SDK converters, so a saved value reloads as the same document.

The toolbar in `fields/rich-text-toolbar.js` renders a toolset that `utils/rich-text/tools.js` binds to the editor. Each tool carries its own command and selection checks, and the toolbar fires `form-rich-text-command` for the field to run. The toolbar holds no rich-text knowledge, so a new tool only changes the toolset.

---

## 3. Shell wiring

`editor.js` (the `ew-form-editor` element) instantiates the SDK engine with the (schema, document, onChange) triple. It holds the current state snapshot and the navigation state. `form.js` only wraps the EW workspace. It mounts the element via `decorateEditor(block)`, registers the tools panel, and adds the header and docked chat when `ew.enabled` is set. The element passes the engine and the callbacks to its children:

```js
<ew-form-fields
  .editor=${this._editor}
  .state=${this._state}
  .nav=${this._nav}
  .onSelect=${this._onSelect}
></ew-form-fields>
```

Components call the engine directly (`engine.setField(...)`, `engine.addItem(...)`). They do not signal the shell — the engine calls its `onChange` callback after every mutation, and the shell pulls a fresh snapshot in response. The engine has only one notification path (mutations); save-status updates live entirely in the form block's `persistence.js` and are not signalled through the SDK. Selection changes go through `onSelect(pointer, origin)`.

Shell ↔ direct-child communication uses property bindings and callbacks. CustomEvents are used only for bubbled signals from nested components that cross a shadow root (e.g. `array-menu` → editor).

### Outline in the tools panel

The tools panel is the shared `da-tool-panel` from [`blocks/shared/tool-panel`](../../shared/tool-panel/). Canvas and the form register it through the same helper, [`tool-panel-section.js`](../../shared/tool-panel/tool-panel-section.js), which owns the section config and keeps the panel in sync with the hash. Each editor passes a host delegate that supplies its views and, optionally, which views are pinned and how the active view is remembered.

The form's host is `toolPanelHost` in `tool-panel/host.js`. It offers one view, the **Outline**, [`createOutlineView()`](../tool-panel/outline/outline-view.js), which loads `ew-form-outline`. Canvas has its own Outline under the same name. Canvas's edits the page structure, while the form's navigates the groups of the document, so the two share no code.

Offering another view is one more entry in `getViews`. Views shared with canvas, such as Content and Preflight, come in a later change.

The outline (`tool-panel/outline/outline.js`) lives in the tools panel aside, outside the element's tree, so property bindings can't reach it. The two talk through `formEvents` ([`events.js`](../events.js)), built on `createChannel` from [`blocks/shared/channel.js`](../../shared/channel.js).

| Channel | Publisher | Payload |
|---|---|---|
| `formState` | `ew-form-editor` | Engine state snapshot, or null while no document is loaded |
| `selectionState` | `ew-form-editor` | `nav` |
| `jumpRequest` | outline | `{ pointer }` of the group or field to reveal |

The `*State` channels replay their last value, so an outline that mounts later still renders right away. A jump becomes `onSelect(pointer, 'outline')`, and the editor scrolls the target to the top of its scroller at once.

The outline lists the groups of the model, which are the root and every object and array below it. Array items show their position as `#n` before their label. The row of the current selection is marked, and only a selection changes it, not scrolling the editor. Rows hang from their parent by tree lines, like the former navigation sidebar. A selection made in the editor brings its row into view.

`form.js` registers the `tools` panel section with the shared `da-tool-panel` and the Outline view. Like canvas and the chat, the panel reopens when it was open last time.

---

## 4. Navigation state

Lives in the shell only. Shape:

```js
nav = { pointer, origin, seq }
```

- `pointer` — RFC 6901 pointer of the focused field
- `origin` is `'editor'`, `'outline'` or `null`. When origin is `'outline'`, the editor reveals the pointer. The outline marks the row of the pointer in both cases, and brings it into view when origin is `'editor'`.
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

Schema discovery (`utils/schemas.js`) and DA storage (`utils/da-api.js`) live in the form block. The SDK only operates on a schema object.

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
