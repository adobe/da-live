/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { EditorState, EditorView, columnResizing } from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import { setNx } from '../../../../../scripts/utils.js';
import { makeRealView } from '../test-helpers.js';
import { createTrackingPlugin } from '../../../../../blocks/canvas/editor-utils/prose-diff.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let getExtensionsBridge;
let getInstrumentedHTML;
let parseSections;

before(async () => {
  await import('../../../../../blocks/canvas/ew-page-outline/ew-page-outline.js');
  const editorUtils = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js');
  ({ getInstrumentedHTML, parseSections } = editorUtils);
  ({ getExtensionsBridge } = await import('../../../../../blocks/canvas/editor-utils/extensions-bridge.js'));
});

// Real pipeline, not a hand-picked node position — matches what the outline actually does.
function childrenOf(view) {
  const html = getInstrumentedHTML(view);
  const sections = parseSections(html);
  return sections.flatMap((section) => section.items.flatMap((item) => item.children ?? []));
}

function docSeq(doc) {
  const seq = [];
  doc.forEach((n) => seq.push(n.type.name === 'horizontal_rule' ? 'hr' : n.textContent));
  return seq;
}

// Unlike makeRealView, wires the real tracking plugin so a delete/insert dispatched
// through it auto-emits canvasBus.editorHtmlState exactly like the production editor does —
// needed to test that a reparse-driven expansion reset/re-expand actually happens.
function makeTrackedView(json) {
  const schema = getSchema();
  const doc = schema.nodeFromJSON(json);
  const dom = document.createElement('div');
  document.body.appendChild(dom);
  let view;
  const plugins = [
    columnResizing(),
    createTrackingPlugin(() => canvasBus.editorHtmlState.emit(getInstrumentedHTML(view))),
  ];
  const state = EditorState.create({ schema, doc, plugins });
  view = new EditorView(dom, { state });
  return view;
}

async function createOutline() {
  const el = document.createElement('ew-page-outline');
  // _checkBlockLibrary fires once a hash with org/site is set — no-op it so this
  // test doesn't reach the network.
  el._checkBlockLibrary = async () => {};
  document.body.appendChild(el);
  await el.updateComplete;
  el._hashState = { org: 'org', site: 'site', path: 'page' };
  await el.updateComplete;
  return el;
}

const contentGroupItem = (proseIndex, children) => ({
  type: 'content',
  proseIndex,
  innerText: children.map((c) => c.innerText).filter(Boolean).join(' '),
  children,
});

