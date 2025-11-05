import HTMLConverter from '../utils/html-converter.js';
import { Validator } from '../../../deps/da-form/dist/index.js';
import { annotateProp } from '../utils/utils.js';

/**
 * A data model that represents a form.
 */
export default class FormModel {
  constructor(html, schemas) {
    const converter = new HTMLConverter(html);
    this._json = converter.json;
    this._schema = schemas[this._json.metadata.schemaName];
    this._annotated = annotateProp('root', this._json.data, this._schema, this._schema);
  }

  validate() {
    const validator = new Validator(this._schema, '2020-12');
    return validator.validate(this._json.data);
  }

  get annotated() {
    return this._annotated;
  }

  get schema() {
    return this._schema;
  }

  get json() {
    return this._json;
  }
}
