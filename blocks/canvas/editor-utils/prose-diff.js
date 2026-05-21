import { Plugin } from 'da-y-wrapper';

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
    view() {
      return {
        update(view, prevState) {
          const docChanged = view.state.doc !== prevState.doc;

          if (docChanged) {
            const changes = findChangedNodes(prevState.doc, view.state.doc);

            if (changes.length > 0) {
              const commonEditable = findCommonEditableAncestor(view, changes, prevState);

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
