// Test fixture mirroring da-nx's nx2/public/utils/quick-edit-images.js.
const versions = new WeakMap();
const sessionId = crypto.randomUUID();
let nextVersion = 0;

export function getImageDocumentVersion(doc) {
  let version = versions.get(doc);
  if (!version) {
    nextVersion += 1;
    version = `${sessionId}:${nextVersion}`;
    versions.set(doc, version);
  }
  return version;
}

export function resolveImagePosition({ doc, proseIndex, originalSrc, requestId, imageVersion }) {
  if (proseIndex != null || requestId != null) {
    if (imageVersion !== getImageDocumentVersion(doc)) {
      throw new Error('Image position is out of date. Please refresh and try again.');
    }
    if (!Number.isSafeInteger(proseIndex) || proseIndex < 0
      || doc.nodeAt(proseIndex)?.type.name !== 'image') {
      throw new Error('Image position is no longer valid. Please refresh and try again.');
    }
    return proseIndex;
  }

  // Older quick-edit iframes send only a URL; never pick one of several matches.
  const name = originalSrc?.split(/[?#]/)[0].split('/').pop();
  let found = null;
  let ambiguous = false;
  if (name) {
    doc.descendants((node, pos) => {
      if (node.type.name === 'image' && node.attrs.src?.split(/[?#]/)[0].split('/').pop() === name) {
        if (found != null) ambiguous = true;
        else found = pos;
      }
    });
  }
  if (found == null || ambiguous) {
    throw new Error('Image position is missing or ambiguous. Please refresh and try again.');
  }
  return found;
}

export function updateImageInDocument({ view, target, newSrc }) {
  let proseIndex = null;
  let ambiguous = false;
  view.state.doc.descendants((node, pos) => {
    if (node === target) {
      if (proseIndex != null) ambiguous = true;
      else proseIndex = pos;
    }
  });
  if (proseIndex == null || ambiguous) {
    throw new Error('The selected image is no longer available. Please try again.');
  }
  view.dispatch(view.state.tr.setNodeMarkup(proseIndex, null, { ...target.attrs, src: newSrc }));
}
