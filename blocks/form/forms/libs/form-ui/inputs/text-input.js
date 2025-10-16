import { html, render, nothing } from 'da-lit';
import BaseInput from './base-input.js';

/**
 * TextInput
 *
 * Renderer for string properties, mapping common JSON Schema `format` values
 * to appropriate HTML input types (email, url, date, etc.).
 */
export default class TextInput extends BaseInput {
  constructor(context, handlers = {}) { super(context, handlers); }
  /** Map JSON Schema `format` to an HTML input type. */
  getInputType(format) {
    const map = { email: 'email', uri: 'url', url: 'url', date: 'date', 'date-time': 'datetime-local', time: 'time', password: 'password', color: 'color' };
    return map[format] || 'text';
  }

  /** Create a text-like input bound to `fieldPath` with schema hints. */
  create(fieldPath, propSchema, format) {
    const type = this.getInputType(format);
    const mount = document.createElement('div');
    render(html`
      <input
        class="form-ui-input"
        name=${fieldPath}
        type=${type}
        .value=${propSchema.default || ''}
        placeholder=${propSchema.placeholder || ''}
        pattern=${propSchema.pattern || nothing}
        minlength=${propSchema.minLength || nothing}
        maxlength=${propSchema.maxLength || nothing}
      />
    `, mount);
    const input = mount.firstElementChild;
    this.attachCommonEvents(input, fieldPath, propSchema);
    return input;
  }
}


