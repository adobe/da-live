import { expect } from '@esm-bundle/chai';
import { aem2doc, getSchema, yDocToProsemirror } from 'da-parser';
import { Y, EditorState, EditorView, Fragment, Slice } from 'da-y-wrapper';
import '../../../../../../blocks/edit/prose/diff/object_hash.js';
import { initDaMetadata, getDaMetadata } from '../../../../../../blocks/edit/utils/helpers.js';
import {
  handleKeepAdded,
  handleKeepSingleNode,
  ACCEPTED_KEY,
  REJECTED_KEY,
} from '../../../../../../blocks/edit/prose/diff/diff-actions.js';
import { showGlobalDialog } from '../../../../../../blocks/edit/prose/diff/diff-global-dialog.js';

// Expected: the block as the editor saves it, normalized like the loc merge before hashing.
const hash = (html) => window.objectHash(html).substring(0, 12);
const IMG = 'https://content.da.live/org/site/de/.page/a.png';
const picture = (src = IMG) => `<picture><source srcset="${src}"><source srcset="${src}" media="(min-width: 600px)"><img src="${src}" alt="A" loading="lazy"></picture>`;
const savedPicture = (src = IMG) => `<picture><source srcset="${src}"><source media="(min-width: 600px)" srcset="${src}"><img alt="A" loading="lazy" src="${src}"></picture>`;

const isLocNode = (node) => ['diff_deleted', 'diff_added'].includes(node?.type?.name);
const isValidPosition = (pos) => pos !== null && pos !== undefined;
const filterNodeContent = (node) => node.content.content;
const replaceIn = (view) => (start, end, content) => {
  const slice = new Slice(Fragment.fromArray(content), 1, 1);
  view.dispatch(view.state.tr.replace(start, end, slice));
};

let container;

function openPage(mainHtml) {
  const ydoc = new Y.Doc();
  aem2doc(`<body><header></header><main><div>${mainHtml}</div></main><footer></footer></body>`, ydoc);
  const schema = getSchema();
  const doc = yDocToProsemirror(schema, ydoc);
  container = document.createElement('div');
  container.className = 'da-prose-mirror';
  document.body.append(container);
  initDaMetadata(ydoc.getMap('daMetadata'));
  return new EditorView(container, { state: EditorState.create({ doc, schema }) });
}

function firstLocPos(view) {
  let found = null;
  view.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (isLocNode(node)) found = pos;
    return found === null;
  });
  return found;
}

function pairContext(view) {
  const pos = firstLocPos(view);
  return {
    view,
    getPos: () => pos,
    isValidPosition,
    isLocNode,
    canFormLocPair: (a, b) => isLocNode(a) && isLocNode(b) && a.type.name !== b.type.name,
    filterNodeContent,
    dispatchContentTransaction: replaceIn(view),
  };
}

function keepAll(view, type) {
  showGlobalDialog(view, new Set([view]), (content) => content, isLocNode);
  container.querySelector(`.da-diff-btn.is-${type} .confirm-btn`).click();
}

const settle = () => new Promise((resolve) => { setTimeout(resolve, 100); });
const stored = (key) => (getDaMetadata(key) || '').split(',').filter(Boolean);

