import { DOMParser as PMDOMParser } from 'da-y-wrapper';
import { getTableBlockName, getTableBlockVariant } from './blocks.js';
import { normalizeBlockName } from './block-variants.js';

const normalizeVariant = (value) => value.split(',').map(normalizeBlockName).sort().join(',');

function fieldNodes(node, path = []) {
  if (node.type.name === 'image') return [{ node, path, type: 'image' }];
  if (node.isTextblock && !node.content.content.some((child) => child.type.name === 'image')) {
    return [{ node, path, type: 'text' }];
  }
  const fields = [];
  node.forEach((child, offset, index) => fields.push(...fieldNodes(child, [...path, index])));
  return fields;
}

function matchFieldCount(nodes, count) {
  if (nodes.length === count) return nodes;
  const content = nodes.filter(({ node, type }) => type !== 'text' || node.content.size > 0);
  return content.length === count && content.every(({ type }) => type === 'image') ? content : nodes;
}

export async function getBlockFieldTemplate(blocks, name, variant, schema) {
  const variants = (await Promise.all((blocks || []).map(async (block) => (
    ((await block.loadVariants) || []).map((item) => ({ item, path: block.path }))
  )))).flat();
  return variants.map(({ item, path }) => {
    if (!item || item.dom?.tagName !== 'TABLE') return null;
    const container = document.createElement('div');
    container.append(item.dom.cloneNode(true));
    const template = PMDOMParser.fromSchema(schema).parse(container).firstChild;
    return { item, template, path };
  }).find((candidate) => candidate?.template?.type.name === 'table'
    && normalizeBlockName(getTableBlockName(candidate.template)) === normalizeBlockName(name)
    && normalizeVariant(getTableBlockVariant(candidate.template)) === normalizeVariant(variant));
}

/**
 * The fields table mirrors the block table, including its header. Labels inside
 * each cell address text and images in order, regardless of text tags or wrappers.
 * Empty spacer paragraphs around image-only fields do not count as text fields.
 * Selected cells may contain additional trailing content outside the declared fields.
 */
export function buildBlockFieldDefinitions(match) {
  if (!match || !('fields' in match.item)) return [];
  const { item, template } = match;

  const rows = item.fields?.rows;
  if (!rows || rows[0]?.cells.length !== 1
    || rows[0].textContent.trim().toLowerCase() !== 'fields') {
    throw new Error('Block fields metadata must be a table with a Fields header.');
  }
  if (rows.length !== template.childCount) {
    throw new Error('Block fields metadata rows do not match the library template.');
  }
  const definitions = [];
  [...rows].slice(1).forEach((row, index) => {
    const rowIndex = index + 1;
    const templateRow = template.child(rowIndex);
    if (row.cells.length !== templateRow.childCount) {
      throw new Error('Block fields metadata cells do not match the library template.');
    }
    [...row.cells].forEach((cell, cellIndex) => {
      const labels = cell.children.length
        ? [...cell.children].map((el) => el.textContent.trim())
        : [cell.textContent.trim()];
      const templateNodes = fieldNodes(templateRow.child(cellIndex), [rowIndex, cellIndex]);
      const nodes = matchFieldCount(templateNodes, labels.length);
      if (labels.length !== nodes.length) {
        throw new Error('Block field names do not match the library template content.');
      }
      labels.forEach((label, fieldIndex) => {
        if (!label) return;
        const { path, type } = nodes[fieldIndex];
        definitions.push({
          key: path.join('-'),
          label,
          path,
          type,
          fieldIndex,
          rowCount: template.childCount,
          cellCount: templateRow.childCount,
          fieldCount: nodes.length,
        });
      });
    });
  });
  return definitions;
}

export async function getBlockFieldDefinitions(blocks, name, variant, schema) {
  return buildBlockFieldDefinitions(await getBlockFieldTemplate(blocks, name, variant, schema));
}

export function resolveBlockFields(block, definitions) {
  if (!block) return [];
  return definitions.map((field) => {
    const rowIndex = field.path[0];
    const cellIndex = field.path[1];
    const row = block.node.maybeChild(rowIndex);
    const cell = row?.maybeChild(cellIndex);
    const cellNodes = cell ? fieldNodes(cell, [rowIndex, cellIndex]) : [];
    const nodes = matchFieldCount(cellNodes, field.fieldCount);
    const current = nodes[field.fieldIndex];
    const path = current?.path ?? field.path;
    let { node } = block;
    let pos = block.from;
    for (const index of path) {
      if (!node || index >= node.childCount) {
        node = null;
        break;
      }
      pos += 1;
      for (let i = 0; i < index; i += 1) pos += node.child(i).nodeSize;
      node = node.child(index);
    }
    const matches = block.node.childCount === field.rowCount
      && row?.childCount === field.cellCount
      && nodes.length >= field.fieldCount
      && current?.type === field.type;
    const value = matches && (field.type === 'image' ? node.attrs.src : node.textContent);
    return {
      ...field,
      path,
      node: matches ? node : null,
      pos,
      value: value || '',
      error: matches ? '' : 'This field does not match the selected block structure.',
    };
  });
}
