// Test fixture mirroring nx2/blocks/chat-ao/artifacts/page-evaluation.js, which
// defines the <nx-page-eval> renderer that Preflight shows its results with.
if (!customElements.get('nx-page-eval')) {
  customElements.define('nx-page-eval', class extends HTMLElement {});
}
