// TODO: Find a more functional way of handling this.
let NESTED_BLOCKS = [];

function getDocument() {
  const doc = document.implementation.createHTMLDocument();

  const header = document.createElement('header');

  const main = document.createElement('main');
  const section = document.createElement('div');
  main.append(section);

  const footer = document.createElement('footer');

  doc.body.append(header, main, footer);

  return doc;
}

function createRow(key, valCol) {
  const row = document.createElement('div');

  const keyCol = document.createElement('div');
  const keyPara = document.createElement('p');
  keyPara.textContent = key;
  keyCol.append(keyPara);

  row.append(keyCol, valCol);
  return row;
}

function createBlock(name) {
  const block = document.createElement('div');
  block.className = name;
  return block;
}

function createValueCol(key, value) {
  const valCol = document.createElement('div');

  if (value) {
    // Create a paragraph to hold the property
    const valPara = document.createElement('p');

    // Handle objects by creating a nested block
    if (typeof value === 'object') {
      // Create unique-ish guid
      const guid = Math.random().toString(36).substring(2, 8);

      const nestedBlock = createBlock(`${key} ${key}-${guid}`);
      const rows = Object.entries(value).map(([k, v]) => {
        const nestedValCol = createValueCol(k, v);
        return createRow(k, nestedValCol);
      });
      nestedBlock.append(...rows);
      NESTED_BLOCKS.push(nestedBlock);

      valPara.textContent = `self://#${key}-${guid}`;
    } else {
      valPara.textContent = value;
    }

    // TODO: Handle arrays

    valCol.append(valPara);
  }

  return valCol;
}

function getFormBlock(metadata) {
  const daForm = createBlock('da-form');

  const rows = Object.entries(metadata).map((entry) => {
    const [key, value] = entry;
    const xKey = key === 'schemaName' ? 'x-schema-name' : key;

    const valCol = createValueCol(key, value);

    return createRow(xKey, valCol);
  });

  daForm.append(...rows);
  return daForm;
}

function getDataBlock(schemaName, data) {
  const dataBlock = createBlock(schemaName);
  const rows = Object.entries(data).map((entry) => {
    const [key, value] = entry;

    const valCol = createValueCol(key, value);

    return createRow(key, valCol);
  });
  dataBlock.append(...rows);
  return dataBlock;
}

export default function json2html(json) {
  // Reset all nested blocks
  NESTED_BLOCKS = [];

  const doc = getDocument();

  const { metadata, data } = json;
  const { schemaName } = metadata;
  const formBlock = getFormBlock(metadata);
  const dataBlock = getDataBlock(schemaName, data);

  doc.querySelector('main > div').append(formBlock, dataBlock, ...NESTED_BLOCKS);

  console.log(doc.body.querySelector('main'));

  return doc.body.outerHTML;
}
