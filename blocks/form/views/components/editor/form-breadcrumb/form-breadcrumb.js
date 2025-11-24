import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../../../../scripts/utils.js';

const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const globalStyle = await getStyle(new URL('../../../../../global.css', import.meta.url).href);
const componentStyle = await getStyle(new URL('./form-breadcrumb.css', import.meta.url).href);

class FormBreadcrumb extends LitElement {
  static properties = {
    segments: { attribute: false },
    root: { attribute: false },
    pointer: { type: String },
    separator: { type: String },
  };

  constructor() {
    super();
    this.segments = [];
    this.root = null;
    this.pointer = '';
    this.separator = ' › ';
  }

  // use shadow DOM; styles are adopted below

  decodePointerToken(token) {
    return token.replace(/~1/g, '/').replace(/~0/g, '~');
  }

  buildSegments(root, pointer) {
    const segments = [];
    if (!root) return segments;
    segments.push({ label: root.schema?.title || 'Root', pointer: root.pointer });
    if (!pointer) return segments;
    const tokens = pointer.split('/').slice(1).map((t) => this.decodePointerToken(t));
    let node = root;
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (!node || !Array.isArray(node.data)) break;
      if (/^\d+$/.test(token)) {
        const idx = Number(token);
        const child = node.data[idx];
        if (!child) break;
        const base = node.schema?.title || 'Item';
        return segments.concat({ label: `${base} #${idx + 1}`, pointer: child.pointer });
      }
      const child = node.data.find((c) => c.key === token);
      if (!child) break;
      segments.push({ label: child.schema?.title || token, pointer: child.pointer });
      node = child;
    }
    return segments;
  }

  handleActivate(pointer) {
    if (pointer == null) return;
    window.dispatchEvent(new CustomEvent('focus-group', {
      detail: { pointer, source: 'breadcrumb' },
      bubbles: true,
      composed: true,
    }));
  }

  connectedCallback() {
    super.connectedCallback();
    const sheets = this.shadowRoot.adoptedStyleSheets || [];
    this.shadowRoot.adoptedStyleSheets = [...sheets, globalStyle, componentStyle];
  }

  render() {
    const segs = (Array.isArray(this.segments) && this.segments.length)
      ? this.segments
      : this.buildSegments(this.root, this.pointer);
    if (!Array.isArray(segs) || segs.length === 0) return nothing;
    return html`
      <div class="form-content-breadcrumb">
        ${segs.map((seg, idx) => html`
          <button
            type="button"
            class="form-ui-breadcrumb-item"
            data-pointer="${seg.pointer}"
            @click=${() => this.handleActivate(seg.pointer)}
          >${seg.label}</button>${idx < segs.length - 1 ? html`<span>${this.separator}</span>` : nothing}
        `)}
      </div>
    `;
  }
}

customElements.define('form-breadcrumb', FormBreadcrumb);
export default FormBreadcrumb;
