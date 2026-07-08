import {
  Plugin,
  PluginKey,
  Decoration,
  DecorationSet,
  Y,
  ySyncPluginKey,
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
} from 'da-y-wrapper';

const HANDLE_OFFSET = 6;
const HANDLE_SIZE = 20;

export const tableCollapseKey = new PluginKey('tableCollapse');

/**
 * The collapsed set is persisted to sessionStorage so a reload keeps tables
 * collapsed for the current tab. We store Yjs relative positions serialized to
 * JSON: their item ids are stable across reloads (the same document syncs back
 * with the same ids), so a stored position resolves to the same table again.
 * Everything is best-effort — sessionStorage can throw (private mode / quota).
 */
function loadStored(storageKey) {
  if (!storageKey) return [];
  try {
    const raw = sessionStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStored(storageKey, set) {
  if (!storageKey) return;
  try {
    if (!set || set.size === 0) {
      sessionStorage.removeItem(storageKey);
      return;
    }
    const json = [...set].map((relPos) => Y.relativePositionToJSON(relPos));
    sessionStorage.setItem(storageKey, JSON.stringify(json));
  } catch {
    /* ignore */
  }
}

function restoreSet(storageKey) {
  return new Set(
    loadStored(storageKey)
      .map((json) => {
        try {
          return Y.createRelativePositionFromJSON(json);
        } catch {
          return null;
        }
      })
      .filter((relPos) => relPos !== null),
  );
}

/**
 * The collapsed-table set is keyed by Yjs *relative positions* rather than
 * ProseMirror integer positions. y-prosemirror rebuilds the entire document on
 * every remote change (a full-range replace), which invalidates all integer
 * positions — so a collaborator's edit would otherwise drop our tracked tables
 * and un-collapse them. Relative positions resolve through the CRDT and remain
 * stable across those rebuilds.
 */
function getBinding(state) {
  return ySyncPluginKey.getState(state)?.binding ?? null;
}

function toRelative(state, pos) {
  const binding = getBinding(state);
  if (!binding) return null;
  return absolutePositionToRelativePosition(pos, binding.type, binding.mapping);
}

function toAbsolute(state, relPos) {
  const binding = getBinding(state);
  if (!binding) return null;
  return relativePositionToAbsolutePosition(binding.doc, binding.type, relPos, binding.mapping);
}

/**
 * Resolves a relative position to the start of the table it points at, or null.
 * Relative positions resolve against the Yjs binding, which can briefly be
 * ahead of the ProseMirror `state.doc` being rendered (e.g. mid-sync on load).
 * The bounds check guards against a resolved position that is past the end of
 * the current doc — `nodeAt` would otherwise throw a RangeError.
 */
function tableStartAt(state, relPos) {
  const pos = toAbsolute(state, relPos);
  if (pos == null || pos < 0 || pos >= state.doc.content.size) return null;
  const node = state.doc.nodeAt(pos);
  return node && node.type.name === 'table' ? pos : null;
}

function getTablePos(view, tableEl) {
  const pos = view.posAtDOM(tableEl, 0);

  if (pos === null) {
    return null;
  }

  const $pos = view.state.doc.resolve(pos);
  for (let d = $pos.depth; d >= 0; d -= 1) {
    if ($pos.node(d).type.name === 'table') {
      return $pos.before(d);
    }
  }

  return null;
}

/**
 * Returns the stored relative position whose current absolute position is the
 * start of the given table, or null if that table is not collapsed.
 */
function findCollapsedRel(state, set, tablePos) {
  return [...set].find((relPos) => tableStartAt(state, relPos) === tablePos) ?? null;
}

/**
 * Drops positions that no longer resolve to a table (e.g. the table was deleted
 * while collapsed). Only safe to call once the document has synced, which is
 * always true at toggle time.
 */
function pruneStale(state, set) {
  const live = new Set();
  set.forEach((relPos) => {
    if (tableStartAt(state, relPos) != null) live.add(relPos);
  });
  return live;
}

/**
 * Collapses a table down to its first (header) row so authors can skim past
 * long tables. This is purely a local view state: the collapsed set lives in
 * plugin state (keyed by stable Yjs relative positions), is rendered with a
 * decoration, and is persisted per-document to sessionStorage so it survives a
 * reload for the current tab. It never touches the shared Yjs document, so it
 * causes no collaboration conflicts and never persists to the saved output.
 *
 * @param {string} [storageKey] sessionStorage key for this document; when
 *   omitted, collapse state is in-memory only (resets on reload).
 */
export default function tableCollapse(storageKey) {
  let handle = null;
  let currentTable = null;
  let currentWrapper = null;

  function isCollapsed(view, tableEl) {
    const tablePos = getTablePos(view, tableEl);
    if (tablePos === null) return false;
    const set = tableCollapseKey.getState(view.state);
    if (!set || set.size === 0) return false;
    return findCollapsedRel(view.state, set, tablePos) !== null;
  }

  function showHandle(wrapper, editorRect, collapsed) {
    if (!handle || !wrapper) {
      return;
    }
    const rect = wrapper.getBoundingClientRect();
    handle.style.left = `${rect.right - editorRect.left - HANDLE_SIZE - HANDLE_OFFSET}px`;
    handle.style.top = `${rect.top - editorRect.top + HANDLE_OFFSET}px`;
    handle.classList.toggle('is-collapsed-state', collapsed);
    handle.title = collapsed ? 'Expand table' : 'Collapse table';
    handle.classList.add('is-visible');
  }

  function hideHandle() {
    handle?.classList.remove('is-visible');
    currentTable = null;
    currentWrapper = null;
  }

  function createHandle(view) {
    const el = document.createElement('div');
    el.className = 'table-collapse-handle';
    el.contentEditable = 'false';

    el.addEventListener('mousedown', (e) => {
      if (!currentTable) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const tablePos = getTablePos(view, currentTable);

      if (tablePos !== null) {
        view.dispatch(view.state.tr.setMeta(tableCollapseKey, { type: 'toggle', pos: tablePos }));
      }
    });

    el.addEventListener('mouseleave', (e) => {
      if (e.relatedTarget && currentWrapper?.contains(e.relatedTarget)) {
        return;
      }

      hideHandle();
    });

    return el;
  }

  return new Plugin({
    key: tableCollapseKey,
    state: {
      init() {
        // Seed from storage. These relative positions resolve to nothing until
        // the document syncs; decorations() re-runs on the sync transaction, so
        // the tables collapse automatically once their content arrives.
        return restoreSet(storageKey);
      },
      apply(tr, value, oldState, newState) {
        // Relative positions are stable across doc changes (local or remote),
        // so state only changes in response to an explicit toggle.
        const meta = tr.getMeta(tableCollapseKey);
        if (meta?.type !== 'toggle') {
          return value;
        }

        // Drop any positions whose table was removed while collapsed, so stale
        // entries don't accumulate (in state or in sessionStorage).
        const set = pruneStale(newState, value);
        const existing = findCollapsedRel(newState, set, meta.pos);
        if (existing) {
          set.delete(existing);
        } else {
          const relPos = toRelative(newState, meta.pos);
          if (relPos) set.add(relPos);
        }

        return set;
      },
    },
    props: {
      decorations(state) {
        const set = tableCollapseKey.getState(state);
        if (!set || set.size === 0) {
          return DecorationSet.empty;
        }

        const decos = [];
        set.forEach((relPos) => {
          const pos = tableStartAt(state, relPos);
          if (pos == null) return;
          const node = state.doc.nodeAt(pos);
          decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'is-collapsed' }));
        });

        return DecorationSet.create(state.doc, decos);
      },
    },
    view(editorView) {
      handle = createHandle(editorView);
      const container = editorView.dom.parentElement;

      if (container) {
        container.appendChild(handle);
      }

      const onMouseOver = (e) => {
        const wrapper = e.target.closest('.tableWrapper');

        if (!wrapper || wrapper === currentWrapper) {
          return;
        }

        currentWrapper = wrapper;
        currentTable = wrapper.querySelector('table');
        const editorRect = editorView.dom.getBoundingClientRect();
        showHandle(wrapper, editorRect, isCollapsed(editorView, currentTable));
      };

      const onMouseOut = (e) => {
        const wrapper = e.target.closest('.tableWrapper');

        if (!wrapper) {
          return;
        }

        const related = e.relatedTarget;

        if (related === handle || wrapper.contains(related)) {
          return;
        }

        hideHandle();
      };

      editorView.dom.addEventListener('mouseover', onMouseOver);
      editorView.dom.addEventListener('mouseout', onMouseOut);

      let lastSet = tableCollapseKey.getState(editorView.state);

      return {
        update(view) {
          // The set reference only changes on a toggle (apply is otherwise a
          // no-op), so this persists exactly when the collapsed set changes.
          const set = tableCollapseKey.getState(view.state);
          if (set !== lastSet) {
            lastSet = set;
            saveStored(storageKey, set);
          }

          if (currentWrapper && !currentWrapper.isConnected) {
            hideHandle();
            return;
          }

          // Keep the handle icon/position in sync after a toggle or edit.
          if (currentWrapper && currentTable && handle?.classList.contains('is-visible')) {
            const editorRect = view.dom.getBoundingClientRect();
            showHandle(currentWrapper, editorRect, isCollapsed(view, currentTable));
          }
        },
        destroy() {
          editorView.dom.removeEventListener('mouseover', onMouseOver);
          editorView.dom.removeEventListener('mouseout', onMouseOut);
          handle?.remove();
          handle = null;
        },
      };
    },
  });
}