describe('ew-page-outline — expandable default content', () => {
  let el;

  beforeEach(async () => {
    el = await createOutline();
    el._sections = [{
      sectionIndex: 0,
      blocks: [],
      items: [
        contentGroupItem(1, [
          {
            type: 'content', kind: 'heading', level: 2, proseIndex: 1, innerText: 'Title', snippet: 'Title',
          },
          { type: 'content', kind: 'paragraph', proseIndex: 5, innerText: 'Para one', snippet: 'Para one' },
          { type: 'content', kind: 'image', proseIndex: 9, innerText: '', snippet: '' },
          {
            type: 'content', kind: 'list', ordered: true, proseIndex: 12, innerText: 'one two', snippet: 'one two',
          },
          { type: 'content', kind: 'code', proseIndex: 15, innerText: 'const x = 1;', snippet: 'const x = 1;' },
        ]),
      ],
    }];
    await el.updateComplete;
  });

  afterEach(() => { el.remove(); });

  it('renders a single collapsed "Default content" row with no children visible', () => {
    const header = el.shadowRoot.querySelector('.content-item');
    expect(header).to.exist;
    expect(header.textContent.trim()).to.equal('Default content');
    expect(header.getAttribute('aria-expanded')).to.equal('false');
    expect(el.shadowRoot.querySelector('.content-children')).to.be.null;
  });

  it('expands to list every consecutive item on header click, then collapses again', async () => {
    const header = el.shadowRoot.querySelector('.content-item');
    header.click();
    await el.updateComplete;

    expect(header.getAttribute('aria-expanded')).to.equal('true');
    const children = [...el.shadowRoot.querySelectorAll('.content-child')];
    expect(children).to.have.lengthOf(5);
    expect(children.map((c) => c.textContent.replace(/\s+/g, ' ').trim())).to.deep.equal([
      'Heading 2 Title', 'Paragraph Para one', 'Image', 'Numbered list one two', 'Code block const x = 1;',
    ]);

    header.click();
    await el.updateComplete;
    expect(header.getAttribute('aria-expanded')).to.equal('false');
    expect(el.shadowRoot.querySelector('.content-children')).to.be.null;
  });

  it('emits editorProseSelectState with the child\'s own proseIndex and kind on click', async () => {
    el.shadowRoot.querySelector('.content-item').click();
    await el.updateComplete;

    let received;
    const unsub = canvasBus.editorProseSelectState.subscribe((detail) => { received = detail; });
    const paragraphChild = [...el.shadowRoot.querySelectorAll('.content-child')][1];
    paragraphChild.click();
    unsub();

    expect(received).to.deep.equal({ proseIndex: 5, kind: 'paragraph' });
  });

  it('emits the image kind for an image child, enabling layout-view NodeSelection', async () => {
    el.shadowRoot.querySelector('.content-item').click();
    await el.updateComplete;

    let received;
    const unsub = canvasBus.editorProseSelectState.subscribe((detail) => { received = detail; });
    const imageChild = [...el.shadowRoot.querySelectorAll('.content-child')][2];
    imageChild.click();
    unsub();

    expect(received).to.deep.equal({ proseIndex: 9, kind: 'image' });
  });

  it('marks a clicked content child as selected, and leaves its run expanded when a block is selected instead', async () => {
    el._sections[0].blocks = [{ name: 'hero', blockIndex: 0 }];
    el.shadowRoot.querySelector('.content-item').click();
    await el.updateComplete;

    const paragraphChild = [...el.shadowRoot.querySelectorAll('.content-child')][1];
    paragraphChild.click();
    await el.updateComplete;

    expect(paragraphChild.classList.contains('selected')).to.be.true;
    expect(paragraphChild.getAttribute('aria-selected')).to.equal('true');

    el._select(0);
    await el.updateComplete;

    // Selecting a block no longer collapses anything — the run stays expanded and its
    // children stay rendered, just no longer marked selected.
    expect(el.shadowRoot.querySelector('.content-item').getAttribute('aria-expanded')).to.equal('true');
    expect(paragraphChild.classList.contains('selected')).to.be.false;
    expect(el.shadowRoot.querySelectorAll('.content-child')).to.have.lengthOf(5);
  });

  it('highlights a content child when the doc selection (not just an outline click) lands on it, and leaves it expanded on a later block selection', async () => {
    canvasBus.editorSelectState.emit({ blockIndex: -1, proseIndex: 5, source: 'doc' });
    await el.updateComplete;

    // A collapsed run expands additively to reveal a new selection, with no manual click needed.
    expect(el.shadowRoot.querySelector('.content-item').getAttribute('aria-expanded')).to.equal('true');
    const paragraphChild = [...el.shadowRoot.querySelectorAll('.content-child')][1];
    expect(paragraphChild.classList.contains('selected')).to.be.true;

    canvasBus.editorSelectState.emit({ blockIndex: 0, proseIndex: undefined, source: 'doc' });
    await el.updateComplete;

    expect(el.shadowRoot.querySelector('.content-item').getAttribute('aria-expanded')).to.equal('true');
    expect(paragraphChild.classList.contains('selected')).to.be.false;
    expect(el.shadowRoot.querySelectorAll('.content-child')).to.have.lengthOf(5);
  });

  it('expands a run when the selection lands between two of its children, not on one exactly', async () => {
    // Simulates pressing Enter mid-paragraph: the new empty node has no row of its own
    // (filtered out of parseSections), but its proseIndex (7) falls between the
    // surrounding real children (5 and 9), so it should still resolve to their run.
    canvasBus.editorSelectState.emit({ blockIndex: -1, proseIndex: 7, source: 'doc' });
    await el.updateComplete;

    expect(el.shadowRoot.querySelector('.content-item').getAttribute('aria-expanded')).to.equal('true');
  });

  it('does not let an unmatched proseIndex leak expansion into a neighboring run', async () => {
    el._sections = [
      {
        sectionIndex: 0,
        blocks: [],
        items: [contentGroupItem(1, [
          { type: 'content', kind: 'paragraph', proseIndex: 1, innerText: 'One', snippet: 'One' },
        ])],
      },
      {
        sectionIndex: 1,
        blocks: [],
        items: [contentGroupItem(20, [
          { type: 'content', kind: 'paragraph', proseIndex: 20, innerText: 'Two', snippet: 'Two' },
        ])],
      },
    ];
    await el.updateComplete;

    // Group headers only — `.content-item` also matches rendered content-child rows.
    const headers = () => el.shadowRoot.querySelectorAll('.content-group > .content-item');

    // proseIndex 10 sits after section 0's only child (1) but well before section 1's
    // (20) — with no next item in section 0 to bound it, it's attributed to section 0's
    // run (the trailing/unbounded case a fresh Enter-created node at the end lands in).
    canvasBus.editorSelectState.emit({ blockIndex: -1, proseIndex: 10, source: 'doc' });
    await el.updateComplete;

    expect(headers()[0].getAttribute('aria-expanded')).to.equal('true');
    expect(headers()[1].getAttribute('aria-expanded')).to.equal('false');

    // proseIndex 25, past section 1's only child with nothing after it, resolves there.
    canvasBus.editorSelectState.emit({ blockIndex: -1, proseIndex: 25, source: 'doc' });
    await el.updateComplete;

    expect(headers()[1].getAttribute('aria-expanded')).to.equal('true');
  });

  it('resets expansion only when a structural edit actually changes the sections', async () => {
    // Drives _sections through the real canvasBus.editorHtmlState/parseSections pipeline (rather
    // than the manual fixture in beforeEach) so re-emitting identical HTML is guaranteed
    // to parse to a sectionsEqual result.
    const initialHtml = `<main><div>
      <h2 data-prose-index="1">Title</h2>
      <p data-prose-index="5">Para one</p>
    </div></main>`;
    canvasBus.editorHtmlState.emit(initialHtml);
    await el.updateComplete;

    el.shadowRoot.querySelector('.content-item').click();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.content-item').getAttribute('aria-expanded')).to.equal('true');

    canvasBus.editorHtmlState.emit(initialHtml);
    await el.updateComplete;

    // Same HTML reparses to an equal section tree — sectionsEqual holds, expansion survives.
    expect(el.shadowRoot.querySelector('.content-item').getAttribute('aria-expanded')).to.equal('true');

    const changedHtml = `<main><div>
      <h2 data-prose-index="1">Title</h2>
    </div></main>`;
    canvasBus.editorHtmlState.emit(changedHtml);
    await el.updateComplete;

    // Structural change (a child removed) — sectionsEqual fails, expansion resets.
    expect(el.shadowRoot.querySelector('.content-item').getAttribute('aria-expanded')).to.equal('false');
  });

  it('expands and collapses the focused group header with ArrowRight/ArrowLeft', async () => {
    const header = el.shadowRoot.querySelector('.content-item');
    header.focus();

    header.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await el.updateComplete;
    expect(header.getAttribute('aria-expanded')).to.equal('true');
    expect(el.shadowRoot.querySelector('.content-children')).to.exist;

    header.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await el.updateComplete;
    expect(header.getAttribute('aria-expanded')).to.equal('false');
    expect(el.shadowRoot.querySelector('.content-children')).to.be.null;
  });
});

