import { fromHtmlIsomorphic, selectAll } from '../../../deps/da-form/dist/index.js';

const SELF_REF = 'self://#';

export default class HTMLConverter {
  constructor(html) {
    this.tree = fromHtmlIsomorphic(html);
    this.blocks = selectAll('main > div > div', this.tree);
    this.json = this.convertBlocksToJson();
  }

  convertBlocksToJson() {
    const metadata = this.getMetadata();
    const data = this.findAndConvert(metadata.schemaName);
    return { metadata, data };
  }

  getMetadata() {
    const baseMeta = this.findAndConvert('da-form');
    const { 'x-schema-name': schemaName, ...rest } = baseMeta;
    return { schemaName, ...rest };
  }

  getProperties(block) {
    return block.children.reduce((rdx, row) => {
      if (row.children) {
        const [keyCol, valCol] = row.children;

        const key = keyCol.children[0].children[0].value.trim();

        const { children } = valCol.children[0];

        // The value parent can contain arrays or text
        const val = children.length > 1
          ? this.getArrayValues(children)
          : this.getTypedValue(children);

        rdx[key] = val;
      }
      return rdx;
    }, {});
  }

  /**
   * Find and convert a block to its basic JSON data
   * @param {String} searchTerm the block name or variation
   * @param {Boolean} searchRef if the variation should be used for search
   * @returns {Object} the JSON Object representing pug
   */
  findAndConvert(searchTerm, searchRef) {
    return this.blocks.reduce((acc, block) => {
      // If we are looking for a reference,
      // use the variation, not the block name
      const idx = searchRef ? 1 : 0;
      if (block.properties.className[idx] === searchTerm) {
        return this.getProperties(block);
      }
      return acc;
    }, {});
  }

  // We will always try to convert to a strong type.
  // The schema is responsible for knowing if it is correct.
  getTypedValue(children) {
    const { value } = children[0];

    // Attempt boolean
    const boolean = this.getBoolean(value);
    if (boolean !== null) return boolean;

    // Attempt reference
    const reference = this.getReference(value);
    if (reference !== null) return reference;

    // Attempt number
    const number = this.getNumber(value);
    if (number !== null) return number;

    // Fallback to the base value (plaintext)
    return value;
  }

  getArrayValues(parent) {
    return parent.map((listItem) => {
      const { value } = listItem.children[0];
      const reference = this.getReference(value);
      return reference || value;
    });
  }

  getReference(text) {
    if (text.startsWith(SELF_REF)) {
      const refId = text.split(SELF_REF)[1].replaceAll('/', '-');
      const reference = this.findAndConvert(refId, true);
      if (reference) return reference;
    }
    return null;
  }

  getBoolean(text) {
    if (text === 'true') return true;
    if (text === 'false') return false;
    return null;
  }

  getNumber(text) {
    const num = Number(text);
    const isNum = Number.isFinite(num);
    if (!isNum) return null;
    return num;
  }
}
