/**
The type of field that `openPrompt` expects to be passed to it.
*/
class Field {
  constructor(options) {
    this.options = options;
  }
  /**
  Read the field's value from its DOM node.
  */
  read(dom) { return dom.value; }
  /**
  A field-type-specific validation function.
  */
  validateType(value) { return null; }
  /**
  @internal
  */
  validate(value) {
      if (!value && this.options.required)
          return "Required field";
      return this.validateType(value) || (this.options.validate ? this.options.validate(value) : null);
  }
  clean(value) {
      return this.options.clean ? this.options.clean(value) : value;
  }
}
/**
A field class for single-line text fields.
*/
export default class TextField extends Field {
  render() {
      let input = document.createElement("input");
      input.type = "text";
      input.placeholder = this.options.label;
      input.value = this.options.value || "";
      input.autocomplete = "off";
      return input;
  }
}
