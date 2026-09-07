import { Plugin, PluginKey } from 'da-y-wrapper';

// Set on a transaction (tr.setMeta(trackingPluginKey, true)) to skip the diff
// walk below — e.g. a full-document replace (restore) has no shared node
// identity between old/new docs, so the position math it relies on doesn't
// hold and resolving a change's pos can throw.
export const trackingPluginKey = new PluginKey('proseDiffTracking');

// --- collab diagnostics (temporary — remove once the multi-user editing
// investigation is done) -----------------------------------------------
// y-prosemirror doesn't export its sync plugin's PluginKey, but its meta is
// always readable under the raw key it resolves to: the first
// `new PluginKey('y-sync')` constructed app-wide gets the key 'y-sync$'
// (see prosemirror-state's PluginKey key-naming), which is exactly what
// y-prosemirror's own (unexported) ySyncPluginKey does. Remote-origin
// transactions (i.e. applied because another collaborator's edit arrived
// over the websocket) carry `{ isChangeOrigin: true }` there.
function isRemoteOriginTx(tr) {
  return tr.getMeta('y-sync$')?.isChangeOrigin === true;
}

const collabDiagCounts = { local: 0, remote: 0 };

function logCollabDiag(label, origin, extra = '') {
  collabDiagCounts[origin] += 1;
  // eslint-disable-next-line no-console
  console.debug(`[collab-diag] ${label} origin=${origin} total-local=${collabDiagCounts.local} total-remote=${collabDiagCounts.remote}${extra}`);
}

export function findChangedNodes(oldDoc, newDoc) {
  const changes = [];

  function traverse(oldNode, newNode, pos) {
    if (oldNode === newNode) return;

    if (!oldNode || !newNode || oldNode.type !== newNode.type) {
      changes.push({
        type: 'replaced',
        pos,
        oldNode,
        newNode,
      });
      return;
    }

    if (oldNode.isText && newNode.isText) {
      if (oldNode.text !== newNode.text) {
        changes.push({
          type: 'text',
          pos,
          oldText: oldNode.text,
          newText: newNode.text,
        });
        return;
      }
    }

    if (oldNode.isText || newNode.isText) {
      const oldMarks = oldNode.marks || [];
      const newMarks = newNode.marks || [];
      if (oldMarks.length !== newMarks.length
          || !oldMarks.every((m, i) => m.eq(newMarks[i]))) {
        changes.push({
          type: 'marks',
          pos,
          oldMarks,
          newMarks,
        });
      }
    }

    if (!oldNode.sameMarkup(newNode)) {
      changes.push({
        type: 'attrs',
        pos,
        oldAttrs: oldNode.attrs,
        newAttrs: newNode.attrs,
        nodeType: newNode.type.name,
      });
    }

    const oldSize = oldNode.childCount;
    const newSize = newNode.childCount;
    const minSize = Math.min(oldSize, newSize);

    let oldPos = pos + 1;
    let newPos = pos + 1;

    for (let i = 0; i < minSize; i += 1) {
      const oldChild = oldNode.child(i);
      const newChild = newNode.child(i);
      traverse(oldChild, newChild, oldPos);
      oldPos += oldChild.nodeSize;
      newPos += newChild.nodeSize;
    }

    if (newSize > oldSize) {
      for (let i = oldSize; i < newSize; i += 1) {
        const newChild = newNode.child(i);
        changes.push({
          type: 'added',
          pos: newPos,
          node: newChild,
        });
        newPos += newChild.nodeSize;
      }
    }

    if (oldSize > newSize) {
      for (let i = newSize; i < oldSize; i += 1) {
        const oldChild = oldNode.child(i);
        changes.push({
          type: 'deleted',
          pos: oldPos,
          node: oldChild,
        });
        oldPos += oldChild.nodeSize;
      }
    }
  }

  traverse(oldDoc, newDoc, 0);
  return changes;
}

export const EDITABLE_TYPES = ['heading', 'paragraph', 'ordered_list', 'bullet_list'];

function changedNodeType(change) {
  if (change.type === 'attrs') return change.nodeType;
  if (change.type === 'replaced') return change.newNode?.type.name ?? change.oldNode?.type.name;
  return undefined;
}

export function findCommonEditableAncestor(view, changes, prevState) {
  if (changes.length === 0) return null;

  const editableAncestors = [];

  for (const change of changes) {
    const isDeletedNode = change.type === 'deleted';
    try {
      const doc = isDeletedNode ? prevState.doc : view.state.doc;
      const $pos = doc.resolve(change.pos);
      let editableAncestor = null;

      for (let { depth } = $pos; depth > 0; depth -= 1) {
        const node = $pos.node(depth);
        if (EDITABLE_TYPES.includes(node.type.name)) {
          editableAncestor = {
            node,
            pos: $pos.before(depth),
          };
        }
      }

      if (editableAncestor) {
        editableAncestors.push(editableAncestor);
      } else if (!isDeletedNode) {
        return null;
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Could not resolve position for change:', e);
      return null;
    }
  }

  if (editableAncestors.length === 0) return null;

  const firstPos = editableAncestors[0].pos;
  const allSameAncestor = editableAncestors.every((ancestor) => ancestor.pos === firstPos);

  return allSameAncestor ? editableAncestors[0] : null;
}

export function createTrackingPlugin(rerenderPage, updateCursors, getEditor, onSelectionChange) {
  return new Plugin({
    key: trackingPluginKey,
    state: {
      init() { return { skipDiff: false, isRemote: false }; },
      apply(tr) {
        return {
          skipDiff: tr.getMeta(trackingPluginKey) === true,
          isRemote: isRemoteOriginTx(tr),
        };
      },
    },
    view() {
      return {
        update(view, prevState) {
          const docChanged = view.state.doc !== prevState.doc;
          const { skipDiff, isRemote } = trackingPluginKey.getState(view.state) ?? {};
          const origin = isRemote ? 'remote' : 'local';

          if (docChanged && isRemote) {
            // eslint-disable-next-line no-console
            console.debug(`[collab-diag] view.update after remote tx: viewHasFocus=${view.hasFocus()} activeElement=${document.activeElement?.tagName?.toLowerCase()}`);
          }

          if (docChanged && skipDiff) {
            logCollabDiag('rerenderPage (skipDiff)', origin);
            rerenderPage?.();
          } else if (docChanged) {
            const diffStart = performance.now();
            const changes = findChangedNodes(prevState.doc, view.state.doc);
            const diffMs = (performance.now() - diffStart).toFixed(1);

            if (changes.length > 0) {
              // Only an EDITABLE_TYPES node changing its own attrs/type (heading level,
              // list-type swap) needs a full outline re-parse; the same change on e.g. an
              // image's src does not, so it takes the in-place text sync instead.
              const identityChanged = changes.some((c) => (
                (c.type === 'attrs' || c.type === 'replaced') && EDITABLE_TYPES.includes(changedNodeType(c))
              ));
              const commonEditable = identityChanged
                ? null
                : findCommonEditableAncestor(view, changes, prevState);

              if (commonEditable) {
                logCollabDiag('getEditor (in-place sync)', origin, ` diffMs=${diffMs} changes=${changes.length}`);
                getEditor?.({ cursorOffset: commonEditable.pos + 1 });
              } else {
                logCollabDiag('rerenderPage (full)', origin, ` diffMs=${diffMs} changes=${changes.length}`);
                rerenderPage?.();
              }
            }
          }

          updateCursors?.();

          if (view.state.selection !== prevState.selection) {
            onSelectionChange?.(view);
          }
        },
      };
    },
  });
}
