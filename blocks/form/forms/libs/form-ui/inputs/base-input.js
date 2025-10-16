/**
 * BaseInput
 *
 * Minimal base class for input wrappers. It wires common input/change/blur/focus
 * event handling to delegate back to the provided handlers from the generator.
 */
export default class BaseInput {
  /**
   * @param {object} context
   * @param {{onInputOrChange?:Function,onBlur?:Function,onFocus?:Function}} [handlers]
   */
  constructor(context, handlers = {}) {
    const noop = () => {};
    this.context = context || {};
    this.onInputOrChange = handlers.onInputOrChange || noop;
    this.onBlur = handlers.onBlur || noop;
    this.onFocus = handlers.onFocus || noop;
  }

  /** Attach standard input/change/blur/focus events to an element. */
  attachCommonEvents(el, fieldPath, schema) {
    ['input', 'change'].forEach((evt) => {
      el.addEventListener(evt, () => this.onInputOrChange(fieldPath, schema, el));
    });
    el.addEventListener('blur', () => this.onBlur(fieldPath, schema, el));
    el.addEventListener('focus', (e) => this.onFocus(fieldPath, schema, e.target));
  }

  /** Convert a camelCase/snake_case name to a human-friendly label. */
  formatLabel(name) {
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .replace(/_/g, ' ');
  }
}


