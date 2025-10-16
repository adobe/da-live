import { html, render } from 'da-lit';
import BaseInput from './base-input.js';

/**
 * TextareaInput
 *
 * Renderer for long string content using a <textarea> element.
 */
export default class TextareaInput extends BaseInput {
  constructor(context, handlers = {}) { super(context, handlers); }
  /** Create a textarea with optional placeholder/default. */
  create(fieldPath, propSchema) {
    const mount = document.createElement('div');
    render(html`
      <textarea
        name=${fieldPath}
        class="form-ui-textarea"
        rows="3"
        placeholder=${propSchema.placeholder || ''}
      >${propSchema.default || ''}</textarea>
    `, mount);
    const textarea = mount.firstElementChild;
    this.attachCommonEvents(textarea, fieldPath, propSchema);
    return textarea;
  }
}


