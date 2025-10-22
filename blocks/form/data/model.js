import HTMLConverter from '../utils/html-converter.js';
import { Validator } from '../../../deps/da-form/dist/index.js';
import { deReference, annotateWithSchema } from '../utils/utils.js';

/**
 * A data model that represents a form.
 */
export default class FormModel {
  constructor(html, schemas) {
    const converter = new HTMLConverter(html);
    this._json = converter.json;
    this._schema = schemas[this._json.metadata.schemaName];
  }

  validate() {
    const validator = new Validator(this._schema);
    return validator.validate(this._json.data);
  }

  get annotatedJson() {
    const deRef = deReference(this._schema);
    const annotated = annotateWithSchema(this._json.data, deRef);
    return annotated;
  }

  get schema() {
    return this._schema;
  }

  get json() {
    return this._json;
  }
}
