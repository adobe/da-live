export default class HTMLToJSON {
  constructor(html) {
    const parser = new DOMParser();
    const dom = parser.parseFromString(html, 'text/html');
    this.blocks = [...dom.querySelectorAll('main > div > div')];
    this.json = this.convertBlocksToJson();
  }

  convertBlocksToJson() {
    const metadata = this.findAndConvert('form');
    const data = this.findAndConvert(metadata.schemaId);
    return { metadata, data };
  }

  findAndConvert(searchTerm, searchType) {
    return this.blocks.reduce((acc, block) => {
      const idx = searchType === 'refId' ? 1 : 0;
      if (block.classList[idx] === searchTerm) {
        return this.getMetadata(block);
      }
      return acc;
    }, {});
  }

  getMetadata(el) {
    return [...el.childNodes].reduce((rdx, row) => {
      if (row.children) {
        const key = row.children[0].textContent.trim();
        const valueEl = row.children[1];

        const text = valueEl.textContent;

        // Attempt array
        const array = this.getArray(valueEl);

        let ref;
        if (!array) ref = this.getReference(text);

        // Attempt boolean
        const boolean = this.getBoolean(text);

        // Attempt number
        const number = this.getNumber(text);

        if (key && valueEl) {
          if (boolean !== null) {
            rdx[key] = boolean;
          } else {
            rdx[key] = ref || array || number || text;
          }
        }
      }
      return rdx;
    }, {});
  }

  getArray(valueEl) {
    const listEl = valueEl.querySelector('ul, ol');
    if (!listEl) return null;
    return [...listEl.children].map((listItemEl) => {
      const text = listItemEl.textContent;
      const reference = this.getReference(text);
      return reference || text;
    });
  }

  getReference(text) {
    if (text.startsWith('#URL//')) {
      const refId = text.split('#URL//')[1].replaceAll('/', '-');
      const reference = this.findAndConvert(refId, 'refId');
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
    try {
      return Number(text);
    } catch {
      return null;
    }
  }
}