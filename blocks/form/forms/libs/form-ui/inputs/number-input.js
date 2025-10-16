import { html, render, nothing } from 'da-lit';
import BaseInput from './base-input.js';

/**
 * NumberInput
 *
 * Renderer for numeric and integer properties using an <input type="number">.
 */
export default class NumberInput extends BaseInput {
  constructor(context, handlers = {}) { super(context, handlers); }
  /** Create a numeric input honoring min/max/step schema constraints. */
  create(fieldPath, propSchema) {
    const mount = document.createElement('div');
    render(html`
      <input
        class="form-ui-input"
        type="number"
        name=${fieldPath}
        .value=${propSchema.default ?? ''}
        min=${propSchema.minimum ?? ''}
        max=${propSchema.maximum ?? ''}
        step=${propSchema.type === 'integer' ? '1' : nothing}
      />
    `, mount);
    const input = mount.firstElementChild;
    this.attachCommonEvents(input, fieldPath, propSchema);
    return input;
  }
}


