class NxSegmentedBtn extends HTMLElement {
  static get observedAttributes() {
    return ['value', 'label'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._items = [];
    this._value = '';
    this._label = '';
  }

  set items(value) {
    this._items = value || [];
    this.render();
  }

  get items() {
    return this._items;
  }

  set value(value) {
    this._value = value || '';
    this.render();
  }

  get value() {
    return this._value;
  }

  set label(value) {
    this._label = value || '';
    this.render();
  }

  get label() {
    return this._label;
  }

  attributeChangedCallback(name, _oldValue, newValue) {
    if (name === 'value') this._value = newValue || '';
    if (name === 'label') this._label = newValue || '';
    this.render();
  }

  connectedCallback() {
    this.render();
  }

  select(val) {
    if (val === this._value) return;
    this._value = val;
    this.render();
    this.dispatchEvent(new CustomEvent('change', {
      detail: { value: val },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    if (!this.shadowRoot) return;
    const buttons = (this._items || []).map((item) => `
      <button type="button" class="segment${this._value === item.value ? ' is-selected' : ''}" data-value="${item.value}" aria-label="${item.ariaLabel || ''}" title="${item.title || ''}">${item.label || ''}</button>
    `).join('');

    this.shadowRoot.innerHTML = `
      <style>
        .segmented { display: inline-flex; gap: 4px; }
      </style>
      <div class="segmented" role="group" aria-label="${this._label}">${buttons}</div>
    `;

    this.shadowRoot.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => this.select(btn.dataset.value));
    });
  }
}

if (!customElements.get('nx-segmented-btn')) {
  customElements.define('nx-segmented-btn', NxSegmentedBtn);
}
