/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import {
  EditorState, EditorView, Y, ySyncPlugin, yUndoPlugin, yUndo,
  prosemirrorToYXmlFragment,
} from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import { setNx } from '../../../../scripts/utils.js';
import { makeRealView } from './test-helpers.js';
import {
  deleteSection,
  moveSection,
  setSectionName,
} from '../../../../blocks/canvas/editor-utils/blocks.js';
import {
  bindFirstSectionName,
  getFirstSectionName,
  FIRST_SECTION_NAME_KEY,
} from '../../../../blocks/shared/section-name.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let getInstrumentedHTML;
let parseSections;
let canvasBus;

before(async () => {
  await import('../../../../blocks/canvas/ew-page-outline/ew-page-outline.js');
  ({ getInstrumentedHTML, parseSections } = await import('../../../../blocks/canvas/editor-utils/editor-utils.js'));
  ({ canvasBus } = await import('../../../../blocks/canvas/utils/canvas-bus.js'));
});

const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const rule = (daSectionName) => ({ type: 'horizontal_rule', attrs: { daSectionName } });

function makeNamedView() {
  const view = makeRealView({
    type: 'doc',
    content: [para('one'), rule('Feat'), para('two'), rule('Footer'), para('three')],
  });
  const ydoc = new Y.Doc();
  let unbind = bindFirstSectionName(ydoc, view);
  ydoc.getMap('daMetadata').set(FIRST_SECTION_NAME_KEY, 'Hero');
  const rebind = (onChange) => {
    unbind();
    unbind = bindFirstSectionName(ydoc, view, onChange);
  };
  return { view, ydoc, rebind, unbind: () => unbind() };
}

const namesOf = (view) => parseSections(getInstrumentedHTML(view)).map((s) => s.name);
const textOf = (view) => parseSections(getInstrumentedHTML(view))
  .map((s) => s.items[0]?.innerText);

describe('section names — serialization', () => {
  let ctx;
  beforeEach(() => { ctx = makeNamedView(); });
  afterEach(() => {
    ctx.unbind();
    ctx.view.destroy();
  });

  it('surfaces every section name through the outline pipeline', () => {
    expect(namesOf(ctx.view)).to.deep.equal(['Hero', 'Feat', 'Footer']);
  });

  it('keeps names with their sections through a reorder', () => {
    moveSection(ctx.view, 0, 2, 'after');
    expect(textOf(ctx.view)).to.deep.equal(['two', 'three', 'one']);
    expect(namesOf(ctx.view)).to.deep.equal(['Feat', 'Footer', 'Hero']);
    expect(getFirstSectionName()).to.equal('Feat');
  });

  it('keeps names with their sections through a delete', () => {
    deleteSection(ctx.view, 1);
    expect(textOf(ctx.view)).to.deep.equal(['one', 'three']);
    expect(namesOf(ctx.view)).to.deep.equal(['Hero', 'Footer']);
  });

  it('drops the first section name into daMetadata when the first section is deleted', () => {
    deleteSection(ctx.view, 0);
    expect(textOf(ctx.view)).to.deep.equal(['two', 'three']);
    expect(namesOf(ctx.view)).to.deep.equal(['Feat', 'Footer']);
    expect(getFirstSectionName()).to.equal('Feat');
  });

  it('sets and clears a name on a rule-backed section', () => {
    setSectionName(ctx.view, 2, '  Contact  ');
    expect(namesOf(ctx.view)).to.deep.equal(['Hero', 'Feat', 'Contact']);
    setSectionName(ctx.view, 2, '');
    expect(namesOf(ctx.view)).to.deep.equal(['Hero', 'Feat', '']);
  });

  it('does not touch the ydoc when a reorder leaves the first name alone', () => {
    const map = ctx.ydoc.getMap('daMetadata');
    let updates = 0;
    map.observe(() => { updates += 1; });
    moveSection(ctx.view, 1, 2, 'after');
    expect(namesOf(ctx.view)).to.deep.equal(['Hero', 'Footer', 'Feat']);
    expect(updates).to.equal(0);
  });

  it('ignores unrelated daMetadata keys', () => {
    let emits = 0;
    ctx.rebind(() => { emits += 1; });
    ctx.ydoc.getMap('daMetadata').set('loc-images', 'x');
    expect(emits).to.equal(0);
    ctx.ydoc.getMap('daMetadata').set(FIRST_SECTION_NAME_KEY, 'Banner');
    expect(emits).to.equal(1);
  });

  it('sets and clears a name on the first section', () => {
    setSectionName(ctx.view, 0, 'Banner');
    expect(namesOf(ctx.view)).to.deep.equal(['Banner', 'Feat', 'Footer']);
    setSectionName(ctx.view, 0, '');
    expect(getFirstSectionName()).to.equal(null);
    expect(namesOf(ctx.view)).to.deep.equal(['', 'Feat', 'Footer']);
  });
});

