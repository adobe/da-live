import {
  DOMSerializer,
  Fragment,
  Slice,
} from 'da-y-wrapper';

const LOC = {
  LANGSTORE: {
    BG: 'rgba(70, 130, 180, 0.8)',
    COVER_BG: 'rgba(70, 130, 180, 0.4)',
    TEXT: 'Langstore Content',
    TEXT_COLOR: 'rgba(70, 130, 180)',
  },
  REGIONAL: {
    BG: 'rgba(144, 42, 222, 0.8)',
    COVER_BG: 'rgba(144, 42, 222, 0.4)',
    TEXT: 'Regional Content',
    TEXT_COLOR: 'rgba(144, 42, 222)',
  },
};

export function getLocClass(elName, getSchema, dispatchTransaction, { isLangstore } = {}) {
  function getCoverDiv() {
    const coverDiv = document.createElement('div');
    coverDiv.className = `loc-color-overlay ${isLangstore ? 'loc-langstore' : 'loc-regional'}`;
    coverDiv.setAttribute('loc-temp-dom', '');

    coverDiv.style.backgroundColor = isLangstore
      ? LOC.LANGSTORE.COVER_BG
      : LOC.REGIONAL.COVER_BG;
    return coverDiv;
  }

  function getLangOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'loc-lang-overlay';
    overlay.setAttribute('loc-temp-dom', '');
    overlay.style.backgroundColor = isLangstore
      ? LOC.LANGSTORE.BG
      : LOC.REGIONAL.BG;

    const dialog = document.createElement('div');
    dialog.className = 'loc-dialog';
    dialog.innerHTML = `
      <span>${isLangstore ? LOC.LANGSTORE.TEXT : LOC.REGIONAL.TEXT}</span>
      <div>
      <span class="loc-keep"><div title="Keep">Keep</div></span>
      <span class="loc-delete"><div title="Delete">Delete</div></span>
      </div>`;
    dialog.style.color = isLangstore
      ? LOC.LANGSTORE.TEXT_COLOR
      : LOC.REGIONAL.TEXT_COLOR;

    const deleteBtn = dialog.querySelector('.loc-delete');
    const keepBtn = dialog.querySelector('.loc-keep');
    overlay.appendChild(dialog);

    return { overlay, deleteBtn, keepBtn };
  }

  function keepLocContentInPlace(view, pos, node) {
    node.content.content = node.content.content.filter((c) => c.content.content.length);
    const newFragment = Fragment.fromArray(node.content.content);
    const newSlice = new Slice(newFragment, 0, 0);
    const transaction = view.state.tr.replace(pos, pos + node.nodeSize, newSlice);
    dispatchTransaction(transaction);
  }

  function deleteLocContent(view, pos, node) {
    const resolvedPos = view.state.doc.resolve(pos);

    if (resolvedPos.parent.type.name === 'list_item') {
      const parentPos = resolvedPos.before(resolvedPos.depth);
      // Create a transaction that deletes the parent node
      const transaction = view.state.tr.delete(parentPos, parentPos + resolvedPos.parent.nodeSize);
      dispatchTransaction(transaction);
    } else {
      const transaction = view.state.tr.delete(pos, pos + node.nodeSize);
      dispatchTransaction(transaction);
    }
  }

  return class {
    constructor(node, view, getPos) {
      this.dom = document.createElement(elName);
      const serializer = DOMSerializer.fromSchema(getSchema());
      const nodeDOM = serializer.serializeFragment(node.content);

      this.dom.appendChild(nodeDOM);
      const coverDiv = getCoverDiv();
      this.dom.appendChild(coverDiv);
      const { overlay, deleteBtn, keepBtn } = getLangOverlay();
      this.langOverlay = overlay;

      deleteBtn.addEventListener('click', () => {
        deleteLocContent(view, getPos(), node);
      });

      keepBtn.addEventListener('click', () => {
        keepLocContentInPlace(view, getPos(), node);
      });

      coverDiv.appendChild(this.langOverlay);

      coverDiv.addEventListener('mouseover', () => {
        this.langOverlay.style.display = 'flex';
      });

      coverDiv.addEventListener('mouseout', () => {
        this.langOverlay.style.display = 'none';
      });
    }

    destroy() {
      this.coverDiv?.remove();
      this.langOverlay?.remove();
    }

    stopEvent() { return true; }
  };
}

function parseLocDOM(locTag) {
  return [{
    tag: locTag,
    contentElement: (dom) => {
      // Only parse the content of the node, not the temporary elements
      const deleteThese = dom.querySelectorAll('[loc-temp-dom]');
      deleteThese.forEach((e) => e.remove());
      return dom;
    },
  }];
}

export function addLocNodes(baseNodes) {
  if (!baseNodes.content.includes('loc_deleted')) {
    baseNodes.content.push('loc_deleted');
    baseNodes.content.push({
      group: 'block',
      content: 'block+',
      parseDOM: parseLocDOM('da-loc-deleted'),
      toDOM: () => ['da-loc-deleted', { contenteditable: false }, 0],
    });
    baseNodes.content.push('loc_added');
    baseNodes.content.push({
      group: 'block',
      content: 'block+',
      parseDOM: parseLocDOM('da-loc-added'),
      toDOM: () => ['da-loc-added', { contenteditable: false }, 0],
    });
  }
  return baseNodes;
}
