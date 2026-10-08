/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { EditorState, EditorView, columnResizing } from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import { setNx } from '../../../../../scripts/utils.js';
import { makeRealView } from '../test-helpers.js';
import { createTrackingPlugin } from '../../../../../blocks/canvas/editor-utils/prose-diff.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';
import { getDropTargets } from '../../../../../blocks/canvas/ew-page-outline/drop-targets.js';
import { axAll, axFocused, axTree, tabFrom } from '../../../helpers/ax-tree.js';

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

    const cell = (row) => row.querySelector('[role="gridcell"]');
    const header = cell(el.shadowRoot.querySelector('.section-header'));
    const block = cell(el.shadowRoot.querySelector('[data-block-index="0"]'));
    expect(header.firstElementChild.classList.contains('drag-handle')).to.be.true;
    expect(block.firstElementChild.classList.contains('drag-handle')).to.be.true;
    expect(block.firstElementChild.tagName).to.equal('SPAN');
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
  const focusTargets = () => [...root().querySelectorAll('[role="row"]')];
  const sectionRow = (i) => sectionEls()[i].querySelector('.section-header');
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

    const header = root().querySelector('.section-header [role="gridcell"]');
    const block = root().querySelector('[data-block-index="0"] [role="gridcell"]');
    expect(block).to.exist;
    [header, block].forEach((cell) => {
      expect(cell.firstElementChild.classList.contains('drag-handle')).to.be.true;
      expect(cell.firstElementChild.querySelector('use').getAttribute('href'))
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

  it('deletes a section via the menu and focuses the next section row', async () => {
    await load([para('one'), rule('A'), para('two'), rule('B'), para('three')]);

    menuOf(1).choose('delete');
    await el.updateComplete;
    expect(root().querySelector('nx-dialog.ew-po-delete')).to.exist;
    el._confirmDelete();
    await settle();

    expect(docSeq(view.state.doc)).to.deep.equal(['one', 'hr', 'three']);
    expect(active() === sectionRow(1)).to.be.true;
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

describe('ew-page-outline - treegrid', () => {
  let el;
  let bridge;
  let view;

  const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
  const rule = () => ({ type: 'horizontal_rule' });
  const table = (name) => ({
    type: 'table',
    content: [{
      type: 'table_row',
      content: [{ type: 'table_cell', content: [para(name)] }],
    }],
  });

  const root = () => el.shadowRoot;
  const active = () => root().activeElement;
  const sectionRow = (i) => root().querySelectorAll('.outline-section')[i].querySelector('.section-header');
  const blockRow = (i) => root().querySelector(`[data-block-index="${i}"]`);
  const handleOf = (row) => row.querySelector('.drag-handle');
  const announced = () => root().querySelector('[aria-live]').textContent.trim();
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const grid = () => axTree('ew-page-outline >>> [role="treegrid"]');
  const handleNode = async (name) => axAll(await grid(), 'button').find((b) => b.name === name);

  const press = (key, target = active()) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  };

  const fireDrag = (target, type, clientY = 0) => {
    const dataTransfer = new DataTransfer();
    const init = { bubbles: true, composed: true, cancelable: true, dataTransfer, clientY };
    target.dispatchEvent(new DragEvent(type, init));
  };

  async function settle() {
    canvasBus.editorHtmlState.emit(getInstrumentedHTML(view));
    await el.updateComplete;
    await el.updateComplete;
  }

  async function load(content) {
    view = makeTrackedView({ type: 'doc', content });
    bridge.view = view;
    await settle();
  }

  async function expandAll() {
    el._expandedContent = new Set(el._sections.flatMap((sec) => sec.items
      .filter((item) => item.type === 'content').map((item) => item.proseIndex)));
    await el.updateComplete;
  }

  beforeEach(async () => {
    el = await createOutline();
    bridge = getExtensionsBridge();
  });

  afterEach(() => {
    el.remove();
    bridge.view = null;
  });

  it('exposes a treegrid with levelled, named rows and one gridcell each', async () => {
    await load([table('hero'), para('one'), rule(), para('two')]);
    await expandAll();

    const tree = await grid();
    expect(tree).to.include({ role: 'treegrid', name: 'Page outline' });
    const axRows = axAll(tree, 'row');
    expect(axRows.map(({ name, level, expanded }) => ({ name, level, expanded }))).to.deep.equal([
      { name: 'Section 1', level: 1, expanded: undefined },
      { name: 'hero block', level: 2, expanded: undefined },
      { name: 'Default content', level: 2, expanded: true },
      { name: 'Paragraph one', level: 3, expanded: undefined },
      { name: 'Section 2', level: 1, expanded: undefined },
      { name: 'Default content', level: 2, expanded: true },
      { name: 'Paragraph two', level: 3, expanded: undefined },
    ]);
    expect(axRows.every((r) => r.children.length === 1 && r.children[0].role === 'gridcell')).to.be.true;
  });

  it('is a single tab stop that starts on the first row', async () => {
    await load([table('hero'), para('one')]);
    const before = document.createElement('button');
    el.before(before);

    await tabFrom(before);
    expect(axFocused(await grid())).to.include({ role: 'row', name: 'Section 1' });
    await sendKeys({ press: 'Tab' });
    expect(axFocused(await grid())).to.equal(undefined);
    before.remove();
  });

  it('navigates rows and controls from the keyboard', async () => {
    await load([table('hero'), para('one')]);

    sectionRow(0).focus();
    press('ArrowDown');
    expect(active() === blockRow(0)).to.be.true;
    press('ArrowRight');
    expect(active() === handleOf(blockRow(0))).to.be.true;
    press('ArrowRight');
    expect(active().classList.contains('delete-btn')).to.be.true;
    press('ArrowUp');
    expect(active().classList.contains('section-menu-trigger')).to.be.true;
    press('Escape');
    expect(active() === sectionRow(0)).to.be.true;
  });

  it('selects a block with Enter and does nothing on a section row', async () => {
    await load([table('hero')]);

    let received;
    const unsub = canvasBus.editorSelectState.subscribe((detail) => { received = detail; });
    sectionRow(0).focus();
    press('Enter');
    expect(received).to.equal(undefined);
    blockRow(0).focus();
    press('Enter');
    unsub();
    expect(received).to.include({ blockIndex: 0, source: 'outline' });
  });

  it('opens the row menu on contextmenu and leaves menu-less rows alone', async () => {
    await load([table('hero')]);

    const onSection = new MouseEvent('contextmenu', { bubbles: true, composed: true, cancelable: true });
    sectionRow(0).dispatchEvent(onSection);
    expect(onSection.defaultPrevented).to.be.true;
    expect(sectionRow(0).querySelector('nx-menu').open).to.be.true;

    const onBlock = new MouseEvent('contextmenu', { bubbles: true, composed: true, cancelable: true });
    blockRow(0).dispatchEvent(onBlock);
    expect(onBlock.defaultPrevented).to.be.false;
  });

  it('labels drag handles as buttons in the row', async () => {
    await load([table('hero'), para('one')]);
    await expandAll();

    const axRows = axAll(await grid(), 'row');
    expect(axRows.map((r) => axAll(r, 'button')[0]?.name)).to.deep.equal([
      'Move Section 1', 'Move hero block', undefined, 'Move paragraph (one)',
    ]);
    expect(handleOf(blockRow(0)).getAttribute('draggable')).to.equal(null);
  });

  it('moves a block with keyboard pick-up and focuses it after the drop', async () => {
    await load([table('hero'), table('cards'), para('one')]);

    const handle = handleOf(blockRow(0));
    handle.focus();
    handle.click();
    await el.updateComplete;
    expect(await handleNode('Move hero block')).to.include({ pressed: true });
    expect(announced()).to.match(/^Picked up hero block/);

    press('ArrowDown', handle);
    await el.updateComplete;
    expect(announced()).to.equal('Before Default content in Section 1');
    expect(root().querySelector('[data-group-key]').dataset.dropPosition).to.equal('before');

    handle.click();
    await settle();

    expect(docSeq(view.state.doc)).to.deep.equal(['cards', 'hero', 'one']);
    expect(announced()).to.equal('Dropped hero block.');
    expect(blockRow(1).textContent.trim()).to.equal('hero');
    expect(active() === blockRow(1)).to.be.true;
  });

  it('cancels a pick-up with Escape and refocuses the handle', async () => {
    await load([table('hero'), table('cards')]);

    const handle = handleOf(blockRow(0));
    handle.focus();
    handle.click();
    press('ArrowDown', handle);
    press('Escape', handle);
    await el.updateComplete;

    expect(docSeq(view.state.doc)).to.deep.equal(['hero', 'cards']);
    expect(announced()).to.equal('Move cancelled.');
    expect(await handleNode('Move hero block')).to.include({ pressed: false });
    expect(root().querySelector('[data-drop-position]')).to.equal(null);
    expect(active() === handle).to.be.true;
  });

  it('cancels a pick-up on Tab, outside pointerdown and native drag start', async () => {
    await load([table('hero'), table('cards')]);
    const handle = () => handleOf(blockRow(0));

    handle().click();
    press('Tab', handle());
    expect(el._pickup).to.equal(null);

    handle().click();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    expect(el._pickup).to.equal(null);

    handle().click();
    fireDrag(blockRow(1), 'dragstart');
    expect(el._pickup).to.equal(null);
    expect(el._dragging.index).to.equal(1);
    fireDrag(blockRow(1), 'dragend');
  });

  it('moves a section with keyboard pick-up', async () => {
    await load([para('one'), rule(), para('two'), rule(), para('three')]);

    const handle = handleOf(sectionRow(2));
    handle.focus();
    handle.click();
    press('ArrowUp', handle);
    await el.updateComplete;
    expect(announced()).to.equal('Before Section 2');
    handle.click();
    await settle();

    expect(docSeq(view.state.doc)).to.deep.equal(['one', 'hr', 'three', 'hr', 'two']);
    expect(active() === sectionRow(1)).to.be.true;
  });

  it('moves a content child with keyboard pick-up and refocuses it', async () => {
    await load([para('A'), para('B')]);
    await expandAll();

    const handle = handleOf(root().querySelector('.content-child'));
    handle.focus();
    handle.click();
    press('ArrowDown', handle);
    handle.click();
    await settle();
    await el.updateComplete;

    expect(docSeq(view.state.doc)).to.deep.equal(['B', 'A']);
    const children = [...root().querySelectorAll('.content-child')];
    expect(children[1].textContent).to.contain('A');
    expect(active() === children[1]).to.be.true;
  });

  it('moves a block with pointer pick-up: click handle, hover, click to drop', async () => {
    await load([table('hero'), table('cards')]);

    const handle = handleOf(blockRow(0));
    handle.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 1 }));
    expect(el._pickup).to.exist;

    const target = blockRow(1);
    const rect = target.getBoundingClientRect();
    target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, composed: true, clientY: rect.bottom - 1 }));
    expect(target.dataset.dropPosition).to.equal('after');
    target.click();
    await settle();

    expect(docSeq(view.state.doc)).to.deep.equal(['cards', 'hero']);
    expect(el._pickup).to.equal(null);
  });

  it('cancels a pointer pick-up when the handle is clicked again', async () => {
    await load([table('hero'), table('cards')]);

    const handle = handleOf(blockRow(0));
    const click = () => handle.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 1 }));
    click();
    blockRow(1).dispatchEvent(new PointerEvent('pointermove', { bubbles: true, composed: true }));
    click();
    await el.updateComplete;

    expect(el._pickup).to.equal(null);
    expect(docSeq(view.state.doc)).to.deep.equal(['hero', 'cards']);
  });

  async function expectParity(dragging, source) {
    const { targets } = getDropTargets(dragging, el._sections, el._expandedContent);
    expect(targets.length).to.be.greaterThan(0);
    targets.forEach(({ target, description }) => {
      fireDrag(source(), 'dragstart');
      const indicator = el._dropIndicatorEl(dragging, target);
      const section = indicator.closest('.outline-section');
      const ys = [indicator, section].flatMap((node) => {
        const rect = node.getBoundingClientRect();
        return [rect.top + 1, rect.bottom - 1];
      });
      const matched = ys.some((y) => {
        fireDrag(indicator, 'dragover', y);
        return same(el._dropTarget, target);
      });
      fireDrag(source(), 'dragend');
      expect(matched, `${dragging.type} -> ${description}`).to.be.true;
    });
  }

  it('finds the content run for a child after an empty section', async () => {
    await load([para('one'), rule(), rule(), table('cards'), para('three')]);

    const group = el._sections[2].items[1];
    expect(el._findRunKeyForProseIndex(group.children[0].proseIndex)).to.equal(group.proseIndex);
  });

  it('offers only keyboard targets a mouse drag can also produce', async () => {
    await load([
      table('hero'), para('one'), para('two'), rule(), rule(), table('cards'), para('three'),
    ]);

    await expectParity({ type: 'section', index: 0 }, () => sectionRow(0));
    await expectParity({ type: 'section', index: 2 }, () => sectionRow(2));
    await expectParity({ type: 'block', index: 0 }, () => blockRow(0));
    await expectParity({ type: 'block', index: 1 }, () => blockRow(1));

    await expandAll();
    await expectParity({ type: 'block', index: 1 }, () => blockRow(1));
    const [child] = el._sections[0].items[1].children;
    await expectParity(
      { type: 'content', index: child },
      () => root().querySelector(`[data-child-prose="${child.proseIndex}"]`),
    );
  });
});
