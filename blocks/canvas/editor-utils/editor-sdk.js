import { DOMParser as PMDOMParser } from 'da-y-wrapper';
import { getTableBlockName, getTableBlockVariant } from './blocks.js';
import { canvasBus } from '../utils/canvas-bus.js';

const sessions = new WeakMap();
const NON_BLOCKS = new Set(['metadata', 'section metadata', 'section-metadata', 'library metadata', 'library-metadata']);
const MAX_HTML = 1000000;

export function editorError(code, message) {
  return Object.assign(new Error(message), { code });
}

function requireCondition(condition, code, message) {
  if (!condition) throw editorError(code, message);
}

function fieldsIn(node, pos) {
  if (node.type.name === 'image') return [{ node, pos, type: 'image' }];
  if (node.type.name === 'bullet_list' || node.type.name === 'ordered_list') {
    return [{ node, pos, type: 'list' }];
  }
  if (node.isTextblock && !node.content.content.some((child) => child.type.name === 'image')) {
    return [{ node, pos, type: 'text' }];
  }
  const fields = [];
  node.forEach((child, offset) => fields.push(...fieldsIn(child, pos + 1 + offset)));
  return fields;
}

function readOnly(node) {
  const marks = node.firstChild?.marks ?? [];
  return node.content.content.some((child) => !child.isText
    || child.marks.length !== marks.length
    || child.marks.some((mark, i) => !mark.eq(marks[i])));
}

function descriptor(entry, target, registry) {
  const { node, type } = entry;
  if (registry) registry.set(JSON.stringify(target), entry);
  const result = {
    type,
    value: type === 'image' ? node.attrs.src : node.textContent,
    readOnly: type === 'text' && readOnly(node),
    multiline: type === 'text' && (node.textContent.length > 200 || node.textContent.includes('\n')),
    ...(target && { target }),
  };
  if (type === 'text') {
    const href = node.firstChild?.marks.find((mark) => mark.type.name === 'link')?.attrs.href;
    if (href !== undefined) result.href = href;
  }
  if (type === 'image') result.alt = node.attrs.alt ?? '';
  if (type === 'list') {
    result.items = [];
    node.forEach((item, offset, itemIndex) => {
      const text = item.childCount === 1 && item.firstChild.isTextblock ? item.firstChild : null;
      const itemTarget = target && { ...target, itemIndex };
      const itemEntry = { node: text ?? item, pos: entry.pos + offset + 2, type: 'text' };
      const data = descriptor(itemEntry, itemTarget, registry);
      data.readOnly ||= !text;
      result.items.push(data);
    });
  }
  return result;
}

function describeTable(table, pos, registry, session) {
  const target = pos === null ? null : { attribute: 'data-block-index', index: pos + 1 };
  if (registry) registry.set(JSON.stringify(target), { node: table, pos, type: 'block' });
  const rows = [];
  table.forEach((row, rowOffset, index) => {
    if (index === 0) return;
    const rowIndex = index - 1;
    if (registry) { registry.set(JSON.stringify({ ...target, rowIndex }), { node: row, pos: pos + 1 + rowOffset, type: 'row' }); }
    const cells = [];
    row.forEach((cell, cellOffset, cellIndex) => {
      const fields = fieldsIn(cell, (pos ?? 0) + 2 + rowOffset + cellOffset);
      const descriptors = fields.map((entry, fieldIndex) => {
        const fieldTarget = target && { ...target, rowIndex, cellIndex, fieldIndex };
        return descriptor(entry, fieldTarget, registry);
      });
      if (cellIndex === 1 && row.childCount === 2 && cell.childCount === 1
        && cell.firstChild.isTextblock && row.firstChild.childCount === 1
        && row.firstChild.firstChild.isTextblock
        && row.firstChild.firstChild.content.content.every((child) => child.isText)) {
        descriptors.forEach((field) => {
          if (field.type === 'text') field.optionKey = row.firstChild.textContent;
        });
      }
      cells.push({
        colspan: cell.attrs.colspan,
        rowspan: cell.attrs.rowspan,
        fields: descriptors,
      });
    });
    let key;
    if (session) {
      if (!session.rowKeys.has(row)) {
        session.rowSequence += 1;
        session.rowKeys.set(row, String(session.rowSequence));
      }
      key = session.rowKeys.get(row);
    }
    rows.push({ cells, ...(key && { key }) });
  });
  return {
    ...(target && { target }),
    name: getTableBlockName(table),
    variant: getTableBlockVariant(table),
    rows,
  };
}

