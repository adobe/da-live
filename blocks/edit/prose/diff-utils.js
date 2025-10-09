import {
  DOMSerializer,
  Fragment,
  Slice,
} from 'da-y-wrapper';

function getCoverDiv(isUpstream) {
  const coverDiv = document.createElement('div');
  coverDiv.className = `diff-color-overlay ${isUpstream ? 'diff-upstream' : 'diff-local'}`;
  coverDiv.setAttribute('diff-temp-dom', '');
  return coverDiv;
}

function getLangOverlay(isUpstream) {
  const overlay = document.createElement('div');
  overlay.className = 'diff-lang-overlay';
  overlay.setAttribute('diff-temp-dom', '');

  const dialog = document.createElement('div');
  dialog.className = 'loc-dialog';
  dialog.innerHTML = `
    <span>${isUpstream ? 'Upstream Content' : 'Local Content'}</span>
    <div>
    <span class="diff-keep"><div title="Keep">Keep</div></span>
    <span class="diff-delete"><div title="Delete">Delete</div></span>
    </div>`;

  const deleteBtn = dialog.querySelector('.diff-delete');
  const keepBtn = dialog.querySelector('.diff-keep');
  overlay.appendChild(dialog);

  return { overlay, deleteBtn, keepBtn };
}

function keepDiffContentInPlace(view, pos, node) {
  node.content.content = node.content.content.filter((c) => c.content.content.length);
  const newFragment = Fragment.fromArray(node.content.content);
  const newSlice = new Slice(newFragment, 0, 0);
  const transaction = view.state.tr.replace(pos, pos + node.nodeSize, newSlice);
  return transaction;
}

function deleteDiffContent(view, pos, node) {
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
export function getDiffClass(diffType, getSchema, dispatchTransaction, { isUpstream } = {}) {
  return class {
    constructor(node, view, getPos) {
      this.dom = document.createElement(diffType);
      const serializer = DOMSerializer.fromSchema(getSchema());
      const nodeDOM = serializer.serializeFragment(node.content);

      this.dom.appendChild(nodeDOM);
      const coverDiv = getCoverDiv(isUpstream);
      this.dom.appendChild(coverDiv);
      const { overlay, deleteBtn, keepBtn } = getLangOverlay(isUpstream);
      this.langOverlay = overlay;

      deleteBtn.addEventListener('click', () => {
        dispatchTransaction(deleteDiffContent(view, getPos(), node));
      });

      keepBtn.addEventListener('click', () => {
        dispatchTransaction(keepDiffContentInPlace(view, getPos(), node));
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
