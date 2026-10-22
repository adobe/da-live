# Form — Request flow

How a request moves through the block.

---

## 1. Initial load

From `decorate(block)` to a rendered editor (or a status screen).

```txt
decorate(block)                                  ← form.js (EW workspace wrapper)
  ├─ ensureAppFrame() / ensureNavPath()          sync
  ├─ decorateEditor(block)                        sync
  │    ├─ create <nx-form>                         sync
  │    └─ nxForm.startRouting()                    ← subscribe ctx to hashChange
  ├─ setupChat(block)                             ← header + docked chat when ew.enabled
  └─ <nx-form> upgrades                            ← editor.js element
       ├─ connectedCallback → adoptedStyleSheets sync
       ├─ hashChange emits → set `ctx`            sync
       ├─ updated(changed) sees `ctx`             sync
       └─ _loadContext()
            ├─ _details = detailsFromCtx(ctx); bail if none
            ├─ status = 'loading' → render nothing (no spinner, no message)
            ├─ loadFormContext({ details })      ← network
            │    ├─ loadSchemas({ owner, repo })     ← DA list + N source GETs
            │    └─ fetchSourceHtml({ sourceUrl })    ← single GET
            ├─ if status !== 'blocked':
            │    └─ await import(`${getNx2()}/public/sl/components.js`)  ← SL components
            ├─ Route by status:
            │    ├─ 'blocked'        → inline message (no modal, no extra import)
            │    ├─ 'select-schema'  → schema picker
            │    ├─ 'no-schemas'     → "Create a schema" CTA
            │    └─ 'ready'          → _start({ schema, json })
            └─ _start({ schema, json })
                 ├─ createEngine({ schema, document, onChange })   ← synchronous
                 │    (engine compiles schema, builds model, validates;
                 │     onChange suppressed during init. See
                 │     [SDK lifecycle.md §1](https://github.com/adobe-rnd/da-sc-sdk/blob/main/docs/lifecycle.md#1-createengine-lifecycle)
                 │     for the full call flow.)
                 └─ attachPersistence(engine, { path })             ← single-flight save layer
       → render editor + sidebar + preview
```

**Context routing.** [`loadFormContext`](../utils/context.js) consults the loaded HTML in this order:

| Condition                         | Resulting status            | UI                     |
| --------------------------------- | --------------------------- | ---------------------- |
| `details` is not an HTML resource | `blocked: not-document`     | "Unsupported resource" |
| Source GET fails 401/403          | `blocked: no-access`        | "No access"            |
| Source GET fails 404              | `blocked: not-document`     | "Unsupported resource" |
| Source GET fails other            | `blocked: load-failed`      | "Couldn't open"        |
| HTML is empty AND schemas exist   | `select-schema`             | Schema picker          |
| HTML is empty AND no schemas      | `no-schemas`                | "Create a schema" CTA  |
| HTML is not structured content    | `blocked: not-form-content` | "Unsupported resource" |
| HTML has unknown `schemaName`     | `blocked: missing-schema`   | "Schema not found"     |
| Otherwise                         | `ready`                     | Editor                 |

**What's lazy.** `sl/components` is dynamic-imported inside `_loadContext` for every non-`blocked` status (editor and both empty-document screens render SL form fields). `array-menu` and `reorder` are dynamic-imported from the editor's `firstUpdated`. Nothing gates first paint — the transient `loading` status renders nothing at all.

---

## 2. Text input (the most frequent path)

Single keystroke into a text or number `<input>`.

```txt
DOM <input> @input
  └─ editor._onTextInput(node, e)
       └─ editor._mutateDebounced(pointer, fn)         ← 350ms per-pointer timer
            └─ [350ms later]
                 └─ editor._mutate(fn)
                      └─ engine.setField(pointer, value)
                         (engine commits new state, fires onChange — see
                          [SDK lifecycle.md §2](https://github.com/adobe-rnd/da-sc-sdk/blob/main/docs/lifecycle.md#2-mutation-lifecycle)
                          for the commit pipeline)
                                ↓
                          shell._onChange()
                            ├─ this._state = engine.getState()
                            │    → Lit re-renders <nx-form> + children
                            └─ persistence.notify()
                                 → single-flight save (see §4)
```

The engine knows nothing about persistence. It fires `onChange` after every mutation; whether that triggers a save is the form block's decision (made in `_onChange` → `persistence.notify()`).

**Why debounced.** Native `<input>` value echo is immediate; the model/validation/save pipeline runs in the background after 350ms of quiet. Typing always feels instant regardless of document size.

---

## 3. Boolean / select / button action (immediate)

Toggle a checkbox, change a select, or click an array action.

```txt
DOM @change or @click
  └─ editor._onBooleanInput | _onSelectInput | array event handler
       └─ editor._mutate(fn)                    ← no debounce
            └─ engine.setField | addItem | insertItem | removeItem | moveItem
               (same SDK commit + onChange path as §2 → shell re-render + persistence.notify())
```

Immediate because there is no per-keystroke noise to coalesce — a single discrete user action.

---

## 4. Save lifecycle

Lives entirely in [`utils/persistence.js`](../utils/persistence.js). The SDK has no save concept; persistence observes the engine via the shell's `onChange` handler and runs a single-flight POST loop on its own.

Triggered every time the shell's `onChange` fires (after every real mutation).

