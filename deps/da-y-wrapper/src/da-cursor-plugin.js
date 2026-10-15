/**
 * Fork of y-prosemirror's `yCursorPlugin`.
 *
 * Upstream gates the *outbound* cursor broadcast on `view.hasFocus()`:
 *
 *   if (view.hasFocus()) { awareness.setLocalStateField(field, { anchor, head }) }
 *   else if (current.cursor != null && ...) { awareness.setLocalStateField(field, null) }
 *
 * That treats "this DOM element has browser focus" as a proxy for "this user is
 * editing here". In da-live's canvas that proxy is false by construction: there is
 * one ProseMirror view (the doc editor, always the command target) but while the
 * user works in layout/split mode their real focus lives in the cross-origin
 * quick-edit iframe, and edits are mirrored into the doc view. The doc view
 * therefore never has focus, and upstream would clear this user's cursor for every
 * collaborator.
 *
 * Working around that by lying about `view.hasFocus()` does not work: prosemirror
 * -view reads the same method to decide whether it owns the DOM selection
 * (`editorOwnsSelection` -> `selectionToDOM`) and whether to trust DOM selection
 * changes (`hasFocusAndSelection` in the DOM observer). Faking it makes the doc
 * pane paint a caret and fight the iframe for the selection.
 *
 * The fork changes exactly one thing: the broadcast gate is an injectable
 * `shouldBroadcast(view)` predicate, defaulting to upstream's `view.hasFocus()`.
 * Everything else — decoration building, awareness filtering, cursor/selection
 * builders, the plugin key — is reused from y-prosemirror's public API, so this
 * file does not drift as upstream evolves.
 *
 * `updateCursorInfo` runs from the plugin view's `update` (i.e. after every
 * transaction) and from `focusin`/`focusout` on the editor DOM. When the broadcast
 * predicate depends on state ProseMirror knows nothing about, nothing re-runs it on
 * its own — call `refreshLocalCursor(view)` after the predicate's answer changes
 * (e.g. when the user leaves the editing surface) or the last broadcast position
 * goes stale.
 */

import { Plugin } from 'prosemirror-state';
import * as Y from 'yjs';
import {
  createDecorations,
  defaultAwarenessStateFilter,
  defaultCursorBuilder,
  defaultSelectionBuilder,
  yCursorPluginKey,
  ySyncPluginKey,
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
  setMeta,
} from 'y-prosemirror';

/** view -> its `updateCursorInfo`, so `refreshLocalCursor` needs no transaction. */
const cursorRefreshers = new WeakMap();

/**
 * Re-run the local cursor broadcast for `view`.
 *
 * Deliberately does NOT dispatch a transaction. A transaction on the canvas doc
 * view is not side-effect free: `createTrackingPlugin` posts `SET_CURSORS` to the
 * quick-edit iframe on every update (blocks/canvas/editor-utils/prose-diff.js),
 * and ySyncPlugin's view update writes the doc back into Yjs. Poking the plugin's
 * own callback keeps the refresh to exactly what it says on the tin.
 */
export const refreshLocalCursor = (view) => {
  cursorRefreshers.get(view)?.();
};

/**
 * @param {import('y-protocols/awareness').Awareness} awareness
 * @param {object} [opts]
 * @param {function(number, number, any):boolean} [opts.awarenessStateFilter]
 * @param {function(any):HTMLElement} [opts.cursorBuilder]
 * @param {function(any):any} [opts.selectionBuilder]
 * @param {function(any):any} [opts.getSelection]
 * @param {function(any):boolean} [opts.shouldBroadcast] Whether this user's cursor
 *   should currently be published to awareness. Defaults to upstream's focus check.
 * @param {string} [cursorStateField]
 * @return {Plugin}
 */
export const daCursorPlugin = (
  awareness,
  {
    awarenessStateFilter = defaultAwarenessStateFilter,
    cursorBuilder = defaultCursorBuilder,
    selectionBuilder = defaultSelectionBuilder,
    getSelection = (state) => state.selection,
    shouldBroadcast = (view) => view.hasFocus(),
  } = {},
  cursorStateField = 'cursor',
) => new Plugin({
  key: yCursorPluginKey,
  state: {
    init(_, state) {
      return createDecorations(
        state,
        awareness,
        awarenessStateFilter,
        cursorBuilder,
        selectionBuilder,
      );
    },
    apply(tr, prevState, _oldState, newState) {
      const ystate = ySyncPluginKey.getState(newState);
      const yCursorState = tr.getMeta(yCursorPluginKey);
      if ((ystate && ystate.isChangeOrigin) || (yCursorState && yCursorState.awarenessUpdated)) {
        return createDecorations(
          newState,
          awareness,
          awarenessStateFilter,
          cursorBuilder,
          selectionBuilder,
        );
      }
      return prevState.map(tr.mapping, tr.doc);
    },
  },
  props: {
    decorations: (state) => yCursorPluginKey.getState(state),
  },
  view: (view) => {
    const awarenessListener = () => {
      if (view.docView) setMeta(view, yCursorPluginKey, { awarenessUpdated: true });
    };

    const updateCursorInfo = () => {
      const ystate = ySyncPluginKey.getState(view.state);
      // Called out-of-band by `refreshLocalCursor`, which can land before the
      // ySync binding exists (or after teardown).
      if (!ystate?.binding?.mapping) return;
      const current = awareness.getLocalState() || {};

      // --- the fork: an injectable predicate, not `view.hasFocus()` ---
      if (shouldBroadcast(view)) {
        const selection = getSelection(view.state);
        const anchor = absolutePositionToRelativePosition(
          selection.anchor,
          ystate.type,
          ystate.binding.mapping,
        );
        const head = absolutePositionToRelativePosition(
          selection.head,
          ystate.type,
          ystate.binding.mapping,
        );
        const unchanged = current.cursor != null
          && Y.compareRelativePositions(
            Y.createRelativePositionFromJSON(current.cursor.anchor),
            anchor,
          )
          && Y.compareRelativePositions(
            Y.createRelativePositionFromJSON(current.cursor.head),
            head,
          );
        if (!unchanged) awareness.setLocalStateField(cursorStateField, { anchor, head });
      } else if (
        current.cursor != null
        && relativePositionToAbsolutePosition(
          ystate.doc,
          ystate.type,
          Y.createRelativePositionFromJSON(current.cursor.anchor),
          ystate.binding.mapping,
        ) !== null
      ) {
        // The cursor currently published is owned by this binding — retract it.
        awareness.setLocalStateField(cursorStateField, null);
      }
    };

    awareness.on('change', awarenessListener);
    view.dom.addEventListener('focusin', updateCursorInfo);
    view.dom.addEventListener('focusout', updateCursorInfo);
    cursorRefreshers.set(view, updateCursorInfo);

    return {
      update: updateCursorInfo,
      destroy: () => {
        cursorRefreshers.delete(view);
        view.dom.removeEventListener('focusin', updateCursorInfo);
        view.dom.removeEventListener('focusout', updateCursorInfo);
        awareness.off('change', awarenessListener);
        awareness.setLocalStateField(cursorStateField, null);
      },
    };
  },
});
