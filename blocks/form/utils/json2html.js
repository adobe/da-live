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

function createTextRow(key, value) {
  const row = document.createElement('div');

  const keyCol = document.createElement('div');
  const keyPara = document.createElement('p');
  keyPara.textContent = key;
  keyCol.append(keyPara);

  const valCol = document.createElement('div');

  if (value) {
    const valPara = document.createElement('p');
    valPara.textContent = value;
    valCol.append(valPara);
  }

  row.append(keyCol, valCol);
  return row;
}

function createBlock(name) {
  const block = document.createElement('div');
  block.className = name;
  return block;
}

function getFormBlock(metadata) {
  const daForm = createBlock('da-form');

  const rows = Object.entries(metadata).map((entry) => {
    const [key, value] = entry;
    const xKey = key === 'schemaName' ? 'x-schema-name' : key;
    return createTextRow(xKey, value);
  });

  daForm.append(...rows);
  return daForm;
}

function getDataBlock(schemaName, data) {
  const dataBlock = createBlock(schemaName);
  const rows = Object.entries(data).map((entry) => {
    const [key, value] = entry;
    return createTextRow(key, value);
  });
  dataBlock.append(...rows);
  return dataBlock;
}

export default function json2html(json) {
  const doc = getDocument();

  const { metadata, data } = json;
  const { schemaName } = metadata;
  const formBlock = getFormBlock(metadata);
  const dataBlock = getDataBlock(schemaName, data);

  doc.querySelector('main > div').append(formBlock, dataBlock);

  console.log(doc.body.outerHTML);

  return doc.body.outerHTML;
}