```txt
shell._onChange()
  └─ persistence.notify()
       ├─ reference-compare state.document vs last captured
       │    (mutate.js deep-clones on every real mutation → new ref = new content)
       ├─ if same reference: return (no-op)
       └─ persist()  ← async, NOT awaited by notify
            │
            ├─ if inFlight:
            │    └─ pending = true; return
            │       (current branch will re-iterate with the latest state)
            │
            └─ inFlight = true
                 └─ do {
                      pending = false
                      const { html, error } = convertJsonToHtml({
                        json: engine.getState().document,
                      })
                        ├─ prune(data)               ← strips empty/null
                        └─ json2html({ ...json, data: pruned })
                      if error: return              ← do-while exits cleanly
                      try {
                        await save({ path, html })  ← source.save({ body }) (nx2 api)
                          └─ daFetch (auth + retry handled in the nx2 api)
                      } catch {
                        return                       ← do-while exits cleanly
                      }
                 } while (pending)
                 inFlight = false
```

### Key properties

- **Fire-and-forget at the mutation site.** `engine.setField` returns synchronously. UI never waits on the network.
- **Single-flight.** At most one POST is in flight. New mutations during a save flip `pending`.
- **Latest-wins.** When the in-flight save completes with `pending=true`, the loop iterates and POSTs `engine.getState().document` again — which reflects every edit that happened during the wait. An earlier POST cannot land after a newer one.
- **Errors stop the loop.** A failed POST exits the loop cleanly; the next user edit kicks off a fresh save. No infinite retry.
- **`detach()` halts everything.** A teardown (hashchange / context reset) calls `persistence.detach()`; subsequent `notify()` calls become no-ops. A stale in-flight save from a previous document cannot trigger a resave of the new one.
- **No save status in the SDK.** The engine never emits a `saveStatus` field. If a save-indicator UI is added later, the form block's persistence would gain a status callback at that layer — the SDK stays uninvolved.

Contract details verified by [test/unit/blocks/form/utils/persistence.test.js](../../../test/unit/blocks/form/utils/persistence.test.js).

---

## 5. Array operations

```txt
addItem → click "Add item" button
  └─ editor._mutate(engine => engine.addItem(arrayPointer))
     (engine guards maxItems/readonly, seeds defaults for the new item, commits)

removeItem → array-menu "Remove"
  └─ engine.removeItem(itemPointer)
     (engine guards minItems/readonly, removes the item, commits)

moveItem  → reorder dialog confirm
  └─ engine.moveItem(arrayPointer, fromIndex, toIndex)
     (engine guards length/readonly, reorders, commits)
```

Each commit flows through the same `onChange` path as §2: shell re-renders, persistence saves. See [SDK schema-builder.md](https://github.com/adobe-rnd/da-sc-sdk/blob/main/docs/schema-builder.md) and [SDK model-builder.md](https://github.com/adobe-rnd/da-sc-sdk/blob/main/docs/model-builder.md) for how the engine builds default-seeded items and rebuilds the model.

After a reorder, the model is rebuilt positionally — items have no separate stable id. DOM nodes are diffed by index; focus tracking lives at the editor level via `data-pointer` attributes.

---

## 6. Schema picker (empty document)

```txt
context.status === 'select-schema'
  └─ render <form-picker> + Create button
       └─ user picks a schema, clicks Create
            └─ nx-form._applySelectedSchema()
                 ├─ build empty json: { metadata: { schemaName }, data: {} }
                 ├─ context = { ...context, status: 'ready', schema, json }
                 └─ _start({ schema, json })   ← same entry as §1's _start
```

Result: an empty doc loaded with the picked schema, defaults already materialized by the engine, ready to type. The materialization rule lives in the SDK — see [SDK architecture.md §10](https://github.com/adobe-rnd/da-sc-sdk/blob/main/docs/architecture.md).

---

## 7. Hash change

```txt
window hash changes
  └─ hashChange emits new { org, site, path }   ← editor.js subscribed in startRouting()
       └─ ctxFromHashState(state) → set `ctx`
            └─ updated() sees `ctx` → _loadContext() → see §1
```

The `nx-form` element subscribes to `hashChange` once (in `startRouting`); a new hash sets `ctx`, which re-runs `_loadContext`. No element teardown/re-mount — `_loadContext` resets state and detaches the previous persistence in place.

---

## 8. State change notification

The engine fires `onChange` exactly once per mutation (and never at construction — see [SDK lifecycle.md §1–§2](https://github.com/adobe-rnd/da-sc-sdk/blob/main/docs/lifecycle.md) for the contract). The shell wires it once in `_start`:

```js
this._onChange = () => {
  this._state = this._editor.getState();
  this._persistence?.notify();
};
```

That's the entire seam. The shell's reactive Lit property `_state` triggers re-render; `notify()` runs single-flight save (§4). No `requestUpdate`, no events, no manual diffing — every mutation reaches both UI and persistence through this one callback. The engine has no save-status concept of its own; that lives entirely in the form block's `persistence.js`.

---

## Cross-references

- Detailed contracts and rules: [architecture.md](./architecture.md)
- Schema contract (what consumers can write): SDK [schema-spec.md](https://github.com/adobe-rnd/da-sc-sdk/blob/main/docs/schema-spec.md)
- Headless / agentic consumer example: SDK [headless-consumer.md](https://github.com/adobe-rnd/da-sc-sdk/blob/main/docs/headless-consumer.md)