describe('section names — outline panel', () => {
  let el;

  beforeEach(async () => {
    el = document.createElement('ew-page-outline');
    el._checkBlockLibrary = async () => {};
    document.body.appendChild(el);
    await el.updateComplete;
    el._hashState = { org: 'org', site: 'site', path: 'page' };
    await el.updateComplete;
  });

  afterEach(() => el.remove());

  const setSections = async (sections) => {
    el._sections = sections;
    await el.updateComplete;
  };

  const section = (sectionIndex, name, items = []) => (
    { sectionIndex, name, blocks: [], items }
  );

  const headingRun = (snippet) => ({
    type: 'content',
    proseIndex: 1,
    innerText: snippet,
    children: [{
      type: 'content', kind: 'heading', level: 2, proseIndex: 1, innerText: snippet, snippet,
    }],
  });

  it('shows the stored name', async () => {
    await setSections([section(0, 'Hero')]);
    expect(el.shadowRoot.querySelector('.section-label').textContent.trim()).to.equal('Hero');
  });

  it('falls back to the ordinal, never to section content', async () => {
    await setSections([section(0, '', [headingRun('Why us')]), section(1, '')]);
    const labels = [...el.shadowRoot.querySelectorAll('.section-label')];
    expect(labels.map((l) => l.textContent.trim())).to.deep.equal(['Section 1', 'Section 2']);
  });

  it('placeholders the input with the ordinal, not section content', async () => {
    await setSections([section(0, '', [headingRun('Why us')])]);
    el.shadowRoot.querySelector('.edit-btn').click();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.section-name-input').placeholder).to.equal('Section 1');
  });

  it('opens the rename input from the edit button next to the name', async () => {
    await setSections([section(0, 'Hero')]);
    const header = el.shadowRoot.querySelector('.section-header');
    const order = [...header.children].map((c) => c.classList[0]);
    expect(order.indexOf('action-btn')).to.equal(order.indexOf('section-label') + 1);

    el.shadowRoot.querySelector('.edit-btn').click();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.section-name-input')).to.exist;
    expect(el.shadowRoot.querySelector('.edit-btn')).to.be.null;
  });

  it('does not start a rename from the name itself', async () => {
    await setSections([section(0, 'Hero')]);
    const label = el.shadowRoot.querySelector('.section-label');
    expect(label.tagName).to.equal('SPAN');
    label.click();
    await el.updateComplete;
    expect(el._editingSection).to.be.undefined;
    expect(el.shadowRoot.querySelector('.section-name-input')).to.be.null;
  });

  it('opens an input seeded with the stored name and stops the header dragging', async () => {
    await setSections([section(0, 'Hero')]);
    el.shadowRoot.querySelector('.edit-btn').click();
    await el.updateComplete;
    const input = el.shadowRoot.querySelector('.section-name-input');
    expect(input.value).to.equal('Hero');
    expect(input.classList.contains('nx-input')).to.be.true;
    expect(el.shadowRoot.querySelector('.section-header').getAttribute('draggable')).to.equal('false');
  });

  it('commits on Enter and cancels on Escape', async () => {
    const calls = [];
    el._commitRename = (i) => calls.push(['commit', i]);
    el._cancelRename = () => calls.push(['cancel']);

    el._onRenameKeydown(new KeyboardEvent('keydown', { key: 'Enter' }), 3);
    el._onRenameKeydown(new KeyboardEvent('keydown', { key: 'Escape' }), 3);

    expect(calls).to.deep.equal([['commit', 3], ['cancel']]);
  });

  it('cancels an open rename when the section count changes underneath it', async () => {
    await setSections([section(0, 'Hero'), section(1, '')]);
    el._startRename(el._sections[1]);
    expect(el._editingSection).to.equal(1);
    canvasBus.editorHtmlState.emit('<main><div><p>one</p></div></main>');
    await el.updateComplete;
    expect(el._editingSection).to.be.undefined;
  });
});

