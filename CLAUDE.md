# DA Live — Project Instructions

## Branch Naming

Branches in this repo must be **max 8 lowercase alphanumeric characters** (no hyphens, underscores, or uppercase).

This is an IMS constraint — violating it breaks authentication in CI/CD and preview environments.

Good: `multiimg`, `fixauth`, `tabfix`
Bad: `fix-auth`, `my-feature-branch`, `Fix_Tabs`

Always enforce this when creating or suggesting branch names.

## Canvas Eventing

Inside `blocks/canvas/**`, use `canvasBus` (`blocks/canvas/utils/canvas-bus.js`) for any new in-process event or state broadcast — don't dispatch a new DOM `CustomEvent` and don't write a new one-off observable.

This exists because the canvas block used to have three uncoordinated event mechanisms doing the same job with different shapes; `canvas-bus.js` consolidated the in-process ones into one `canvasBus.<name>.emit()`/`.subscribe()` API. Adding a new bespoke event mechanism instead of a new `canvasBus` channel reintroduces exactly that problem. See `canvas-bus.js`'s own comments for the naming convention (`*Request` for a command, `*State`/`*Ready` for a broadcast).

For anything crossing a boundary `canvasBus` can't reach — it's in-process only, nothing to do with panels, chat, or the quick-edit iframe — use the mechanism that already owns that boundary instead of inventing a new one:
- **Shared panel or chat**: da-nx's `PANEL_EVENT` / `CHAT_EVENT` DOM CustomEvents (documented in da-nx's `docs/workspace.md` and `docs/chat-ui-component.md`).
- **The quick-edit iframe boundary** (host ↔ the WYSIWYG overlay): `MESSAGE_TYPES` (`blocks/canvas/utils/quick-edit-messages.js`, re-exporting da-nx's `nx/utils/message-types.js`; documented in da-nx's `docs/quick-edit-events.md`). If the data you need is already carried by an existing type, extend its payload rather than adding a parallel one.

Good: adding `canvasBus.someNewThing = createChannel()` for a new canvas-local signal.
Bad: `element.dispatchEvent(new CustomEvent('nx-canvas-something', ...))`, a second module-level `Set`-based observable next to `canvas-bus.js`, or a new ad-hoc `postMessage` shape for something `MESSAGE_TYPES` already covers.

Always check `canvas-bus.js`, da-nx's `PANEL_EVENT`/`CHAT_EVENT`, and `MESSAGE_TYPES` before adding a new event mechanism anywhere in the canvas editor.
