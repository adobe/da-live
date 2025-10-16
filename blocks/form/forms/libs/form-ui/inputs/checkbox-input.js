import { html, render } from 'da-lit';
import BaseInput from './base-input.js';

/**
 * CheckboxInput
 *
 * Renderer for boolean properties as a checkbox with a label.
 */
export default class CheckboxInput extends BaseInput {
  constructor(context, handlers = {}) { super(context, handlers); }
  /** Create a checkbox input bound to `fieldPath` with schema defaults. */
  create(fieldPath, propSchema) {
    const fieldName = fieldPath.split('.').pop();
    const mount = document.createElement('div');
    render(html`
      <div class="form-ui-checkbox-container">
        <label>
          <input type="checkbox" name=${fieldPath} class="form-ui-checkbox" ?checked=${propSchema.default || false} />
          ${' '}${propSchema.title || this.formatLabel(fieldName)}
        </label>
      </div>
    `, mount);
    const container = mount.firstElementChild;
    const input = container.querySelector('input.form-ui-checkbox');
    this.attachCommonEvents(input, fieldPath, propSchema);
    return container;
  }
}
