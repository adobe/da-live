import { Plugin, NodeSelection } from 'da-y-wrapper';

const HANDLE_OFFSET = 6;

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
 * Allows selecting an entire table by clicking an icon in the top left corner.
 */
export default function tableSelectHandle() {
  let handle = null;
  let currentTable = null;
  let currentWrapper = null;

  function showHandle(wrapper, editorRect) {
    if (!handle || !wrapper) {
      return;
    }
    const rect = wrapper.getBoundingClientRect();
    handle.style.left = `${rect.left - editorRect.left + HANDLE_OFFSET}px`;
    handle.style.top = `${rect.top - editorRect.top + HANDLE_OFFSET}px`;
    handle.classList.add('is-visible');
  }

  function hideHandle() {
    handle?.classList.remove('is-visible');
    currentTable = null;
    currentWrapper = null;
  }

  function createHandle(view) {
    const el = document.createElement('div');
    el.className = 'table-select-handle';
    el.contentEditable = 'false';

    el.addEventListener('mousedown', (e) => {
      if (!currentTable) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const tablePos = getTablePos(view, currentTable);

      if (tablePos !== null) {
        const sel = NodeSelection.create(view.state.doc, tablePos);
        view.dispatch(view.state.tr.setSelection(sel));
        view.focus();
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
        showHandle(wrapper, editorRect);
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

      return {
        update() {
          if (currentWrapper && !currentWrapper.isConnected) {
            hideHandle();
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
