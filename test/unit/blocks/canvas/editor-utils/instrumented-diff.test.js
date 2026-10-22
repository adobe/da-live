import { expect } from '@esm-bundle/chai';
import { EditorState, EditorView, columnResizing } from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import { setNx } from '../../../../../scripts/utils.js';
import { getDiffClass } from '../../../../../blocks/edit/prose/diff/diff-utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { getInstrumentedHTML, parseSections } = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js');

const schema = getSchema();
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const deleted = (text) => ({ type: 'diff_deleted', content: [para(text)] });
const added = (text) => ({ type: 'diff_added', content: [para(text)] });
const cell = (text) => ({ type: 'table_cell', content: [para(text)] });
const row = (text) => ({ type: 'table_row', content: [cell(text)] });
const block = (name, text) => ({ type: 'table', content: [row(name), row(text)] });
const addedBlock = (name, text) => ({ type: 'diff_added', content: [block(name, text)] });
const deletedBlock = (name, text) => ({ type: 'diff_deleted', content: [block(name, text)] });

function makeDiffView(content) {
  const doc = schema.nodeFromJSON({ type: 'doc', content });
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

const outlineOf = (view) => parseSections(getInstrumentedHTML(view)).flatMap((s) => s.items);

describe('getInstrumentedHTML with merge conflicts', () => {
  it('lists conflicts as default content with the local text, not as blocks', () => {
    const { view, cleanup } = makeDiffView([
      para('intro'),
      deleted('first upstream'), added('first local'),
      deleted('second upstream'), added('second local'),
    ]);
    try {
      const items = outlineOf(view);
      expect(items.filter((i) => i.type === 'block')).to.deep.equal([]);
      const text = items.map((i) => i.innerText).join(' ');
      expect(text).to.include('first local');
      expect(text).to.include('second local');
      expect(text).to.not.include('upstream');
      expect(text).to.not.include('Local');
    } finally {
      cleanup();
    }
  });

  it('lists a lone conflict node as default content', () => {
    const { view, cleanup } = makeDiffView([para('intro'), added('only local')]);
    try {
      const items = outlineOf(view);
      expect(items.filter((i) => i.type === 'block')).to.deep.equal([]);
      expect(items.map((i) => i.innerText).join(' ')).to.include('only local');
    } finally {
      cleanup();
    }
  });

  it('renders a block inside a lone conflict node as that block', () => {
    const { view, cleanup } = makeDiffView([
      block('hero (small)', 'shared headline'),
      addedBlock('hero (small)', 'local headline'),
    ]);
    try {
      const html = getInstrumentedHTML(view);
      expect(html).to.not.include('block-marker');
      expect(html).to.not.include('<table');
      const blocks = html.match(/<div class="hero small"[^>]*>/g) || [];
      expect(blocks).to.have.length(2);
      expect(blocks[1]).to.match(/data-block-index="\d+"/);
      expect(html).to.include('local headline');
    } finally {
      cleanup();
    }
  });

  it('renders the local block of a conflict pair as that block', () => {
    const { view, cleanup } = makeDiffView([
      para('intro'),
      deletedBlock('hero (small)', 'upstream headline'),
      addedBlock('hero (small)', 'local headline'),
    ]);
    try {
      const html = getInstrumentedHTML(view);
      expect(html).to.not.include('block-marker');
      expect(html).to.not.include('<table');
      expect(html.match(/<div class="hero small"[^>]*>/g) || []).to.have.length(1);
      expect(html).to.include('local headline');
      expect(html).to.not.include('upstream headline');
    } finally {
      cleanup();
    }
  });
});