describe('section names — undo', () => {
  const schema = getSchema();
  let ctx;

  const makeSyncedView = (content) => {
    const ydoc = new Y.Doc();
    const fragment = ydoc.getXmlFragment('prosemirror');
    prosemirrorToYXmlFragment(schema.nodeFromJSON({ type: 'doc', content }), fragment);
    const dom = document.createElement('div');
    document.body.appendChild(dom);
    const view = new EditorView(dom, {
      state: EditorState.create({ schema, plugins: [ySyncPlugin(fragment), yUndoPlugin()] }),
      dispatchTransaction(tr) { this.updateState(this.state.apply(tr)); },
    });
    const unbind = bindFirstSectionName(ydoc, view);
    return { ydoc, view, unbind };
  };

  const undo = () => yUndo(ctx.view.state, ctx.view.dispatch.bind(ctx.view));
  const names = () => parseSections(getInstrumentedHTML(ctx.view)).map((s) => s.name);
  const texts = () => parseSections(getInstrumentedHTML(ctx.view))
    .map((s) => s.items[0]?.innerText);

  afterEach(() => {
    ctx.unbind();
    ctx.view.destroy();
  });

  it('undoes a rename of the first section', () => {
    ctx = makeSyncedView([para('one')]);
    setSectionName(ctx.view, 0, 'Hero');
    expect(names()).to.deep.equal(['Hero']);

    undo();
    expect(getFirstSectionName()).to.equal(null);
    expect(names()).to.deep.equal(['']);
  });

  it('undoes a rename of a rule-backed section', () => {
    ctx = makeSyncedView([para('one'), rule(null), para('two')]);
    setSectionName(ctx.view, 1, 'Features');
    expect(names()).to.deep.equal(['', 'Features']);

    undo();
    expect(names()).to.deep.equal(['', '']);
  });

  it('restores order and the first name together when a move is undone', () => {
    ctx = makeSyncedView([para('one'), rule('Feat'), para('two')]);
    ctx.ydoc.getMap('daMetadata').set(FIRST_SECTION_NAME_KEY, 'Hero');

    moveSection(ctx.view, 1, 0, 'before');
    expect(texts()).to.deep.equal(['two', 'one']);
    expect(names()).to.deep.equal(['Feat', 'Hero']);

    undo();
    expect(texts()).to.deep.equal(['one', 'two']);
    expect(names()).to.deep.equal(['Hero', 'Feat']);
  });

  it('restores the first name when a delete of the first section is undone', () => {
    ctx = makeSyncedView([para('one'), rule('Feat'), para('two')]);
    ctx.ydoc.getMap('daMetadata').set(FIRST_SECTION_NAME_KEY, 'Hero');

    deleteSection(ctx.view, 0);
    expect(names()).to.deep.equal(['Feat']);

    undo();
    expect(texts()).to.deep.equal(['one', 'two']);
    expect(names()).to.deep.equal(['Hero', 'Feat']);
  });
});