function serialize(view, session) {
  const registry = new Map();
  const html = session.serializeHtml ? session.serializeHtml(view) : null;
  const document = new DOMParser().parseFromString(html, 'text/html');
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === 'image') {
      const target = { attribute: 'data-image-index', index: pos };
      if (document.querySelector(`[data-image-index="${pos}"]`)) {
        registry.set(JSON.stringify(target), { node, pos, type: 'image' });
      }
    } else if (node.isTextblock || ['bullet_list', 'ordered_list'].includes(node.type.name)) {
      const target = { attribute: 'data-prose-index', index: pos + 1 };
      if (document.querySelector(`[data-prose-index="${pos + 1}"]`)) {
        registry.set(JSON.stringify(target), { node, pos, type: node.isTextblock ? 'text' : 'list' });
      }
    }
  });
  const blocks = [];
  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'table' || NON_BLOCKS.has(getTableBlockName(node))) return undefined;
    if (!document.querySelector(`[data-block-index="${pos + 1}"]`)) return false;
    const block = describeTable(node, pos, registry, session);
    block.rows.forEach((row) => row.cells.forEach((cell) => cell.fields.forEach((field) => {
      if (field.type === 'image') {
        const entry = registry.get(JSON.stringify(field.target));
        field.previewSrc = view.nodeDOM(entry.pos)?.src ?? field.value;
      }
    })));
    blocks.push(block);
    return false;
  });
  session.registry = registry;
  session.blocks = blocks;
  session.html = html;
}

export function updateEditorSession(view, { reset = false, serializeHtml } = {}) {
  let session = sessions.get(view);
  const changed = !session || session.doc !== view.state.doc;
  if (!session || reset) {
    session = {
      documentId: crypto.randomUUID(),
      revision: 0,
      serializeHtml,
      rowKeys: new WeakMap(),
      rowSequence: 0,
    };
    sessions.set(view, session);
  } else if (changed) session.revision += 1;
  if (changed || reset) serialize(view, session);
  session.doc = view.state.doc;
  canvasBus.extensionEditorState.emit({ view, changed: changed || reset });
}

export function closeEditorSession(view) {
  sessions.delete(view);
  canvasBus.extensionEditorState.emit({ view: null, closedView: view });
}

export function getEditorSnapshot(view) {
  requireCondition(view && !view.isDestroyed, 'UNAVAILABLE', 'No editor document is available.');
  if (!sessions.has(view)) updateEditorSession(view);
  const session = sessions.get(view);
  requireCondition(session.serializeHtml, 'UNAVAILABLE', 'The editor snapshot serializer is unavailable.');
  const { selection } = view.state;
  const block = session.blocks.find(({ target }) => {
    const { node, pos } = session.registry.get(JSON.stringify(target));
    return selection.from >= pos && selection.to <= pos + node.nodeSize;
  });
  return {
    documentId: session.documentId,
    revision: session.revision,
    html: session.html,
    editable: view.editable !== false,
    blocks: session.blocks,
    selectedBlock: block?.target ?? null,
  };
}

export function validateEditorRequest(view, request, { editable = true } = {}) {
  const snapshot = getEditorSnapshot(view);
  requireCondition(request?.documentId === snapshot.documentId, 'WRONG_DOCUMENT', 'The document changed. Refresh before editing.');
  requireCondition(request.revision === snapshot.revision, 'STALE_REVISION', 'The page changed. Review the latest content before submitting this edit.');
  requireCondition(!editable || snapshot.editable, 'READ_ONLY', 'This document is read-only.');
  return sessions.get(view);
}

