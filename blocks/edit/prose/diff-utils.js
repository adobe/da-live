import {
  DOMSerializer,
  Fragment,
  Slice,
} from 'da-y-wrapper';

const DIFF = {
  UPSTREAM: {
    BG: 'rgba(70, 130, 180, 0.8)',
    COVER_BG: 'rgba(70, 130, 180, 0.4)',
    TEXT: 'Upstream Content',
    TEXT_COLOR: 'rgba(70, 130, 180)',
  },
  LOCAL: {
    BG: 'rgba(144, 42, 222, 0.8)',
    COVER_BG: 'rgba(144, 42, 222, 0.4)',
    TEXT: 'Local Content',
    TEXT_COLOR: 'rgba(144, 42, 222)',
  },
};

function getCoverDiv(isUpstream) {
  const coverDiv = document.createElement('div');
  coverDiv.className = `diff-color-overlay ${isUpstream ? 'diff-upstream' : 'diff-local'}`;
  coverDiv.setAttribute('diff-temp-dom', '');

  coverDiv.style.backgroundColor = isUpstream
    ? DIFF.UPSTREAM.COVER_BG
    : DIFF.LOCAL.COVER_BG;
  return coverDiv;
}

function getLangOverlay(isUpstream) {
  const overlay = document.createElement('div');
  overlay.className = 'diff-lang-overlay';
  overlay.setAttribute('diff-temp-dom', '');
  overlay.style.backgroundColor = isUpstream
    ? DIFF.UPSTREAM.BG
    : DIFF.LOCAL.BG;

  const dialog = document.createElement('div');
  dialog.className = 'loc-dialog';
  dialog.innerHTML = `
    <span>${isUpstream ? DIFF.UPSTREAM.TEXT : DIFF.LOCAL.TEXT}</span>
    <div>
    <span class="diff-keep"><div title="Keep">Keep</div></span>
    <span class="diff-delete"><div title="Delete">Delete</div></span>
    </div>`;
  dialog.style.color = isUpstream
    ? DIFF.UPSTREAM.TEXT_COLOR
    : DIFF.LOCAL.TEXT_COLOR;

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
