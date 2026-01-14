import HTMLConverter from '../utils/html2json.js';
import JSONConverter from '../utils/json2html.js';
import { Validator } from '../../../deps/da-form/dist/index.js';
import { annotateProp, setValueByPath } from '../utils/utils.js';
import { daFetch } from '../../shared/utils.js';
import { DA_ORIGIN } from '../../shared/constants.js';

/**
 * A data model that represents a piece of structured content.
 */
export default class FormModel {
  constructor({ path, html, json, schemas }) {
    if (!(html || json)) {
      console.log('Please supply JSON or HTML to make a form model');
      return;
    }

    if (html) {
      this._html = html;
      this.updateJson();
    } else if (json) {
      this._json = json;
      this.updateHtml();
    }

    this._path = path;
    this._schemas = schemas;
    this._schema = schemas[this._json.metadata.schemaName];
    this._annotated = annotateProp('data', this._json.data, this._schema, this._schema);
  }

  clone() {
    return new FormModel({
      path: this._path,
      html: this._html,
      json: JSON.parse(JSON.stringify(this._json)), // Deep copy of JSON
      schemas: this._schemas, // or clone this too if needed
    });
  }

  validate() {
    const validator = new Validator(this._schema, '2020-12');
    return validator.validate(this._json.data);
  }

  updateJson() {
    const converter = new HTMLConverter(this._html);
    this._json = converter.json;
  }

  updateHtml() {
    const html = JSONConverter(this._json);
    this._html = html;
  }

  updateProperty({ name, value }) {
    setValueByPath(this._json, name, value);
    this.updateHtml();
  }

  async saveHtml() {
    const body = new FormData();
    const data = new Blob([this._html], { type: 'text/html' });
    body.append('data', data);

    const opts = { method: 'POST', body };

    // TODO: Don't assume the save went perfect
    await daFetch(`${DA_ORIGIN}/source${this._path}`, opts);
  }

  set html(html) {
    this._html = html;
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

  get html() {
    return this._html;
  }
}
