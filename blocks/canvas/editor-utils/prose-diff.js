import { Plugin, PluginKey } from 'da-y-wrapper';

// Set on a transaction (tr.setMeta(trackingPluginKey, true)) to skip the diff
// walk below — e.g. a full-document replace (restore) has no shared node
// identity between old/new docs, so the position math it relies on doesn't
// hold and resolving a change's pos can throw.
export const trackingPluginKey = new PluginKey('proseDiffTracking');

export function findChangedNodes(oldDoc, newDoc) {
  const changes = [];

  function traverse(oldNode, newNode, pos) {
    // Reference equality alone misses "same content, new object" cases — e.g. a full-node
    // replaceWith() from a freshly parsed node (WYSIWYG sync, Yjs remote update) always
    // produces new instances, so relying on `===` would cascade into diffing every
    // descendant even when nothing actually changed. Node#eq() is a value comparison.
    if (oldNode === newNode || (oldNode && newNode && oldNode.eq(newNode))) return;

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

    // Pairing children by raw index breaks as soon as one sibling is added or removed
    // (e.g. a new list item, a paragraph split by Enter) — every pair after that point
    // is compared against the wrong counterpart and cascades into spurious diffs for
    // the rest of the siblings. Matching the common leading/trailing run by value first
    // isolates the actually-changed middle range.
    const maxPrefix = Math.min(oldSize, newSize);
    let prefix = 0;
    while (prefix < maxPrefix && oldNode.child(prefix).eq(newNode.child(prefix))) {
      prefix += 1;
    }

    const maxSuffix = maxPrefix - prefix;
    let suffix = 0;
    while (
      suffix < maxSuffix
      && oldNode.child(oldSize - 1 - suffix).eq(newNode.child(newSize - 1 - suffix))
    ) {
      suffix += 1;
    }

    let oldPos = pos + 1;
    let newPos = pos + 1;

    for (let i = 0; i < prefix; i += 1) {
      oldPos += oldNode.child(i).nodeSize;
      newPos += newNode.child(i).nodeSize;
    }

    const oldMidEnd = oldSize - suffix;
    const newMidEnd = newSize - suffix;
    const midSize = Math.min(oldMidEnd - prefix, newMidEnd - prefix);

    for (let i = 0; i < midSize; i += 1) {
      const oldChild = oldNode.child(prefix + i);
      const newChild = newNode.child(prefix + i);
      traverse(oldChild, newChild, oldPos);
      oldPos += oldChild.nodeSize;
      newPos += newChild.nodeSize;
    }

    for (let i = prefix + midSize; i < newMidEnd; i += 1) {
      const newChild = newNode.child(i);
      changes.push({
        type: 'added',
        pos: newPos,
        node: newChild,
      });
      newPos += newChild.nodeSize;
    }

    for (let i = prefix + midSize; i < oldMidEnd; i += 1) {
      const oldChild = oldNode.child(i);
      changes.push({
        type: 'deleted',
        pos: oldPos,
        node: oldChild,
      });
      oldPos += oldChild.nodeSize;
    }
  }

  traverse(oldDoc, newDoc, -1);
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
  // there can be multiple apply() calls before one update() call,
  // therefore we need to preserve the first state before any transactions
  // to get the right diff on the last apply and avoid "last wins" scenarios
  let beforeTransactionState = null;
  let skipped = false;

  return new Plugin({
    key: trackingPluginKey,
    state: {
      init() { return {}; },
      apply(tr, value, oldState) {
        if (tr.getMeta(trackingPluginKey) === true) {
          skipped = true;
          return value;
        }
        if (!tr.docChanged) return value;
        beforeTransactionState ??= oldState;
        return value;
      },
    },
    view() {
      return {
        update(view, prevState) {
          const docChanged = view.state.doc !== prevState.doc;
          const previousDoc = beforeTransactionState?.doc;
          const wasSkipped = skipped;
          beforeTransactionState = null;
          skipped = false;

          if (docChanged && (wasSkipped || !previousDoc)) {
            rerenderPage?.();
          } else if (docChanged) {
            const changes = findChangedNodes(previousDoc, view.state.doc);

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
                getEditor?.({ cursorOffset: commonEditable.pos + 1 });
              } else {
                rerenderPage?.({
                  changes,
                  previousDoc,
                  doc: view.state.doc,
                });
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