export function resolveEditorTarget(view, request, options) {
  const session = validateEditorRequest(view, request, options);
  const { target } = request;
  requireCondition(target && Object.keys(target).every((key) => [
    'attribute', 'index', 'rowIndex', 'cellIndex', 'fieldIndex', 'itemIndex',
  ].includes(key)), 'INVALID_TARGET', 'Unsupported editor target.');
  const key = JSON.stringify({
    attribute: target.attribute,
    index: target.index,
    ...(target.rowIndex !== undefined && { rowIndex: target.rowIndex }),
    ...(target.cellIndex !== undefined && { cellIndex: target.cellIndex }),
    ...(target.fieldIndex !== undefined && { fieldIndex: target.fieldIndex }),
    ...(target.itemIndex !== undefined && { itemIndex: target.itemIndex }),
  });
  const entry = session.registry.get(key);
  requireCondition(entry, 'INVALID_TARGET', 'The target was not issued in this snapshot.');
  return entry;
}

function parseHtml(view, html, tag) {
  requireCondition(typeof html === 'string' && html.length <= MAX_HTML, 'INVALID_CHANGE', 'Invalid or oversized HTML.');
  const document = new DOMParser().parseFromString(tag === 'tr' ? `<table>${html}</table>` : html, 'text/html');
  requireCondition(!document.querySelector('script, iframe, object, embed'), 'INVALID_CHANGE', 'Executable HTML is not allowed.');
  const element = document.querySelector(tag);
  requireCondition(element && document.querySelectorAll(tag).length === 1, 'INVALID_CHANGE', `Exactly one ${tag} is required.`);
  const parsed = PMDOMParser.fromSchema(view.state.schema).parse(document.body);
  let result;
  parsed.descendants((node) => {
    if (!result && node.type.name === (tag === 'tr' ? 'table_row' : 'table')) result = node;
  });
  requireCondition(result, 'INVALID_CHANGE', 'HTML does not match the editor schema.');
  result.check();
  return result;
}

export function describeEditorBlock(view, { html }) {
  requireCondition(view, 'UNAVAILABLE', 'No editor document is available.');
  return describeTable(parseHtml(view, html, 'table'), null);
}

function validIndex(index, count) {
  requireCondition(Number.isInteger(index) && index >= 0 && index < count, 'INVALID_CHANGE', 'Invalid item index.');
}

