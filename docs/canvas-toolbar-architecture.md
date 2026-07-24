# Canvas selection-toolbar architecture

Status: design (pre-implementation)
Scope: the shared selection toolbar across the canvas doc editor and the WYSIWYG
iframe, in all three view modes (`layout`, `content`, `split`).

This document is the **authority contract** for a redesign. It exists because the
current implementation, and a prior refactor attempt (PR #1018, closed), both
suffer from the toolbar intermittently failing to appear — most visibly on the
WYSIWYG (layout) side of split view. The contract below is grounded in three
investigation spikes whose findings are summarised at the end.

---

## 1. Background: what exists today

- There is **one** ProseMirror view — the doc editor's (`ew-editor-doc`). It is
  always the command target. The WYSIWYG pane is a cross-origin iframe (the da-nx
  "quick-edit" preview) running its own editors that mirror state to the doc view
  over a `MessageChannel`. Keeping the doc view as the single command target is
  correct and is **retained** by this design.
- The toolbar is a single global `<ew-selection-toolbar>` (`position: fixed`)
  appended to `document.body`.
- Toolbar visibility is currently written from ~6 places by **two competing
  drivers**:
  - the ProseMirror plugin in `editor-utils/selection-toolbar.js`, which gates on
    `view.hasFocus()`; and
  - the iframe message handlers in `ew-editor-wysiwyg/utils/handlers.js`, which
    fake `view.hasFocus = () => true` and call `show()/hide()` directly.

The core defect: visibility is derived from `view.hasFocus()` **while that same
value is being faked**. The two ideas are mutually contradictory, so every fix
on top of the current model spawns a new race.

---

## 2. Root causes (evidence-ranked)

1. **Null `cursor-move` misused as "hide toolbar" (dominant).** da-nx sends a
   `cursor-move` with no offsets as a **per-block blur** signal (v1 debounced
   150ms; v2 immediate). Its documented meaning is *"clear the remote cursor"*
   (`nx/utils/message-types.js`). da-live's `handleCursorMove` overloaded it to
   also hide the toolbar. Because it is per-block, ordinary actions inside the
   iframe (clicking between blocks, clicking a non-editable region, a block
   re-rendering after an edit) fire it even though focus never left the iframe —
   hiding the toolbar until the next real cursor move.
2. **No coalescing.** A single range drag emits ~30 `selection-change` messages,
   each triggering 1–2 visibility recomputes.
3. **The `view.hasFocus()` lie leaks into visibility.** The fake focus is required
   for collaboration (see §6) but must not participate in the toolbar decision.
   In PR #1018 it still did — a mirror dispatch that ran the visibility plugin
   under faked focus could claim the wrong active surface.
4. **`document.activeElement` heuristics across the iframe boundary** are
   timing- and browser-dependent (used by #1018's deferred blur handlers).

Non-issue: a suspected "caret `selection-change` before `cursor-move`" ordering
race on first click **did not reproduce** in the current da-nx build.

---

## 3. Key insight that drives the design

**"Active surface = WYSIWYG" ⟺ focus is inside the iframe.** While the user clicks
between blocks *inside* the iframe, focus stays in the frame — only da-nx's
internal per-block editors change focus, which the parent never sees. The null
`cursor-move` (a per-block blur) does **not** mean focus left the frame, which is
exactly why it must not drive visibility.

**How to detect it (corrected after testing).** The obvious signal — a `focus`/
`blur` event on the `<iframe>` element — turned out to be unreliable: in practice
those events did not fire at all for the cross-origin preview frame. The robust,
message-independent signal is instead:

- **`window` blur + deep active element.** When focus moves into an iframe the
  parent window fires `blur` and the (shadow-piercing) active element becomes that
  iframe. On `window` blur, if `deepActiveElement() === wysiwygIframe`, activate
  the WYSIWYG surface. This fires even when da-nx sends no message — e.g. clicking
  at the very end of a line, where the block's selection doesn't change, so no
  `cursor-move` is emitted.
- Positional `cursor-move` / `selection-change` remain a secondary activation
  signal (they also carry the selection), but must not be the *only* one.
- Deactivation comes from: doc `focusin` (switching to the doc surface), or a
  pointerdown in the parent outside every surface. It must **not** depend on an
  iframe blur event or the null `cursor-move`.

---

## 4. Target model: one owner

Introduce a single module-level `ToolbarController`. It is the **only** code that
shows/hides/positions the toolbar or sets its command target. Everything else
emits typed events into it. It reduces events into state, derives visibility once
per frame, and imperatively syncs the element.

```
events ──▶ reduce() ──▶ state ──▶ derive() ──▶ render() (coalesced 1×/frame)
```

### 4.1 State shape

```
{
  activeSurface: 'doc' | 'wysiwyg' | null,
  docView:       EditorView | null,         // command target
  iframeEl:      HTMLIFrameElement | null,   // for outside-click hit-testing
  showable:      boolean,                    // current selection is toolbar-supported
  modal:         boolean,                    // a dialog / picker / menu is open
  editorMode:    'layout' | 'content' | 'split',
}
```

`showable` is `false` for selections the toolbar does not serve (e.g. a `table`
node selection); `true` for text, caret, image, and ranges.

### 4.2 The single visibility predicate

```
visible =
     activeSurface !== null
  && !modal
  && showable
  && editorModeAllows(activeSurface)

editorModeAllows('doc')     = editorMode ∈ { content, split }
editorModeAllows('wysiwyg') = editorMode ∈ { layout, split }
```

**`view.hasFocus()` appears nowhere in this predicate.** That is the property that
distinguishes this design from every prior version.

### 4.3 Event inventory (one emit-site each)

| Event | Sole emitter | Effect |
|---|---|---|
| `activate('doc')` | `focusin` on doc PM dom | `activeSurface = 'doc'` |
| `deactivate('doc')` | `focusout` on doc PM dom (focus not in toolbar) | if `activeSurface==='doc'` → `null` |
| `setDocSelection({ showable })` | doc PM plugin `update` (skips iframe-origin txns) | update `showable`; **does not** change `activeSurface` |
| `activate('wysiwyg')` | iframe element `focus` | `activeSurface = 'wysiwyg'` |
| `deactivate('wysiwyg')` | iframe element `blur` (focus not in toolbar) | if `activeSurface==='wysiwyg'` → `null` |
| `setWysiwygSelection({ showable })` | iframe `cursor-move` (positional), `selection-change`, `node-select` | update `showable` |
| `setEditorMode(mode)` | header view-toggle handler (`canvas.js`) | update `editorMode` |
| `setModal(bool)` | toolbar element (dialog/picker/menu open/close) | update `modal` |
| `reset()` | ctx change / teardown | clear all, hide |

Deliberately **not** an event: the null `cursor-move`. It performs an awareness
clear only (`awareness.setLocalStateField('cursor', null)`) and never touches the
controller.

### 4.4 Authority / ordering rule

Activation follows the browser focus model, which places focus in exactly one
surface at a time. The only race is deactivation ordering, resolved by two rules
already validated conceptually:

1. **Ownership-guarded deactivation:** `deactivate(surface)` is a no-op unless
   `activeSurface === surface`. So a late doc `focusout` cannot wipe an already
   active WYSIWYG, regardless of whether iframe `focus` or doc `focusout` fires
   first.
2. **Deferred deactivation with a toolbar check:** run the deactivate on the next
   task; if focus has landed on the toolbar (button/dialog), skip it. The toolbar
   suppresses focus loss via `mousedown` `preventDefault`, so this is a safety net.

Because activation is bound to real focus events (not to PM transactions), a
background/collab/mirror dispatch can never claim a surface.

### 4.5 Coalescing

Every event marks state dirty and schedules one `render()` per frame
(microtask or rAF). `render()` computes `derive()` from the current snapshot and
applies show/hide + anchor exactly once. This collapses the ~30-message drag
burst and any activate/deactivate churn within a frame, eliminating flicker.

---

## 5. Component responsibilities after the change

- **`ToolbarController` (new, `editor-utils/`):** owns state, exposes the §4.3
  intake methods, does coalesced render, drives the element. Replaces the
  show/hide orchestration currently spread across files. On `setDocView` it also
  installs the surface-gated focus guards (§6) on the doc view.
- **`<ew-selection-toolbar>`:** presentation + command dispatch only. Commands
  apply to `controller.docView`. Emits `setModal(true/false)` around its dialogs,
  pickers, and menus. No focus logic, no surface logic, no outside-click logic of
  its own beyond forwarding.
- **PM plugin (`selection-toolbar.js`):** shrinks to emitting `setDocSelection`
  (skipping iframe-origin transactions). Drops the `hasFocus` gate and the
  `document.querySelector('ew-canvas-header')` read.
- **`ew-editor-doc`:** wires `focusin`/`focusout` on the prose dom →
  `activate('doc')` / deferred `deactivate('doc')`; calls `reset()` on ctx change.
- **`ew-editor-wysiwyg`:** wires the iframe element's `focus`/`blur` →
  `activate('wysiwyg')` / deferred `deactivate('wysiwyg')`.
- **`handlers.js`:** positional `cursor-move` / `selection-change` / `node-select`
  → `setWysiwygSelection`. Null `cursor-move` → awareness clear only. Keeps a
  **scoped** `dispatchWithFakeFocus` around the mirror dispatches (see §6).
- **`canvas.js`:** `setEditorMode(view)` on the header view toggle.

---

## 6. The focus lie is retained — but quarantined

Collaboration depends on it. y-prosemirror's cursor plugin
(`updateCursorInfo`, `plugins/cursor-plugin.js`) broadcasts *this* user's cursor
to awareness **only when `view.hasFocus()` is true**, and clears it otherwise.
da-live has no alternative outbound path (its `updateCursors`/`SET_CURSORS` is the
*inbound* direction — rendering remote users' cursors into the iframe). While the
user edits in the WYSIWYG pane, the doc view genuinely lacks DOM focus, so without
the fake, collaborators would lose sight of this user's cursor.

A **scoped** lie (fake focus only for the duration of one mirror
`view.dispatch(tr)`) is **not sufficient**, and this was found in testing.
`updateCursorInfo` is the plugin's `view.update` callback — it runs after *every*
transaction. The scoped dispatch broadcasts the cursor, but the next unrelated
update (a remote peer's edit, the iframe streaming changes into Yjs, or the redraw
transaction our own `setLocalStateField` triggers via awareness `'change'`) runs
`updateCursorInfo` with the real `hasFocus() === false` and hits its *else* branch,
which **clears** the just-broadcast cursor. Net effect: the cursor flashes to peers
for one tick and vanishes.

Resolution — a lie **gated on the active surface**, plus a focus guard:

- **`installSurfaceFocusGuards(view)`** (in `toolbar-controller.js`, wired from
  `setDocView`) overrides `view.hasFocus` to return `true` whenever
  `state.activeSurface === 'wysiwyg'`, else the real check. This holds the lie for
  the *whole* duration the iframe owns editing (layout **and** split), so no later
  update can clear the cursor. When the user leaves, the surface goes to `null`,
  the real check returns, and `updateCursorInfo` correctly clears the cursor.
- **Focus must never actually move to the doc editor.** The `hasFocus` lie makes
  ProseMirror's `selectionToDOM` treat the doc view as owning the selection — but
  that only writes a DOM selection *range* (`domSel.collapse/extend`), which does
  **not** move focus. The one thing that would is `view.focus()` (→ `this.dom.focus()`,
  `prosemirror-view` index.js:5521). So the same guard neuters `view.focus()` while
  `activeSurface === 'wysiwyg'`, so no caller (drop handler, command, `restoreFocus`)
  can steal focus from the iframe and resurrect the toolbar bugs.
- **`dispatchWithFakeFocus`** is retained as a complement, not the primary mechanism:
  a mirrored edit can arrive in the instant before the surface flips to `'wysiwyg'`
  (the message is applied, *then* the surface is claimed), so it forces the lie for
  that one dispatch to guarantee the edit that moves the caret also broadcasts it.
- **The visibility layer never reads `view.hasFocus()`** (§4.2). That is what makes
  the lie safe: it feeds the y-cursor plugin (intended) and cannot influence the
  toolbar.

---

## 7. Optional da-nx enhancement (not a blocker)

A clean protocol would have da-nx emit an explicit, debounced pane-level
`editable-focus: true | false` message, distinct from the awareness `cursor-move`.
da-live could then drop even the iframe-element focus/blur inference. This design
does **not** require it — the iframe-focus signal (§3) is sufficient to ship. File
as a follow-up with the da-nx owner.

---

## 8. Migration path (incremental, each step shippable)

1. Add `ToolbarController` and route existing `show()/hide()` calls through it as
   passthrough (no behaviour change).
2. Add `activeSurface` + the §4.2 predicate; move `editorMode` off the header DOM
   query into `setEditorMode`.
3. Flip the PM plugin and `handlers.js` to emit events; **stop hiding on null
   `cursor-move`**; gate the focus lie on the active surface and neuter
   `view.focus()` while the iframe owns editing (§6).
4. Move activation to real focus events (doc prose focus/out, iframe focus/blur);
   remove the `activeElement`-based outside logic.
5. Add coalesced render.
6. (Optional) surface-anchored toolbar positioning; da-nx `editable-focus`.

---

## 9. Verification (manual)

Drive the real app in **split view**:

- Click into the WYSIWYG pane as the first interaction → toolbar appears and
  stays.
- Click a non-editable region inside the preview → toolbar stays (no null-cursor
  drop-out).
- Select a range and drag → toolbar stays; no flicker.
- Click a toolbar button → command applies, toolbar stays, focus returns to the
  active surface.
- Switch view modes → toolbar recomputes from the current selection rather than
  hiding until the next selection change.
- Second collaborator session → this user's cursor remains visible to them
  **continuously** (not just a one-tick flash) while editing in the WYSIWYG pane,
  in both layout and split (confirms the surface-gated focus lie, §6).

---

## Appendix: spike findings

- **Spike #1 (live logging, split view).** On first click into WYSIWYG,
  `cursor-move` fires first and alone — no caret-`selection-change` race. Toolbar
  drop-outs correlate exactly with null `cursor-move` fired while the iframe still
  held focus. A single drag produced ~30 `selection-change` messages.
  `view.hasFocus()` read `true` on nearly every plugin update (the lie).
- **Spike #2 (da-nx source).** WYSIWYG is per-block micro-editors keyed by
  `data-prose-index`. Null `cursor-move` is a per-block blur (v1 150ms debounce,
  v2 immediate) whose documented purpose is clearing the remote cursor. No
  explicit focus/blur message is sent to the parent.
- **Spike #3 (y-prosemirror source).** `updateCursorInfo` gates the outbound
  cursor broadcast on `view.hasFocus()`; da-live has no alternative path
  (`extractCursors` reads remote `.ProseMirror-yjs-cursor` decorations — inbound
  only). The lie is load-bearing for collaboration but cleanly scopable.