describe('ew-page-outline — content drag & delete', () => {
  let el;
  let bridge;

  beforeEach(async () => {
    el = await createOutline();
    bridge = getExtensionsBridge();
  });

  afterEach(() => {
    el.remove();
    bridge.view = null;
  });

  it('deletes a content child via its delete button', async () => {
    bridge.view = makeRealView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Keep me' }] },
        { type: 'code_block', content: [{ type: 'text', text: 'const x = 1;' }] },
      ],
    });
    const child = childrenOf(bridge.view).find((c) => c.kind === 'code');

    el._sections = [{
      sectionIndex: 0,
      blocks: [],
      items: [contentGroupItem(child.proseIndex, [child])],
    }];
    await el.updateComplete;
    el.shadowRoot.querySelector('.content-item').click();
    await el.updateComplete;

    el.shadowRoot.querySelector('.content-child .delete-btn').click();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('nx-dialog.ew-po-delete')).to.exist;

    el._confirmDelete();

    expect(docSeq(bridge.view.state.doc)).to.deep.equal(['Keep me']);
  });

  it('cancels a pending delete without changing the doc', async () => {
    bridge.view = makeRealView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Keep me' }] },
        { type: 'code_block', content: [{ type: 'text', text: 'const x = 1;' }] },
      ],
    });
    const child = childrenOf(bridge.view).find((c) => c.kind === 'code');

    el._sections = [{
      sectionIndex: 0,
      blocks: [],
      items: [contentGroupItem(child.proseIndex, [child])],
    }];
    await el.updateComplete;
    el.shadowRoot.querySelector('.content-item').click();
    await el.updateComplete;

    el.shadowRoot.querySelector('.content-child .delete-btn').click();
    await el.updateComplete;

    el._cancelDelete();
    await el.updateComplete;

    expect(el.shadowRoot.querySelector('nx-dialog.ew-po-delete')).to.not.exist;
    expect(docSeq(bridge.view.state.doc)).to.deep.equal(['Keep me', 'const x = 1;']);
  });

  it('keeps a run expanded after deleting one of its children', async () => {
    bridge.view = makeTrackedView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
      ],
    });

    canvasBus.editorHtmlState.emit(getInstrumentedHTML(bridge.view));
    await el.updateComplete;

    el.shadowRoot.querySelector('.content-item').click();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.content-item').getAttribute('aria-expanded')).to.equal('true');

    el.shadowRoot.querySelectorAll('.content-child .delete-btn')[0].click();
    await el.updateComplete;
    el._confirmDelete();
    await el.updateComplete;

    expect(docSeq(bridge.view.state.doc)).to.deep.equal(['B']);
    // No sibling-select workaround needed — the run survived the reparse-driven reset
    // because _onDelete re-expands it by array position (see _findRunLocation).
    expect(el.shadowRoot.querySelector('.content-item').getAttribute('aria-expanded')).to.equal('true');
  });

  it('reorders content children via drop onto another content child', () => {
    bridge.view = makeRealView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
      ],
    });
    const [childA, childB] = childrenOf(bridge.view);

    el._dragging = { type: 'content', index: childA };
    el._dropTarget = { contentChild: childB, dropPosition: 'after' };
    el._onDrop({ preventDefault() {}, stopPropagation() {} });

    expect(docSeq(bridge.view.state.doc)).to.deep.equal(['B', 'A']);
  });

  it('routes a content drop onto a section header through moveContentItem', () => {
    bridge.view = makeRealView({
      type: 'doc',
      content: [
        { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Move me' }] }] },
        { type: 'horizontal_rule' },
        { type: 'paragraph', content: [{ type: 'text', text: 'Existing' }] },
      ],
    });
    const child = childrenOf(bridge.view).find((c) => c.kind === 'quote');

    el._dragging = { type: 'content', index: child };
    el._dropTarget = { sectionIndex: 1, dropPosition: 'after' };
    el._onDrop({ preventDefault() {}, stopPropagation() {} });

    expect(docSeq(bridge.view.state.doc)).to.deep.equal(['hr', 'Move me', 'Existing']);
  });

  it('routes a block dropped onto a content child through moveBlockToContentItem', () => {
    bridge.view = makeRealView({
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'table_row',
              content: [{ type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hero' }] }] }],
            },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'Loose para' }] },
      ],
    });
    const child = childrenOf(bridge.view).find((c) => c.innerText === 'Loose para');

    el._dragging = { type: 'block', index: 0 };
    el._dropTarget = { contentChild: child, dropPosition: 'after' };
    el._onDrop({ preventDefault() {}, stopPropagation() {} });

    expect(docSeq(bridge.view.state.doc)).to.deep.equal(['Loose para', 'hero']);
  });

  it('routes a block dropped onto an empty section through moveBlockToSection', () => {
    const tableNode = (name) => ({
      type: 'table',
      content: [{
        type: 'table_row',
        content: [{ type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text: name }] }] }],
      }],
    });
    bridge.view = makeRealView({
      type: 'doc',
      content: [{ type: 'horizontal_rule' }, tableNode('hero')],
    });

    el._dragging = { type: 'block', index: 0 };
    el._dropTarget = { sectionIndex: 0, dropPosition: 'after' };
    el._onDrop({ preventDefault() {}, stopPropagation() {} });

    expect(docSeq(bridge.view.state.doc)).to.deep.equal(['hero', 'hr']);
  });

  it('accepts a block drag over a content child/group (sets a drop indicator, not just content drags)', () => {
    const child = { kind: 'paragraph', proseIndex: 1 };
    el._dragging = { type: 'block', index: 0 };

    const rect = { top: 0, height: 20 };
    const fakeEvent = (clientY) => ({
      preventDefault() {},
      stopPropagation() {},
      currentTarget: { getBoundingClientRect: () => rect, dataset: {} },
      clientY,
    });

    el._onContentDragOver(fakeEvent(15), child);
    expect(el._dropTarget).to.deep.equal({ contentChild: child, dropPosition: 'after' });
  });

  it('dropping on a group header before/after targets the first/last child', () => {
    const item = {
      proseIndex: 1,
      children: [
        { kind: 'paragraph', proseIndex: 1, innerText: 'first' },
        { kind: 'paragraph', proseIndex: 5, innerText: 'last' },
      ],
    };
    el._dragging = { type: 'content', index: { kind: 'paragraph', proseIndex: 99 } };

    const rect = { top: 0, height: 20 };
    const fakeEvent = (clientY) => ({
      preventDefault() {},
      stopPropagation() {},
      currentTarget: { getBoundingClientRect: () => rect, dataset: {} },
      clientY,
    });

    el._onContentGroupDragOver(fakeEvent(5), item);
    expect(el._dropTarget.contentChild).to.deep.equal(item.children[0]);
    expect(el._dropTarget.dropPosition).to.equal('before');

    el._onContentGroupDragOver(fakeEvent(15), item);
    expect(el._dropTarget.contentChild).to.deep.equal(item.children[1]);
    expect(el._dropTarget.dropPosition).to.equal('after');
  });

  it('dropping on the lower half of an expanded group header targets before the first child', () => {
    const item = {
      proseIndex: 1,
      children: [
        { kind: 'paragraph', proseIndex: 1, innerText: 'first' },
        { kind: 'paragraph', proseIndex: 5, innerText: 'last' },
      ],
    };
    el._expandedContent = new Set([item.proseIndex]);
    el._dragging = { type: 'content', index: { kind: 'paragraph', proseIndex: 99 } };

    const currentTarget = { getBoundingClientRect: () => ({ top: 0, height: 20 }), dataset: {} };
    el._onContentGroupDragOver({
      preventDefault() {},
      stopPropagation() {},
      currentTarget,
      clientY: 15,
    }, item);

    expect(el._dropTarget.contentChild).to.deep.equal(item.children[0]);
    expect(el._dropTarget.dropPosition).to.equal('before');
    expect(currentTarget.dataset.dropPosition).to.equal('after');
  });
});

