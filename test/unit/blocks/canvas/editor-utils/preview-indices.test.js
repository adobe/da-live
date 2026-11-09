import { expect } from '@esm-bundle/chai';
import { EditorState, EditorView, columnResizing } from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import { setNx } from '../../../../../scripts/utils.js';
import { getDiffClass } from '../../../../../blocks/edit/prose/diff/diff-utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { getInstrumentedHTML, resolveEditableNode } = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js');

const schema = getSchema();
const text = (value) => ({ type: 'text', text: value });
const para = (value) => ({ type: 'paragraph', content: [text(value)] });
const heading = (value) => ({ type: 'heading', attrs: { level: 2 }, content: [text(value)] });
const added = (...content) => ({ type: 'diff_added', content });
const deleted = (...content) => ({ type: 'diff_deleted', content });
const item = (...content) => ({ type: 'list_item', content });
const list = (...items) => ({ type: 'bullet_list', content: items });
const cell = (...content) => ({ type: 'table_cell', content });
const row = (...cells) => ({ type: 'table_row', content: cells });
const table = (...rows) => ({ type: 'table', content: rows });
const image = { type: 'image', attrs: { src: 'https://example.com/a.png' } };

const FIXTURES = {
  'paired paragraphs': [para('a'), deleted(para('up')), added(para('local'))],
  'lone added paragraph': [para('a'), added(para('local'))],
  'lone deleted paragraph': [para('a'), deleted(para('up'))],
  'paired headings': [deleted(heading('up')), added(heading('local'))],
  'paired lists': [deleted(list(item(para('up')))), added(list(item(para('local'))))],
  'paired blockquotes': [deleted({ type: 'blockquote', content: [para('up')] }), added({ type: 'blockquote', content: [para('local')] })],
  'paired code blocks': [deleted({ type: 'code_block', content: [text('up')] }), added({ type: 'code_block', content: [text('local')] })],
  'paired images': [deleted({ type: 'paragraph', content: [image] }), added({ type: 'paragraph', content: [image] })],
  'paired blocks': [deleted(table(row(cell(para('hero'))), row(cell(para('up'))))), added(table(row(cell(para('hero'))), row(cell(para('local')))))],
  'list item conflict': [list(item(para('plain')), item(deleted(para('up'))), item(added(para('local'))))],
  'nested list item conflict': [list(item(para('outer'), list(item(deleted(para('up'))), item(added(para('local'))))))],
  'blockquote holding a conflict': [{ type: 'blockquote', content: [para('a'), deleted(para('up')), added(para('local'))] }],
  'block cell holding a conflict': [table(row(cell(para('cards'))), row(cell(deleted(para('up')), added(para('local')))))],
  'conflict between plain content': [para('before'), deleted(para('up')), added(para('local')), list(item(para('after')))],
};

function build(name) {
  const doc = schema.nodeFromJSON({ type: 'doc', content: FIXTURES[name] });
  doc.check();
  const dom = document.createElement('div');
  document.body.appendChild(dom);
  const view = new EditorView(dom, {
    state: EditorState.create({ schema, doc, plugins: [columnResizing()] }),
    nodeViews: {
      diff_added(node, v, getPos) {
        const View = getDiffClass('da-diff-added', () => schema, () => {}, { isUpstream: false });
        return new View(node, v, getPos);
      },
      diff_deleted(node, v, getPos) {
        const View = getDiffClass('da-diff-deleted', () => schema, () => {}, { isUpstream: true });
        return new View(node, v, getPos);
      },
    },
  });
  const cleanup = () => {
    view.destroy();
    dom.remove();
  };
  return { view, cleanup };
}

const hasConflictNode = (node) => {
  let found = false;
  node.descendants((n) => {
    if (n.type.name === 'diff_added' || n.type.name === 'diff_deleted') found = true;
    return !found;
  });
  return found || node.type.name === 'diff_added' || node.type.name === 'diff_deleted';
};

describe('preview body never points the iframe at a conflict', () => {
  Object.keys(FIXTURES).forEach((name) => {
    it(`${name}: no index resolves to a node that holds a conflict`, () => {
      const { view, cleanup } = build(name);
      try {
        const html = getInstrumentedHTML(view, { stripDiffIndices: true });
        const body = new DOMParser().parseFromString(html, 'text/html');
        const indexed = [...body.querySelectorAll('[data-prose-index]')];
        indexed.forEach((el) => {
          const index = Number(el.getAttribute('data-prose-index'));
          const { node } = resolveEditableNode(view.state.doc, index);
          expect(node && hasConflictNode(node), `${el.outerHTML} -> ${node?.type.name}`).to.not.equal(true);
        });
        expect(body.querySelector('[data-diff][data-image-index], [data-diff] [data-image-index]'))
          .to.equal(null);
      } finally {
        cleanup();
      }
    });
  });
});
