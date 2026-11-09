import { expect } from '@esm-bundle/chai';
import { EditorState, EditorView, columnResizing } from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import { setNx } from '../../../../../scripts/utils.js';
import { getDiffClass } from '../../../../../blocks/edit/prose/diff/diff-utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { getInstrumentedHTML, parseSections, updateDocument } = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js');

const schema = getSchema();
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const deleted = (text) => ({ type: 'diff_deleted', content: [para(text)] });
const added = (text) => ({ type: 'diff_added', content: [para(text)] });
const cell = (text) => ({ type: 'table_cell', content: [para(text)] });
const row = (text) => ({ type: 'table_row', content: [cell(text)] });
const block = (name, text) => ({ type: 'table', content: [row(name), row(text)] });
const addedBlock = (name, text) => ({ type: 'diff_added', content: [block(name, text)] });
const deletedBlock = (name, text) => ({ type: 'diff_deleted', content: [block(name, text)] });

function makeDiffView(content, { onViewChange } = {}) {
  const doc = schema.nodeFromJSON({ type: 'doc', content });
  const dom = document.createElement('div');
  document.body.appendChild(dom);
  const view = new EditorView(dom, {
    state: EditorState.create({ schema, doc, plugins: [columnResizing()] }),
    nodeViews: {
      diff_added(node, v, getPos) {
        const View = getDiffClass('da-diff-added', () => schema, () => {}, { isUpstream: false, onViewChange });
        return new View(node, v, getPos);
      },
      diff_deleted(node, v, getPos) {
        const View = getDiffClass('da-diff-deleted', () => schema, () => {}, { isUpstream: true, onViewChange });
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

describe('getInstrumentedHTML for the read-only preview', () => {
  const image = { type: 'image', attrs: { src: 'https://example.com/a.png' } };
  const content = () => [
    para('intro'),
    deleted('upstream text'), added('local text'),
    deletedBlock('hero', 'upstream headline'), addedBlock('hero', 'local headline'),
    { type: 'diff_added', content: [{ type: 'paragraph', content: [image] }] },
    block('cards', 'shared'),
  ];
  const preview = (view) => getInstrumentedHTML(view, { stripDiffIndices: true });
  const fragment = (html) => new DOMParser().parseFromString(html, 'text/html');

  it('leaves no editing indices on conflict content', () => {
    const { view, cleanup } = makeDiffView(content());
    try {
      const doc = fragment(preview(view));
      const marked = [...doc.querySelectorAll('[data-diff]')];
      expect(marked.length).to.be.greaterThan(2);
      marked.forEach((el) => {
        const own = ['data-prose-index', 'data-block-index', 'data-image-index'];
        own.forEach((attr) => expect(el.hasAttribute(attr), `${el.outerHTML} ${attr}`).to.be.false);
        expect(
          el.querySelector('[data-prose-index], [data-block-index], [data-image-index]'),
          el.outerHTML,
        ).to.be.null;
      });
    } finally {
      cleanup();
    }
  });

  it('leaves no index on a list that contains a conflict', () => {
    const list = {
      type: 'bullet_list',
      content: [
        { type: 'list_item', content: [para('plain item')] },
        { type: 'list_item', content: [deleted('upstream item')] },
        { type: 'list_item', content: [added('local item')] },
      ],
    };
    const other = { type: 'bullet_list', content: [{ type: 'list_item', content: [para('clean')] }] };
    const { view, cleanup } = makeDiffView([para('intro'), list, other]);
    try {
      const doc = fragment(preview(view));
      const lists = [...doc.querySelectorAll('ul')];
      expect(lists[0].hasAttribute('data-prose-index')).to.be.false;
      expect(lists[1].hasAttribute('data-prose-index')).to.be.true;
      expect(doc.querySelector('li[data-diff="local"]')).to.exist;
      expect(fragment(getInstrumentedHTML(view)).querySelector('ul[data-prose-index]')).to.exist;
    } finally {
      cleanup();
    }
  });

  it('keeps the indices and markers of content outside conflicts', () => {
    const { view, cleanup } = makeDiffView(content());
    try {
      const doc = fragment(preview(view));
      expect(doc.querySelector('p[data-prose-index]').textContent).to.equal('intro');
      expect(doc.querySelector('div.cards').getAttribute('data-block-index')).to.match(/^\d+$/);
      expect(doc.querySelector('div.hero[data-diff="local"]')).to.exist;
    } finally {
      cleanup();
    }
  });

  it('keeps conflict indices in the default output, which the outline reads', () => {
    const { view, cleanup } = makeDiffView(content());
    try {
      const doc = fragment(getInstrumentedHTML(view));
      expect(doc.querySelector('[data-diff="local"][data-prose-index]')).to.exist;
    } finally {
      cleanup();
    }
  });

  it('posts the stripped body to the preview but returns the indexed body for the outline', () => {
    const { view, cleanup } = makeDiffView(content());
    const posted = [];
    const ctx = { view, suppressRerender: false, port: { postMessage: (m) => posted.push(m) } };
    try {
      const returned = updateDocument(ctx);
      const sent = posted.find((m) => m.type === 'set-body').payload.body;
      expect(fragment(sent).querySelector('[data-diff][data-prose-index]')).to.be.null;
      expect(fragment(returned).querySelector('[data-diff="local"][data-prose-index]')).to.exist;
    } finally {
      cleanup();
    }
  });

  it('sends the same body for the preview and the outline when there are no conflicts', () => {
    const { view, cleanup } = makeDiffView([para('a'), block('cards', 'b')]);
    const posted = [];
    const ctx = { view, suppressRerender: false, port: { postMessage: (m) => posted.push(m) } };
    try {
      const returned = updateDocument(ctx);
      expect(posted.find((m) => m.type === 'set-body').payload.body).to.equal(returned);
    } finally {
      cleanup();
    }
  });
});

describe('getInstrumentedHTML follows the active conflict tab', () => {
  const content = () => [
    para('intro'),
    deleted('upstream text'), added('local text'),
    deletedBlock('hero', 'upstream headline'), addedBlock('hero', 'local headline'),
  ];
  const showTab = (view, index, tab) => {
    const container = view.dom.querySelectorAll('.loc-tabbed-container')[index];
    container.querySelectorAll('.diff-tab-pane').forEach((pane) => {
      pane.classList.toggle('active', pane.dataset.tab === tab);
    });
    return container;
  };
  const loadDiff = (container, html) => {
    container.querySelector('.diff-tab-pane[data-tab="diff"]').innerHTML = html;
  };
  const body = (view) => new DOMParser().parseFromString(getInstrumentedHTML(view), 'text/html');

  it('shows the local side on the default tab', () => {
    const { view, cleanup } = makeDiffView(content());
    try {
      expect(body(view).body.textContent).to.include('local text');
      expect(body(view).body.textContent).to.not.include('upstream text');
    } finally {
      cleanup();
    }
  });

  it('shows the upstream side, marked upstream, on the upstream tab', () => {
    const { view, cleanup } = makeDiffView(content());
    try {
      showTab(view, 0, 'deleted');
      const doc = body(view);
      expect(doc.querySelector('p[data-diff="upstream"]').textContent).to.equal('upstream text');
      expect(doc.body.textContent).to.not.include('local text');
      expect(doc.body.textContent).to.include('local headline');
    } finally {
      cleanup();
    }
  });

  it('shows an upstream block on the upstream tab', () => {
    const { view, cleanup } = makeDiffView(content());
    try {
      showTab(view, 1, 'deleted');
      const hero = body(view).querySelector('div.hero');
      expect(hero.getAttribute('data-diff')).to.equal('upstream');
      expect(hero.textContent).to.include('upstream headline');
    } finally {
      cleanup();
    }
  });

  it('shows the word diff with inline styles on the difference tab', () => {
    const { view, cleanup } = makeDiffView(content());
    try {
      const container = showTab(view, 0, 'diff');
      loadDiff(container, '<div class="html-diff"><p>same <del class="diffdel">old</del> <ins class="diffins">new</ins> <ins class="diffmod">mod</ins></p></div>');
      const doc = body(view);
      const p = doc.querySelector('p[data-diff="changed"]');
      expect(p.textContent).to.equal('same old new mod');
      expect(doc.querySelector('.html-diff')).to.be.null;
      expect(doc.querySelector('del.diffdel').getAttribute('style')).to.include('line-through');
      expect(doc.querySelector('ins.diffins').getAttribute('style')).to.include('background');
      expect(doc.querySelector('ins.diffmod').getAttribute('style')).to.include('background');
    } finally {
      cleanup();
    }
  });

  it('falls back to local while the diff is loading', () => {
    const { view, cleanup } = makeDiffView(content());
    try {
      showTab(view, 0, 'diff');
      const doc = body(view);
      expect(doc.body.textContent).to.include('local text');
      expect(doc.body.textContent).to.not.include('Loading diff');
    } finally {
      cleanup();
    }
  });

  it('falls back to local for a block pair on the difference tab', () => {
    const { view, cleanup } = makeDiffView(content());
    try {
      const container = showTab(view, 1, 'diff');
      loadDiff(container, '<div class="html-diff"><table><tr><td><ins class="diffins">x</ins></td></tr></table></div>');
      const hero = body(view).querySelector('div.hero');
      expect(hero.getAttribute('data-diff')).to.equal('local');
      expect(hero.textContent).to.include('local headline');
    } finally {
      cleanup();
    }
  });
});

describe('conflict view change notifications', () => {
  const waitFor = async (check) => {
    for (let i = 0; i < 100 && !check(); i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => { setTimeout(resolve, 20); });
    }
  };

  it('stays quiet on render, then reports a tab switch and the diff finishing', async () => {
    let calls = 0;
    const { view, cleanup } = makeDiffView(
      [deleted('upstream text'), added('local text')],
      { onViewChange: () => { calls += 1; } },
    );
    try {
      await waitFor(() => view.dom.querySelector('.da-diff-btn.is-upstream .switch-btn'));
      expect(calls).to.equal(0);

      view.dom.querySelector('.da-diff-btn.is-upstream .switch-btn').click();
      expect(calls).to.equal(1);

      view.dom.querySelector('.da-diff-btn.is-diff .switch-btn').click();
      await waitFor(() => view.dom.querySelector('.html-diff'));
      await waitFor(() => calls >= 3);
      expect(calls).to.equal(3);
    } finally {
      cleanup();
    }
  });
});