describe('ew-page-outline - read-only', () => {
  let el;
  let bridge;

  const paragraph = (proseIndex, text) => ({ type: 'content', kind: 'paragraph', proseIndex, innerText: text, snippet: text });

  async function renderOutline({ editable }) {
    bridge.view = makeRealView({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Intro' }] }],
    });
    if (!editable) bridge.view.setProps({ editable: () => false });
    el._hasBlockLibrary = true;
    el._sections = [
      {
        sectionIndex: 0,
        blocks: [{ name: 'cards', blockIndex: 0 }],
        items: [
          { type: 'block', name: 'cards', blockIndex: 0 },
          contentGroupItem(10, [paragraph(10, 'Intro')]),
        ],
      },
      {
        sectionIndex: 1,
        blocks: [],
        items: [contentGroupItem(20, [paragraph(20, 'Second')])],
      },
    ];
    await el.updateComplete;
    el.shadowRoot.querySelector('.content-group > .content-item').click();
    await el.updateComplete;
  }

  const editControls = () => el.shadowRoot.querySelectorAll('nx-menu, .section-menu-trigger, .delete-btn');
  const draggables = () => el.shadowRoot.querySelectorAll('[draggable="true"]');
  const dragHandles = () => el.shadowRoot.querySelectorAll('use[href^="/img/icons/s2-icon-draghandle"]');

  beforeEach(async () => {
    el = await createOutline();
    bridge = getExtensionsBridge();
  });

  afterEach(() => {
    el.remove();
    bridge.view = null;
  });

  it('hides the section menu, delete and drag controls for a read-only view', async () => {
    await renderOutline({ editable: false });

    expect(el.shadowRoot.querySelectorAll('.outline-section')).to.have.lengthOf(2);
    expect(el.shadowRoot.querySelector('[data-block-index="0"]')).to.exist;
    expect(el.shadowRoot.querySelectorAll('.content-child')).to.have.lengthOf(1);
    expect(editControls()).to.have.lengthOf(0);
    expect(draggables()).to.have.lengthOf(0);
    expect(dragHandles()).to.have.lengthOf(0);
  });

  it('still selects a block from a read-only outline', async () => {
    await renderOutline({ editable: false });

    let received;
    const unsub = canvasBus.editorSelectState.subscribe((detail) => { received = detail; });
    el.shadowRoot.querySelector('[data-block-index="0"]').click();
    unsub();
    await el.updateComplete;

    expect(received).to.deep.equal({ blockIndex: 0, source: 'outline' });
    expect(el.shadowRoot.querySelector('[data-block-index="0"]').getAttribute('aria-selected')).to.equal('true');
  });

  it('keeps a same-size handle slot so read-only rows stay aligned', async () => {
    await renderOutline({ editable: false });

    const header = el.shadowRoot.querySelector('.section-header');
    const block = el.shadowRoot.querySelector('[data-block-index="0"]');
    expect(header.firstElementChild.classList.contains('drag-handle')).to.be.true;
    expect(block.firstElementChild.classList.contains('drag-handle')).to.be.true;
    expect(block.firstElementChild.childElementCount).to.equal(0);
  });

  it('shows the section menu, delete and drag controls for an editable view', async () => {
    await renderOutline({ editable: true });

    expect(el.shadowRoot.querySelectorAll('.section-menu-trigger')).to.have.lengthOf(2);
    expect(el.shadowRoot.querySelectorAll('.delete-btn')).to.have.lengthOf(2);
    expect(draggables()).to.have.lengthOf(4);
    expect(dragHandles()).to.have.lengthOf(4);
  });

  it('drops a pending delete when the outline switches to another document', async () => {
    await renderOutline({ editable: true });
    el.shadowRoot.querySelector('.outline-section nx-menu').choose('delete');
    await el.updateComplete;
    expect(el.shadowRoot.querySelectorAll('nx-dialog.ew-po-delete')).to.have.lengthOf(1);

    const reader = makeRealView({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Reader' }] }],
    });
    reader.setProps({ editable: () => false });
    bridge.view = reader;
    el._hashState = { org: 'org', site: 'site', path: 'reader-page' };
    await el.updateComplete;

    expect(el.shadowRoot.querySelectorAll('nx-dialog.ew-po-delete').length).to.equal(0);
    expect(el._pendingDelete ?? null).to.equal(null);
    expect(docSeq(reader.state.doc)).to.deep.equal(['Reader']);
  });

  it('drops a pending delete when the document unloads', async () => {
    await renderOutline({ editable: true });
    el.shadowRoot.querySelector('.outline-section nx-menu').choose('delete');
    await el.updateComplete;

    canvasBus.editorHtmlState.emit('');
    await el.updateComplete;

    expect(el.shadowRoot.querySelectorAll('nx-dialog.ew-po-delete').length).to.equal(0);
    expect(el._pendingDelete ?? null).to.equal(null);
  });

  async function dragSecondSectionOntoFirst({ editable }) {
    bridge.view = makeRealView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
        { type: 'horizontal_rule' },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
      ],
    });
    if (!editable) bridge.view.setProps({ editable: () => false });
    el._sections = parseSections(getInstrumentedHTML(bridge.view));
    await el.updateComplete;

    const [first, second] = el.shadowRoot.querySelectorAll('.outline-section');
    const dataTransfer = new DataTransfer();
    const fire = (target, type, clientY = 0) => {
      const init = { bubbles: true, composed: true, cancelable: true, dataTransfer, clientY };
      target.dispatchEvent(new DragEvent(type, init));
    };
    // A text selection drag starts on the label even when the header is not draggable.
    fire(second.querySelector('.section-label'), 'dragstart');
    fire(first, 'dragover', first.getBoundingClientRect().top);
    fire(first, 'drop');
    return docSeq(bridge.view.state.doc);
  }

  it('does not move a section dragged by its label in a read-only view', async () => {
    expect(await dragSecondSectionOntoFirst({ editable: false }))
      .to.deep.equal(['First', 'hr', 'Second']);
  });

  it('moves a section dragged by its label in an editable view', async () => {
    expect(await dragSecondSectionOntoFirst({ editable: true }))
      .to.deep.equal(['Second', 'hr', 'First']);
  });

  const twoSections = ([a, b], { editable }) => {
    const view = makeRealView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: a }] },
        { type: 'horizontal_rule' },
        { type: 'paragraph', content: [{ type: 'text', text: b }] },
      ],
    });
    if (!editable) view.setProps({ editable: () => false });
    return view;
  };

  async function dragAcrossDocumentSwitch(next) {
    bridge.view = twoSections(['Writer first', 'Writer second'], { editable: true });
    el._sections = parseSections(getInstrumentedHTML(bridge.view));
    await el.updateComplete;

    const dataTransfer = new DataTransfer();
    const fire = (target, type, clientY = 0) => {
      const init = { bubbles: true, composed: true, cancelable: true, dataTransfer, clientY };
      target.dispatchEvent(new DragEvent(type, init));
    };
    fire(el.shadowRoot.querySelectorAll('[data-section-header]')[1], 'dragstart');

    canvasBus.editorHtmlState.emit('');
    el._hashState = { org: 'org', site: 'site', path: 'next-page' };
    await el.updateComplete;
    bridge.view = next;
    el._sections = parseSections(getInstrumentedHTML(next));
    await el.updateComplete;

    const first = el.shadowRoot.querySelector('.outline-section');
    fire(first, 'dragover', first.getBoundingClientRect().top);
    fire(first, 'drop');
    return docSeq(next.state.doc);
  }

  it('does not apply a drag started in another document to a read-only document', async () => {
    const reader = twoSections(['Reader first', 'Reader second'], { editable: false });
    expect(await dragAcrossDocumentSwitch(reader))
      .to.deep.equal(['Reader first', 'hr', 'Reader second']);
  });

  it('does not apply a drag started in another document to the next writable document', async () => {
    const writer = twoSections(['Next first', 'Next second'], { editable: true });
    expect(await dragAcrossDocumentSwitch(writer))
      .to.deep.equal(['Next first', 'hr', 'Next second']);
  });
});

