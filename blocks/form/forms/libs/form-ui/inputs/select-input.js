import { html, render } from 'da-lit';
import BaseInput from './base-input.js';

/**
 * SelectInput
 *
 * Renderer for string enums using a <select> control with an empty option.
 */
export default class SelectInput extends BaseInput {
  constructor(context, handlers = {}) { super(context, handlers); }
  /** Create a select control for `enumValues`, applying default selection. */
  create(fieldPath, enumValues, propSchema) {
    const mount = document.createElement('div');
    render(html`
      <select name=${fieldPath} class="form-ui-select">
        <option value="">-- Select --</option>
        ${enumValues.map((value) => html`<option value=${value} ?selected=${propSchema.default === value}>${value}</option>`)}
      </select>
    `, mount);
    const select = mount.firstElementChild;
    this.attachCommonEvents(select, fieldPath, propSchema);
    return select;
  }
}


