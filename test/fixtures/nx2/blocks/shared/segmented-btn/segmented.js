// Test fixture mirroring nx2/blocks/shared/segmented-btn/segmented.js.
// Plain HTMLElement (no da-lit - not resolvable under test/fixtures),
// trimmed to what consuming tests exercise: items/value rendering and
// the click -> 'change' event contract.
class NxSegmentedBtn extends HTMLElement {
  #items = [];

  #value = '';

  get items() { return this.#items; }

  set items(val) {
    this.#items = val ?? [];
    this.#render();
  }

  get value() { return this.#value; }

  set value(val) {
    this.#value = val;
    this.#render();
  }

  get updateComplete() { return Promise.resolve(true); }

  #select(val) {
    if (val === this.#value) return;
    this.#value = val;
    this.#render();
    this.dispatchEvent(new CustomEvent('change', {
      detail: { value: val },
      bubbles: true,
      composed: true,
    }));
  }

  #render() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'segmented';
    wrap.setAttribute('role', 'group');
    this.#items.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `segment${item.icon ? ' segment-icon' : ''}${this.#value === item.value ? ' is-selected' : ''}`;
      btn.setAttribute('aria-pressed', String(this.#value === item.value));
      if (item.ariaLabel) btn.setAttribute('aria-label', item.ariaLabel);
      if (item.title) btn.title = item.title;
      btn.textContent = item.icon ? '' : item.label;
      btn.addEventListener('click', () => this.#select(item.value));
      wrap.append(btn);
    });
    this.shadowRoot.append(wrap);
  }
}

if (!customElements.get('nx-segmented-btn')) customElements.define('nx-segmented-btn', NxSegmentedBtn);