describe('ew-page-outline - section menu', () => {
  let el;
  let bridge;
  let view;

  const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
  const rule = (daSectionName = null) => ({ type: 'horizontal_rule', attrs: { daSectionName } });
  const table = (name) => ({
    type: 'table',
    content: [{
      type: 'table_row',
      content: [{ type: 'table_cell', content: [para(name)] }],
    }],
  });

  const root = () => el.shadowRoot;
  const sectionEls = () => [...root().querySelectorAll('.outline-section')];
  const menuOf = (i) => sectionEls()[i].querySelector('nx-menu');
  const triggerOf = (i) => root().querySelector(`.section-menu-trigger[data-section-index="${i}"]`);
  const active = () => root().activeElement;
  const focusTargets = () => [...root().querySelectorAll('.section-menu-trigger, [role="treeitem"]')];
  const names = () => parseSections(getInstrumentedHTML(view)).map((sec) => sec.name);

  async function settle() {
    canvasBus.editorHtmlState.emit(getInstrumentedHTML(view));
    await el.updateComplete;
    await el.updateComplete;
  }

  async function load(content, { blockLibrary = false } = {}) {
    view = makeTrackedView({ type: 'doc', content });
    bridge.view = view;
    el._hasBlockLibrary = blockLibrary;
    await settle();
  }

  const nextTask = () => new Promise((resolve) => { setTimeout(resolve); });

  function stubBlockLibrary() {
    const modal = {};
    el._loadBlockLibraryModal = async () => ({
      openBlockLibraryModal: ({ onInsert }) => {
        const dialog = document.createElement('dialog');
        document.body.append(dialog);
        dialog.showModal();
        const close = () => {
          dialog.close();
          dialog.remove();
        };
        modal.open = true;
        modal.insert = (html) => {
          const dom = document.createElement('div');
          dom.innerHTML = html;
          onInsert(dom);
          close();
        };
        modal.cancel = close;
      },
    });
    return modal;
  }

  beforeEach(async () => {
    el = await createOutline();
    bridge = getExtensionsBridge();
  });

  afterEach(() => {
    el.remove();
    bridge.view = null;
  });

  it('renders one labelled, tabbable trigger per section and no inline section buttons', async () => {
    await load([para('one'), rule('Feat'), para('two')]);

    const triggers = [...root().querySelectorAll('.section-menu-trigger')];
    expect(triggers.map((t) => t.getAttribute('aria-label')))
      .to.deep.equal(['More actions for Section 1', 'More actions for Feat']);
    expect(triggers.every((t) => t.tabIndex >= 0 && !t.hasAttribute('tabindex'))).to.be.true;
    expect(root().querySelectorAll('.section-header .delete-btn, .edit-btn, .add-block-btn')).to.have.lengthOf(0);
    const buttons = [...root().querySelectorAll('button')].filter((b) => !b.closest('nx-menu'));
    expect(buttons.some((b) => /add section/i.test(b.textContent))).to.be.false;
  });

  it('lists Add block only when the site has a block library', async () => {
    await load([para('one')]);
    expect(menuOf(0).items.filter((i) => i.id).map((i) => i.id))
      .to.deep.equal(['rename', 'add-section-after', 'delete']);

    el._hasBlockLibrary = true;
    await el.updateComplete;
    expect(menuOf(0).items.filter((i) => i.id).map((i) => i.id))
      .to.deep.equal(['rename', 'add-block', 'add-section-after', 'delete']);
  });

  it('leads the section header and block rows with the drag handle', async () => {
    await load([table('hero')]);

    const header = root().querySelector('.section-header');
    const block = root().querySelector('[data-block-index="0"]');
    expect(block).to.exist;
    [header, block].forEach((row) => {
      expect(row.firstElementChild.classList.contains('drag-handle')).to.be.true;
      expect(row.firstElementChild.querySelector('use').getAttribute('href'))
        .to.equal('/img/icons/s2-icon-draghandle-20-n.svg#icon');
    });
    expect(header.lastElementChild.tagName).to.equal('NX-MENU');
  });

  it('returns focus to the trigger on Escape but not on outside click', async () => {
    await load([table('hero'), para('one')]);

    menuOf(0).pressEscape();
    expect(active() === triggerOf(0)).to.be.true;

    const row = root().querySelector('[data-block-index="0"]');
    menuOf(0).clickOutside(row);
    expect(active() === row).to.be.true;
  });

  it('renames via the menu and returns focus to the trigger on Enter', async () => {
    await load([para('one'), rule('Feat'), para('two')]);

    menuOf(1).choose('rename');
    await el.updateComplete;
    const input = root().querySelector('.section-name-input');
    expect(active() === input).to.be.true;
    expect(sectionEls()[1].querySelector('nx-menu')).to.be.null;

    input.value = 'Features';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();

    expect(names()).to.deep.equal(['', 'Features']);
    expect(active() === triggerOf(1)).to.be.true;
  });

  it('returns focus to the trigger when a rename is cancelled with Escape', async () => {
    await load([para('one'), rule('Feat'), para('two')]);

    menuOf(1).choose('rename');
    await el.updateComplete;
    root().querySelector('.section-name-input')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await el.updateComplete;
    await el.updateComplete;

    expect(names()).to.deep.equal(['', 'Feat']);
    expect(active() === triggerOf(1)).to.be.true;
  });

  it('adds a section after and focuses its trigger', async () => {
    await load([para('one'), rule('Feat'), para('two')]);

    menuOf(0).choose('add-section-after');
    await settle();

    expect(docSeq(view.state.doc)).to.deep.equal(['one', 'hr', 'hr', 'two']);
    expect(names()).to.deep.equal(['', '', 'Feat']);
    expect(active() === triggerOf(1)).to.be.true;
  });

  it('inserts a block at the section start and focuses the new block row', async () => {
    await load([para('one'), rule('Feat'), para('two')], { blockLibrary: true });
    const modal = stubBlockLibrary();

    menuOf(1).choose('add-block');
    await nextTask();
    expect(modal.open).to.be.true;

    modal.insert('<table><tr><td><p>cards</p></td></tr></table>');
    await settle();

    expect(docSeq(view.state.doc)).to.deep.equal(['one', 'hr', 'cards', 'two']);
    const row = root().querySelector('[data-block-index="0"]');
    expect(row?.textContent.trim()).to.equal('cards');
    expect(active() === row).to.be.true;
  });

  it('returns focus to the trigger when the block library is cancelled', async () => {
    await load([para('one')], { blockLibrary: true });
    const modal = stubBlockLibrary();

    menuOf(0).choose('add-block');
    await nextTask();
    modal.cancel();
    await el.updateComplete;

    expect(docSeq(view.state.doc)).to.deep.equal(['one']);
    expect(active() === triggerOf(0)).to.be.true;
  });

  it('deletes a section via the menu and focuses the next trigger', async () => {
    await load([para('one'), rule('A'), para('two'), rule('B'), para('three')]);

    menuOf(1).choose('delete');
    await el.updateComplete;
    expect(root().querySelector('nx-dialog.ew-po-delete')).to.exist;
    el._confirmDelete();
    await settle();

    expect(docSeq(view.state.doc)).to.deep.equal(['one', 'hr', 'three']);
    expect(active() === triggerOf(1)).to.be.true;
  });

  it('focuses the last target after deleting the last section', async () => {
    await load([para('one'), rule('A'), para('two')]);

    menuOf(1).choose('delete');
    await el.updateComplete;
    el._confirmDelete();
    await settle();

    const targets = focusTargets();
    expect(docSeq(view.state.doc)).to.deep.equal(['one']);
    expect(active() === targets[targets.length - 1]).to.be.true;
  });

  it('returns focus to the opener when a delete is cancelled', async () => {
    await load([table('hero'), para('one')]);

    menuOf(0).choose('delete');
    await el.updateComplete;
    el._cancelDelete();
    await el.updateComplete;
    await el.updateComplete;
    expect(active() === triggerOf(0)).to.be.true;

    const button = root().querySelector('[data-block-index="0"] .delete-btn');
    button.click();
    await el.updateComplete;
    el._cancelDelete();
    await el.updateComplete;
    await el.updateComplete;
    expect(active() === button).to.be.true;
  });

  it('focuses the row now at the same position after an inline block delete', async () => {
    await load([table('hero'), table('cards'), para('one')]);

    const before = focusTargets();
    const index = before.indexOf(root().querySelector('[data-block-index="0"]'));
    root().querySelector('[data-block-index="0"] .delete-btn').click();
    await el.updateComplete;
    el._confirmDelete();
    await settle();

    const row = focusTargets()[index];
    expect(row.textContent.trim()).to.equal('cards');
    expect(active() === row).to.be.true;
  });

  it('does not leave focus pending when deleting the only empty section', async () => {
    await load([{ type: 'paragraph' }]);

    menuOf(0).choose('delete');
    await el.updateComplete;
    el._confirmDelete();
    await settle();
    expect(el._pendingFocus ?? null).to.equal(null);

    const elsewhere = document.createElement('button');
    document.body.append(elsewhere);
    elsewhere.focus();
    view.dispatch(view.state.tr.insertText('typed', 1));
    await settle();
    expect(document.activeElement === elsewhere).to.be.true;
    elsewhere.remove();
  });

  it('drops pending focus when an action leaves the doc unchanged', async () => {
    await load([para('one')]);

    el._runWithFocus(view, () => triggerOf(0), () => {});
    expect(el._pendingFocus ?? null).to.equal(null);
  });
});
