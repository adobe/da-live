export function afterNextPaint(cb) {
  Promise.resolve().then(() => requestAnimationFrame(cb));
}

export function ensureProseMountedInShadow({
  shadowRoot,
  proseEl,
  mountSelector = '.nx-editor-doc-mount',
}) {
  const mount = shadowRoot?.querySelector(mountSelector);
  if (!mount || mount.contains(proseEl)) return;
  mount.appendChild(proseEl);
  if (shadowRoot && !shadowRoot.createRange) {
    shadowRoot.createRange = () => document.createRange();
  }
  if (shadowRoot && !shadowRoot.getSelection) {
    shadowRoot.getSelection = () => document.getSelection();
  }
}
