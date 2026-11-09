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

  it('marks the local side of a conflict pair as local', () => {
    const { view, cleanup } = makeDiffView([
      para('intro'),
      deleted('first upstream'), added('first local'),
    ]);
    try {
      const html = getInstrumentedHTML(view);
      expect(html).to.match(/<p[^>]*data-diff="local"[^>]*>first local<\/p>/);
      expect(html).to.match(/<p(?![^>]*data-diff)[^>]*>intro<\/p>/);
      expect(html).to.not.include('diff-marker');
    } finally {
      cleanup();
    }
  });

  it('marks a lone added node as local and a lone deleted node as upstream', () => {
    const { view, cleanup } = makeDiffView([
      added('only local'), para('between'), deleted('only upstream'),
    ]);
    try {
      const html = getInstrumentedHTML(view);
      expect(html).to.match(/<p[^>]*data-diff="local"[^>]*>only local<\/p>/);
      expect(html).to.match(/<p[^>]*data-diff="upstream"[^>]*>only upstream<\/p>/);
      expect(html).to.match(/<p(?![^>]*data-diff)[^>]*>between<\/p>/);
    } finally {
      cleanup();
    }
  });

  it('marks a block in a conflict pair on the block element', () => {
    const { view, cleanup } = makeDiffView([
      para('intro'),
      deletedBlock('hero (small)', 'upstream headline'),
      addedBlock('hero (small)', 'local headline'),
    ]);
    try {
      const html = getInstrumentedHTML(view);
      expect(html).to.match(/<div class="hero small"[^>]*data-diff="local"/);
      expect(html).to.not.include('diff-marker');
    } finally {
      cleanup();
    }
  });

  it('marks a block in a lone conflict node and keeps its block index', () => {
    const { view, cleanup } = makeDiffView([
      block('hero (small)', 'shared headline'),
      deletedBlock('hero (small)', 'upstream headline'),
    ]);
    try {
      const html = getInstrumentedHTML(view);
      const blocks = html.match(/<div class="hero small"[^>]*>/g) || [];
      expect(blocks).to.have.length(2);
      expect(blocks[0]).to.not.include('data-diff');
      expect(blocks[1]).to.include('data-diff="upstream"');
      expect(blocks[1]).to.match(/data-block-index="\d+"/);
      expect(html).to.not.include('diff-marker');
    } finally {
      cleanup();
    }
  });

  it('marks a list item whose content is a conflict', () => {
    const { view, cleanup } = makeDiffView([
      para('intro'),
      {
        type: 'bullet_list',
        content: [
          { type: 'list_item', content: [para('plain item')] },
          { type: 'list_item', content: [added('local item')] },
        ],
      },
    ]);
    try {
      const html = getInstrumentedHTML(view);
      expect(html).to.match(/<li[^>]*data-diff="local"[^>]*>local item<\/li>/);
      expect(html).to.match(/<li(?![^>]*data-diff)[^>]*>plain item<\/li>/);
    } finally {
      cleanup();
    }
  });

  it('marks an image-only conflict paragraph', () => {
    const image = { type: 'image', attrs: { src: 'https://example.com/a.png' } };
    const { view, cleanup } = makeDiffView([
      { type: 'diff_added', content: [{ type: 'paragraph', content: [image] }] },
    ]);
    try {
      const html = getInstrumentedHTML(view);
      expect(html).to.match(/<picture[^>]*data-diff="local"/);
    } finally {
      cleanup();
    }
  });

  it('keeps the block index of a block after a metadata conflict', () => {
    const { view, cleanup } = makeDiffView([
      para('intro'),
      addedBlock('metadata', 'local title'),
      block('hero', 'shared headline'),
    ]);
    try {
      const html = getInstrumentedHTML(view);
      const hero = html.match(/<div class="hero"[^>]*>/)?.[0];
      expect(hero).to.match(/data-block-index="\d+"/);
      expect(hero).to.not.include('data-diff');
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
