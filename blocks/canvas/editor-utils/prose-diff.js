import { Plugin, PluginKey } from 'da-y-wrapper';

// Set on a transaction (tr.setMeta(trackingPluginKey, true)) to skip the diff
// walk below — e.g. a full-document replace (restore) has no shared node
// identity between old/new docs, so the position math it relies on doesn't
// hold and resolving a change's pos can throw.
export const trackingPluginKey = new PluginKey('proseDiffTracking');

/**
 * A diff spans two coordinate spaces, so every change carries two positions:
 * `pos` in `oldDoc` and `newPos` in `newDoc`. They only coincide up to the first
 * size-changing edit — after that every later sibling sits at a different
 * position in each doc. Always resolve a position against the doc it came from;
 * mixing them silently mislocates the second change onto the first change's node.
 */
export function findChangedNodes(oldDoc, newDoc) {
  const changes = [];

  // An added/deleted child is reported at the end of its parent's new content.
  // For a top-level child that runs one past the end of the doc, because the
  // walk treats a node's content as starting at `pos + 1` and the doc has no
  // opening token. Clamp so the position always resolves in `newDoc`.
  const maxNewPos = newDoc.content.size;

  function traverse(oldNode, newNode, pos, newNodePos) {
    if (oldNode === newNode) return;

    if (!oldNode || !newNode || oldNode.type !== newNode.type) {
      changes.push({
        type: 'replaced',
        pos,
        newPos: newNodePos,
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
          newPos: newNodePos,
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
          newPos: newNodePos,
          oldMarks,
          newMarks,
        });
      }
    }

    if (!oldNode.sameMarkup(newNode)) {
      changes.push({
        type: 'attrs',
        pos,
        newPos: newNodePos,
        oldAttrs: oldNode.attrs,
        newAttrs: newNode.attrs,
        nodeType: newNode.type.name,
      });
    }

    const oldSize = oldNode.childCount;
    const newSize = newNode.childCount;
    const minSize = Math.min(oldSize, newSize);

    let oldPos = pos + 1;
    let newPos = newNodePos + 1;

    for (let i = 0; i < minSize; i += 1) {
      const oldChild = oldNode.child(i);
      const newChild = newNode.child(i);
      traverse(oldChild, newChild, oldPos, newPos);
      oldPos += oldChild.nodeSize;
      newPos += newChild.nodeSize;
    }

    if (newSize > oldSize) {
      for (let i = oldSize; i < newSize; i += 1) {
        const newChild = newNode.child(i);
        changes.push({
          type: 'added',
          pos: oldPos,
          newPos: Math.min(newPos, maxNewPos),
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
          newPos: Math.min(newPos, maxNewPos),
          node: oldChild,
        });
        oldPos += oldChild.nodeSize;
      }
    }
  }

  traverse(oldDoc, newDoc, 0, 0);
  return changes;
}

export const EDITABLE_TYPES = ['heading', 'paragraph', 'ordered_list', 'bullet_list'];

function changedNodeType(change) {
  if (change.type === 'attrs') return change.nodeType;
  if (change.type === 'replaced') return change.newNode?.type.name ?? change.oldNode?.type.name;
  return undefined;
}

/**
 * The one editable node every change lives inside, or null when the changes
 * straddle more than one. Every position is resolved in the *new* doc, because
 * the result is fed straight back into `view.state.doc` by the caller — a
 * deleted node's `newPos` still lands inside its (surviving) parent.
 */
export function findCommonEditableAncestor(view, changes) {
  if (changes.length === 0) return null;

  const editableAncestors = [];

  for (const change of changes) {
    const isDeletedNode = change.type === 'deleted';
    try {
      const $pos = view.state.doc.resolve(change.newPos);
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
      init() { return false; },
      apply(tr) { return tr.getMeta(trackingPluginKey) === true; },
    },
    view() {
      return {
        update(view, prevState) {
          const docChanged = view.state.doc !== prevState.doc;

          if (docChanged && trackingPluginKey.getState(view.state)) {
            rerenderPage?.();
          } else if (docChanged) {
            const changes = findChangedNodes(prevState.doc, view.state.doc);

            if (changes.length > 0) {
              // Only an EDITABLE_TYPES node changing its own attrs/type (heading level,
              // list-type swap) needs a full outline re-parse; the same change on e.g. an
              // image's src does not, so it takes the in-place text sync instead.
              const identityChanged = changes.some((c) => (
                (c.type === 'attrs' || c.type === 'replaced') && EDITABLE_TYPES.includes(changedNodeType(c))
              ));
              const commonEditable = identityChanged
                ? null
                : findCommonEditableAncestor(view, changes);

              if (commonEditable) {
                getEditor?.({ cursorOffset: commonEditable.pos + 1 });
              } else {
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
