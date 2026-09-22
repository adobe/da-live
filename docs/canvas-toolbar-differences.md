# Canvas toolbar: why the real version is buggier than the toy

Companion to `docs/canvas-toolbar-architecture.md` and the rig in `toy/`.

`toy/` reproduces the host ↔ quick-edit-iframe relationship in ~890 lines with nothing else
attached: no Yjs, no collab server, no IMS, no da-nx, no Lit, no network. It uses the same
wire protocol (`toy/message-types.js` mirrors da-nx's `nx/utils/message-types.js`
string-for-string) and the same `data-prose-index` position contract. Everything in it
works.

This document lists what the product does differently, and which of those differences are
actually buying us something.

Each item is tagged:

- **(A) Accidental** — the toy's approach would work in production today.
- **(B) Essential** — caused by something real the toy omits (collab, cross-origin, Lit).
- **(C) Essential cause, accidental handling** — the constraint is real, but the product
  pays for it more expensively than it needs to.

The **(C)** items are where the leverage is.

All line references are against the `tbctrl` branch (PR #1175).

---

## 1. Selection origin is recovered after the fact instead of known at entry — (C)

**Real.** Both surfaces write into the same ProseMirror view, so the doc's own selection
observer fires on iframe-mirrored transactions too and has to be taught to ignore them.
That costs an entire plugin whose only job is remembering where a selection came from:

- `createSelectionToolbarPlugin` — `blocks/canvas/editor-utils/selection-toolbar.js:43-72`
- `NX_QUICK_EDIT_IFRAME_SELECTION_META` — `selection-toolbar.js:8`
- `NX_QUICK_EDIT_CLEAR_IFRAME_SELECTION_ORIGIN_META` — `selection-toolbar.js:11`
- reset rule on `tr.selectionSet` — `selection-toolbar.js:53`
- reader `getSelectionOriginFromIframe` — `selection-toolbar.js:15-17`
- bail-out in the observer — `selection-toolbar.js:63`

**Toy.** The host learns the origin at the message boundary — `handleSelectionChange` is
only reachable from a `selection-change` message — and calls `surface.setPageSelection()`
directly. No plugin, no metas, no reset rule.

**Why it matters.** The product reconstructs, from transaction metadata, a fact it already
had at the point of entry and then discarded. Every new transaction source (collab, undo,
a command, a future feature) must be classified by that plugin, and `tr.selectionSet`
returning `{ fromIframe: false }` is a guess about intent, not a fact.

**Portable fix.** Set surface/selection state in the message handlers, where origin is
certain; let the plugin report only the doc selection. Most of the origin machinery in
`selection-toolbar.js` can then be deleted.

---

## 2. One `showable` slot shared by two surfaces — (A)

**Real.** `state.showable` is a single boolean (`toolbar-controller.js:20`) written by
three places:

- `setDocSelection` — `toolbar-controller.js:195`
- `setWysiwygSelection` — `toolbar-controller.js:202`
- the window-blur handler — `toolbar-controller.js:102`

Because they would clobber each other, `setDocSelection` needs a guard:

```js
setDocSelection({ showable }) {
  if (state.activeSurface === 'wysiwyg') return;   // :194
  state.showable = showable;
  scheduleRender();
}
```

**Toy.** `docSelection` and `pageSelection` are separate fields (`toy/surface.js`). The
inactive surface's value is simply not read.

**Why it matters.** That guard is a symptom: one variable representing two things requires
a correctness check on every write, and any path that forgets it is a bug. The window-blur
handler at `:102` writes `showable` without one.

---

## 3. Five write paths to `activeSurface`, two of which also write selection state — (A)

**Real.**

| path | line | also writes |
| --- | --- | --- |
| `activate()` | `toolbar-controller.js:175-181` | — |
| `deactivate()` | `:185-189` | — |
| `setWysiwygSelection()` | `:200-205` | `showable` |
| window-blur handler | `:101-102` | `showable`, bypasses the public API |
| `reset()` | `:219-224` | `showable`, `docView` |

**Toy.** `setActive()` changes the surface and nothing else. `setDocSelection` /
`setPageSelection` change selection and never touch the surface.

**Why it matters.** When a selection report also claims the surface, the outcome depends on
the arrival order of two messages that have no ordering guarantee. Separating the two
concerns makes the order irrelevant.

---

## 4. The focus lie survived the refactor, and there are now two of them — (C)

**Real.** `installSurfaceFocusGuards` (`toolbar-controller.js:123-133`) *permanently*
monkey-patches the live, shared view object:

```js
view.hasFocus = () => state.activeSurface === 'wysiwyg' || realHasFocus();
view.focus = () => { if (state.activeSurface === 'wysiwyg') return; realFocus(); };
```

and `dispatchWithFakeFocus` (`editor-utils.js:11-31`) applies a *second*, temporary lie
around every mirror dispatch.

**Toy.** Zero focus lies, and nothing reads focus for visibility.

**Why it matters.** The lie's only real consumer is y-prosemirror's cursor plugin — a
collab-awareness concern that has leaked into the toolbar module and now patches a
ProseMirror view other code shares. The `view.focus()` neuter is the sharp edge: **every**
caller (commands, drop handlers, `restoreFocus` at `:215`) silently becomes a no-op while
wysiwyg is active, with no error and no log.

**Portable fix.** The lie belongs behind the awareness layer — a cursor plugin that takes
an explicit `isLocalCursorVisible()` predicate instead of calling `view.hasFocus()`.
(`deps/da-y-wrapper/src/da-cursor-plugin.js` is currently untracked in the working tree,
which suggests this is already being explored.) Then `installSurfaceFocusGuards` and
`dispatchWithFakeFocus` both disappear.

---

## 5. The controller reads visibility state back off the element it controls — (A)

**Real.** `shouldShow(tb)` (`toolbar-controller.js:44-49`) reads `tb.linkDialogOpen`,
`tb.altDialogOpen` and `tb.isInteracting` — state that lives on the *element*, can change
without telling the controller, and is re-tested in `render()`'s else-branch (`:64`).
Keeping it in sync requires a manual `refresh()` (`:209-211`) from every dialog and picker
close path.

**Toy.** State flows one way: controller → snapshot → renderer. The toolbar stores nothing
and decides nothing.

**Why it matters.** "Single owner of visibility" is not true if the owner's predicate
depends on mutable state it does not own. Every missed `refresh()` is a stuck toolbar.

---

## 6. Focus loss is detected and compensated, instead of prevented — (C)

**Real.** Three overlapping mechanisms:

1. `focusout` on the prose element with `setTimeout(0)`, then a check for whether focus
   landed on the toolbar — `ew-editor-doc.js:187-196`
2. `installOutsidePointerdown` with a `composedPath()` hit-test against three elements —
   `toolbar-controller.js:135-150`
3. `deactivate(surface)` with an ownership guard so a late blur from one surface can't wipe
   the other — `toolbar-controller.js:185-189`

**Toy.** Toolbar buttons call `preventDefault()` on `mousedown`, so clicking one never
moves focus. The question "did focus land on the toolbar?" never arises.

**Why it matters.** The real code *also* does the mousedown suppression (noted at
`toolbar-controller.js:216`) — it just kept the detection machinery too. The deferred
focusout check is the classic source of order-dependent flicker.

---

## 7. `suppressRerender` is a bare flag with unbalanced set/reset pairs — (A, latent bug)

**Real.** Set and cleared by hand at six-plus sites: `handlers.js:66-68`, `:130-132`,
`:224-226`, `:235-237`; `editor-utils.js:84-86`; `image.js`. Several sit inside a `try`
whose `catch` only logs:

```js
ctx.suppressRerender = true;
dispatchWithFakeFocus(view, tr.scrollIntoView());
ctx.suppressRerender = false;        // handlers.js:66-68 — skipped if dispatch throws
// ...
} catch (error) {
  console.error('Error moving cursor:', error);
}
```

If `dispatch` throws, the flag stays `true` **for the rest of the session**: the iframe
silently stops receiving `set-body` forever, and the error is swallowed.
`editor-utils.js:84-86` has no `try` at all, so the same throw escapes with the flag stuck.

**Toy.** Two sites, and every command goes through one `runCommand()`.

**Portable fix.** `try/finally`, or a `withSuppressedRerender(ctx, fn)` helper. Worth doing
regardless of any other refactor — a one-line-class bug with a session-long blast radius.

---

## 8. A third visibility axis that stops disambiguating exactly when it's needed — (B/C)

**Real.** `editorModeAllows` (`toolbar-controller.js:36-40`) gates on
`'layout' | 'content' | 'split'`, so visibility is surface × showable × mode. But in
`split` **both** surfaces are allowed — the mode axis contributes nothing in the one
configuration where surface ambiguity is real.

**Toy.** Two axes. Split view is the only case, and the surface axis alone handles it.

**Why it matters.** Mode is genuinely needed to hide the toolbar for a pane that isn't
rendered — but that is derivable from "is this surface mounted", not a third independent
state variable to keep in sync.

---

## 9. A module singleton serving per-document Lit elements — (B, not proven by the toy)

**Real.** `toolbar-controller.js` holds module-level state (`:11-22`) and install-once
booleans (`:13-14`). The listeners installed by `installOutsidePointerdown` and
`installIframeFocusDetection` are **never removed** — `reset()` (`:219-224`) doesn't
uninstall them. Its clients, meanwhile, are Lit elements that connect and disconnect per
document. Hence defensive code like "never clobber with null" (`:56-58`) and the
`willUpdate` teardown ritual (`ew-editor-doc.js:46-58`, seven fields reset by hand).

**Toy.** Single page lifetime, so no teardown story is needed — the toy **sidesteps** this
rather than solving it.

**Why it matters.** Stale listeners closing over previous-document state is a plausible
source of the "toolbar appears on the wrong document after navigation" class of bug. This
one needs its own investigation.

---

## 10. Write-back needs a text diff to find what changed — (C)

**Real.** `updateState` (`editor-utils.js:43-111`) applies a `node-update`, then uses
`findInsertedRange()` to diff old versus new text, infer where characters were inserted,
and re-apply stored marks there — because keystrokes go to the iframe, so ProseMirror's
normal mark-on-input never runs. Only if that heuristic finds a range does it sync the node
back.

**Toy.** `runCommand()` knows a command ran and which block holds the caret, so it always
sends a targeted `set-editor-state`. Nothing is inferred.

**Why it matters.** A text diff cannot distinguish an insertion from an equal-length
replacement, so mark application is heuristic. The information ("a mark command ran, on
this block") exists at the call site and is thrown away before it is needed.

---

## 11. Instrumented HTML has three consumers, so the format can't change cheaply — (B)

**Real.** `getInstrumentedHTML` is ~84 lines (`editor-utils.js:174-258`) with block markers
and table sentinels, and its output feeds three subsystems: the iframe body, the
`selectBlockMeta` map (`:389-402`, rebuilt via a bus subscription on every emit), and the
page outline. One keystroke re-serializes the document, re-parses it and rebuilds the
metadata map (`ew-editor-doc.js:78-82`).

**Toy.** ~12 lines, one consumer.

**Why it matters.** Not a bug in itself, but it means the position contract cannot be
changed without touching three subsystems — which is why problems there tend to be worked
around rather than fixed.

---

## 12. Two accepted shapes for both handshake messages — (A)

**Real.** `init` is posted with deprecated top-level `init`/`location` *and* `type`/`payload`
(`ew-editor-wysiwyg.js:170-178`); `ready` is accepted as either `type === READY` or a flat
`ready === true` (`:165-166`); plus `_scheduleQuickEditInitRetries` and
`_disposeQuickEditLocalPort`.

**Toy.** One shape each, no retries.

**Why it matters.** Compatibility shims are legitimate, but they double the states the
handshake can be in, and the retry timer means `init` can land more than once.

---

## 13. Collab makes transaction origin genuinely ambiguous — (B)

**Real.** Transactions arrive from local typing, the iframe mirror, `ySyncPlugin` remote
peers, and undo/redo. A remote edit shifts positions under the iframe's cached
`data-prose-index`, which is why da-nx needs drift-tolerant `findTextBlock` and a `reload`
escape hatch. It is also why `setDocSelection` must never claim the surface
(`toolbar-controller.js:191-193`) while `setWysiwygSelection` always does — a background
collab transaction must not pop the toolbar.

**Toy.** Single writer; positions only move from known local edits.

**Why it matters.** This is the one irreducible source of complexity — and it is the reason
item 1's fix matters: with origin known at entry, collab transactions are simply the ones
that didn't come through a message handler.

---

## Suggested order of attack

1. **Item 7** — `try/finally` around `suppressRerender`. Standalone, tiny, fixes a
   session-long failure mode.
2. **Item 2** — split `showable` into per-surface fields; delete the `:194` guard.
3. **Item 3** — stop `setWysiwygSelection` claiming the surface; claim it explicitly in the
   message handlers.
4. **Item 1** — with 3 in place, most of `selection-toolbar.js`'s origin plugin and both
   metas can be removed.
5. **Item 4** — move the focus lie behind the cursor plugin; delete
   `installSurfaceFocusGuards` and `dispatchWithFakeFocus`.
6. **Item 5** — push interaction state into the controller so `shouldShow` is pure.

Items 1–5 are each independently shippable, and each deletes more code than it adds.
Item 9 (lifecycle) is not covered by the toy and needs its own investigation.
