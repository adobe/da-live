// Test fixture mirroring nx2/blocks/chat-ao/artifacts/page-evaluation.js. Real rendering is
// da-nx's concern; this just exposes `.data` for assertions in da-live's own tests.
class NxPageEval extends HTMLElement {
  set data(value) {
    this._data = value;
  }

  get data() {
    return this._data;
  }
}

if (!customElements.get('nx-page-eval')) {
  customElements.define('nx-page-eval', NxPageEval);
}