describe('diff-actions review hashes', () => {
  before(() => {
    window.location.hash = '#/org/site/de/page';
  });

  afterEach(() => {
    container?.remove();
  });

  it('hashes a kept own block without its da-diff-added attribute (Keep All Local)', async () => {
    const view = openPage('<da-diff-deleted><h2>Hello</h2></da-diff-deleted><h2 da-diff-added="">Welcome</h2>');
    keepAll(view, 'local');
    await settle();
    expect(stored(ACCEPTED_KEY)).to.deep.equal([hash('<h2>Welcome</h2>')]);
    expect(stored(REJECTED_KEY)).to.deep.equal([hash('<h2>Hello</h2>')]);
  });

  it('hashes a rejected own block without its da-diff-added attribute (Keep All Upstream)', async () => {
    const view = openPage('<da-diff-deleted><h2>Hello</h2></da-diff-deleted><h2 da-diff-added="">Welcome</h2>');
    keepAll(view, 'upstream');
    await settle();
    expect(stored(ACCEPTED_KEY)).to.deep.equal([hash('<h2>Hello</h2>')]);
    expect(stored(REJECTED_KEY)).to.deep.equal([hash('<h2>Welcome</h2>')]);
  });

  it('hashes a kept own block without its da-diff-added attribute (pair)', async () => {
    const view = openPage('<da-diff-deleted><h2>Hello</h2></da-diff-deleted><h2 da-diff-added="">Welcome</h2>');
    handleKeepAdded(pairContext(view));
    await settle();
    expect(stored(ACCEPTED_KEY)).to.deep.equal([hash('<h2>Welcome</h2>')]);
  });

  it('hashes a kept own block without its da-diff-added attribute (single block)', async () => {
    const view = openPage('<p>Intro</p><p da-diff-added="">Only here</p>');
    const pos = firstLocPos(view);
    const dispatch = replaceIn(view);
    handleKeepSingleNode(view, () => pos, isValidPosition, isLocNode, filterNodeContent, dispatch);
    await settle();
    expect(stored(ACCEPTED_KEY)).to.deep.equal([hash('<p>Only here</p>')]);
  });

  it('hashes text, links and icons the way the merge normalizes them', async () => {
    const view = openPage([
      '<da-diff-deleted><p>Read <a href="https://example.com/a">more</a> here</p></da-diff-deleted>',
      '<p da-diff-added="">Lesen <a href="https://example.com/b">mehr</a> hier</p>',
      '<da-diff-deleted><p>See <a href="https://main--site--org.aem.live/about">about</a></p></da-diff-deleted>',
      '<p da-diff-added="">Siehe <a href="https://main--site--org.aem.live/de/about">about</a></p>',
      '<da-diff-deleted><p>Call :phone:</p></da-diff-deleted>',
      '<p da-diff-added="">Anrufen :phone:</p>',
    ].join(''));
    keepAll(view, 'local');
    await settle();
    expect(stored(ACCEPTED_KEY)).to.have.members([
      hash('<p>Lesen<a href="https://example.com/b">mehr</a>hier</p>'),
      hash('<p>Siehe<a href="https://main--site--org.aem.live/de/about">about</a></p>'),
      hash('<p>Anrufen :phone:</p>'),
    ]);
    expect(stored(REJECTED_KEY)).to.have.members([
      hash('<p>Read<a href="https://example.com/a">more</a>here</p>'),
      hash('<p>See<a href="https://main--site--org.aem.live/about">about</a></p>'),
      hash('<p>Call :phone:</p>'),
    ]);
  });

  it('hashes images as they are saved', async () => {
    const other = 'https://content.da.live/org/site/de/.page/b.png';
    const view = openPage([
      `<da-diff-deleted>${picture()}</da-diff-deleted>`,
      picture(other).replace('<picture>', '<picture da-diff-added="">'),
    ].join(''));
    keepAll(view, 'local');
    await settle();
    expect(stored(ACCEPTED_KEY)).to.deep.equal([hash(savedPicture(other))]);
    expect(stored(REJECTED_KEY)).to.deep.equal([hash(savedPicture())]);
  });

  it('hashes block tables, including metadata, as they are saved', async () => {
    const view = openPage([
      '<da-diff-deleted><div class="cards"><div><div>Card</div></div></div></da-diff-deleted>',
      '<div class="cards" da-diff-added=""><div><div>Karte</div></div></div>',
      '<da-diff-deleted><div class="metadata"><div><div>title</div><div>Hello</div></div></div></da-diff-deleted>',
      '<div class="metadata" da-diff-added=""><div><div>title</div><div>Hallo</div></div></div>',
    ].join(''));
    keepAll(view, 'local');
    await settle();
    expect(stored(ACCEPTED_KEY)).to.have.members([
      hash('<div class="cards"><div><div><p>Karte</p></div></div></div>'),
      hash('<div class="metadata"><div><div><p>title</p></div><div><p>Hallo</p></div></div></div>'),
    ]);
    expect(stored(REJECTED_KEY)).to.have.members([
      hash('<div class="cards"><div><div><p>Card</p></div></div></div>'),
      hash('<div class="metadata"><div><div><p>title</p></div><div><p>Hello</p></div></div></div>'),
    ]);
  });
});
