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

function createNestedBlock(key, obj, nestedBlocks) {
  const guid = Math.random().toString(36).substring(2, 8);
  const nestedBlock = createBlock(`${key} ${key}-${guid}`);
  const rows = Object.entries(obj).map(([k, v]) => {
    const nestedValCol = createValueCol(k, v, nestedBlocks);
    return createRow(k, nestedValCol);
  });
  nestedBlock.append(...rows);
  nestedBlocks.push(nestedBlock);
  return guid;
}

function createValueCol(key, value, nestedBlocks) {
  const valCol = document.createElement('div');

  if (value) {
    // Create a paragraph to hold the property
    const valPara = document.createElement('p');

    // Handle objects by creating a nested block
    if (typeof value === 'object') {
      // Check if value is an array and create multiple nested blocks if needed
      if (Array.isArray(value)) {
        // If it's an array of objects, create a nested block for each object
        const ul = document.createElement('ul');
        value.forEach((item) => {
          if (typeof item === 'object' && item !== null) {
            const guid = createNestedBlock(key, item, nestedBlocks);
            const li = document.createElement('li');
            li.textContent = `self://#${key}-${guid}`;
            ul.append(li);
          } else {
            // If the array entry is a primitive, treat accordingly
            const li = document.createElement('li');
            li.textContent = item;
            ul.append(li);
          }
        });
        if (ul.children.length) valCol.append(ul);
        // Since we already appended paragraphs above, skip the rest of this function
        return valCol;
      }

      // handle objects
      const guid = createNestedBlock(key, value, nestedBlocks);
      valPara.textContent = `self://#${key}-${guid}`;
    } else {
      valPara.textContent = value;
    }

    valCol.append(valPara);
  }

  return valCol;
}

function getFormBlock(metadata, nestedBlocks) {
  const daForm = createBlock('da-form');

  const rows = Object.entries(metadata).map((entry) => {
    const [key, value] = entry;
    const xKey = key === 'schemaName' ? 'x-schema-name' : key;

    const valCol = createValueCol(key, value, nestedBlocks);

    return createRow(xKey, valCol);
  });

  daForm.append(...rows);
  return daForm;
}

function getDataBlock(schemaName, data, nestedBlocks) {
  const dataBlock = createBlock(schemaName);
  const rows = Object.entries(data).map((entry) => {
    const [key, value] = entry;

    const valCol = createValueCol(key, value, nestedBlocks);

    return createRow(key, valCol);
  });
  dataBlock.append(...rows);
  return dataBlock;
}

export default function json2html(json) {
  const nestedBlocks = [];
  const doc = getDocument();

  const { metadata, data } = json;
  const { schemaName } = metadata;
  const formBlock = getFormBlock(metadata, nestedBlocks);
  const dataBlock = getDataBlock(schemaName, data, nestedBlocks);

  doc.querySelector('main > div').append(formBlock, dataBlock, ...nestedBlocks);

  return doc.body.outerHTML;
}