function validateUrl(value) {
  requireCondition(typeof value === 'string', 'INVALID_CHANGE', 'A URL must be a string.');
  const url = new URL(value, window.location.href);
  requireCondition(['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol), 'INVALID_CHANGE', 'Unsupported URL protocol.');
}

function applyOperation(view, tr, entry, change) {
  const pos = tr.mapping.map(entry.pos);
  const node = tr.doc.nodeAt(pos);
  const { schema } = view.state;
  const expect = (type) => requireCondition(entry.type === type, 'INVALID_CHANGE', `This operation requires a ${type} target.`);
  if (change.type === 'setText' || change.type === 'setLink') {
    expect('text');
    requireCondition(!readOnly(entry.node), 'INVALID_CHANGE', 'This rich-text field is read-only.');
    if (change.type === 'setText') {
      requireCondition(typeof change.value === 'string', 'INVALID_CHANGE', 'Text must be a string.');
      tr.replaceWith(
        pos + 1,
        pos + 1 + node.content.size,
        change.value ? schema.text(change.value, node.firstChild?.marks) : [],
      );
    } else {
      validateUrl(change.href);
      const link = node.firstChild?.marks.find((mark) => mark.type.name === 'link');
      requireCondition(link && node.content.size, 'INVALID_CHANGE', 'This field has no editable link.');
      tr.addMark(
        pos + 1,
        pos + 1 + node.content.size,
        link.type.create({ ...link.attrs, href: change.href }),
      );
    }
    return;
  }
  if (change.type === 'changeList') {
    expect('list');
    const items = [...node.content.content];
    if (change.from === null) items.push(schema.nodes.list_item.createAndFill());
    else {
      validIndex(change.from, items.length);
      if (change.to === null) {
        requireCondition(items.length > 1, 'INVALID_CHANGE', 'At least one list item must remain.');
        items.splice(change.from, 1);
      } else {
        validIndex(change.to, items.length);
        items.splice(change.to, 0, items.splice(change.from, 1)[0]);
      }
    }
    tr.replaceWith(pos, pos + node.nodeSize, node.type.create(node.attrs, items, node.marks));
    return;
  }
  expect('block');
  if (change.type === 'setBlockVariant') {
    requireCondition(typeof change.value === 'string' && !/[()\r\n]/.test(change.value), 'INVALID_CHANGE', 'Invalid block variant.');
    const para = node.firstChild?.firstChild?.firstChild;
    requireCondition(para?.isTextblock, 'INVALID_CHANGE', 'The block header is not editable.');
    const name = para.textContent.replace(/\s*\([^)]*\)\s*$/, '').trim();
    tr.insertText(change.value ? `${name} (${change.value})` : name, pos + 4, pos + 4 + para.content.size);
  } else if (change.type === 'replaceBlock') {
    tr.replaceWith(pos, pos + node.nodeSize, parseHtml(view, change.html, 'table'));
  } else {
    const rows = [...node.content.content];
    if (change.type === 'appendBlockRow') rows.push(parseHtml(view, change.html, 'tr'));
    else if (change.type === 'deleteBlockRow') {
      validIndex(change.rowIndex, rows.length - 1);
      rows.splice(change.rowIndex + 1, 1);
    } else if (change.type === 'moveBlockRow') {
      validIndex(change.from, rows.length - 1);
      validIndex(change.to, rows.length - 1);
      rows.splice(change.to + 1, 0, rows.splice(change.from + 1, 1)[0]);
    } else throw editorError('INVALID_CHANGE', `Unsupported operation: ${change.type}`);
    const widths = rows.map((row) => row.content.content
      .reduce((sum, cell) => sum + cell.attrs.colspan, 0));
    requireCondition(
      widths.every((width) => width === widths[0]),
      'INVALID_CHANGE',
      'The template row does not match the block columns.',
    );
    tr.replaceWith(pos, pos + node.nodeSize, node.type.create(node.attrs, rows, node.marks));
  }
}

export function applyEditorChanges(view, request) {
  validateEditorRequest(view, request);
  requireCondition(Array.isArray(request.changes) && request.changes.length > 0
    && request.changes.length <= 100, 'INVALID_CHANGE', 'Provide between 1 and 100 changes.');
  const entries = request.changes.map((change) => {
    const targeted = { ...request, target: change?.target };
    return resolveEditorTarget(view, targeted);
  });
  entries.forEach((entry, index) => {
    requireCondition(entries.slice(0, index).every((previous) => (
      entry.pos >= previous.pos + previous.node.nodeSize
      || previous.pos >= entry.pos + entry.node.nodeSize
    )), 'INVALID_CHANGE', 'Overlapping edits must be submitted separately.');
  });
  const { tr } = view.state;
  request.changes.forEach((change, index) => applyOperation(view, tr, entries[index], change));
  tr.doc.check();
  tr.setSelection(view.state.selection.map(tr.doc, tr.mapping));
  view.dispatch(tr);
  const { documentId, revision } = getEditorSnapshot(view);
  return { documentId, revision };
}

export function selectEditorTarget(view, request) {
  let entry = resolveEditorTarget(view, request, { editable: false });
  if (entry.type === 'row') {
    [entry] = fieldsIn(entry.node, entry.pos);
    requireCondition(entry, 'INVALID_TARGET', 'This row has no selectable content.');
  }
  canvasBus.editorProseSelectState.emit({
    proseIndex: entry.type === 'image' ? entry.pos : entry.pos + 1,
    kind: entry.node.type.name,
  });
  return { documentId: request.documentId, revision: request.revision };
}
