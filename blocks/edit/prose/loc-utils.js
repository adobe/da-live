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

function getCoverDiv(isLangstore) {
  const coverDiv = document.createElement('div');
  coverDiv.className = `loc-color-overlay ${isLangstore ? 'loc-langstore' : 'loc-regional'}`;
  coverDiv.setAttribute('loc-temp-dom', '');

  coverDiv.style.backgroundColor = isLangstore
    ? LOC.LANGSTORE.COVER_BG
    : LOC.REGIONAL.COVER_BG;
  return coverDiv;
}

function getLangOverlay(isLangstore) {
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
  return transaction;
}

function deleteLocContent(view, pos, node) {
  const resolvedPos = view.state.doc.resolve(pos);

  if (resolvedPos.parent.type.name === 'list_item') {
    const parentPos = resolvedPos.before(resolvedPos.depth);
    const transaction = view.state.tr.delete(parentPos, parentPos + resolvedPos.parent.nodeSize);
    return transaction;
  }

  const transaction = view.state.tr.delete(pos, pos + node.nodeSize);
  return transaction;
}

// eslint-disable-next-line import/prefer-default-export
export function getLocClass(elName, getSchema, dispatchTransaction, { isLangstore } = {}) {
  return class {
    constructor(node, view, getPos) {
      this.dom = document.createElement(elName);
      const serializer = DOMSerializer.fromSchema(getSchema());
      const nodeDOM = serializer.serializeFragment(node.content);

      this.dom.appendChild(nodeDOM);
      const coverDiv = getCoverDiv(isLangstore);
      this.dom.appendChild(coverDiv);
      const { overlay, deleteBtn, keepBtn } = getLangOverlay(isLangstore);
      this.langOverlay = overlay;

      deleteBtn.addEventListener('click', () => {
        dispatchTransaction(deleteLocContent(view, getPos(), node));
      });

      keepBtn.addEventListener('click', () => {
        dispatchTransaction(keepLocContentInPlace(view, getPos(), node));
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
