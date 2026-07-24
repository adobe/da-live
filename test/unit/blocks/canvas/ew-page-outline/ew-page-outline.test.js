/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { makeRealView } from '../test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let editorProseSelectChange;
let getExtensionsBridge;
let getInstrumentedHTML;
let parseSections;

before(async () => {
  await import('../../../../../blocks/canvas/ew-page-outline/ew-page-outline.js');
  ({ editorProseSelectChange, getInstrumentedHTML, parseSections } = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js'));
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
          { type: 'content', kind: 'heading', level: 2, proseIndex: 1, innerText: 'Title' },
          { type: 'content', kind: 'paragraph', proseIndex: 5, innerText: 'Para one' },
          { type: 'content', kind: 'image', proseIndex: 9, innerText: '' },
          { type: 'content', kind: 'list', ordered: true, proseIndex: 12, innerText: 'one two' },
          { type: 'content', kind: 'code', proseIndex: 15, innerText: 'const x = 1;' },
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
    expect(children.map((c) => c.textContent.trim())).to.deep.equal([
      'Heading 2', 'Paragraph', 'Image', 'Numbered list', 'Code block',
    ]);

    header.click();
    await el.updateComplete;
    expect(header.getAttribute('aria-expanded')).to.equal('false');
    expect(el.shadowRoot.querySelector('.content-children')).to.be.null;
  });

  it('emits editorProseSelectChange with the child\'s own proseIndex and kind on click', async () => {
    el.shadowRoot.querySelector('.content-item').click();
    await el.updateComplete;

    let received;
    const unsub = editorProseSelectChange.subscribe((detail) => { received = detail; });
    const paragraphChild = [...el.shadowRoot.querySelectorAll('.content-child')][1];
    paragraphChild.click();
    unsub();

    expect(received).to.deep.equal({ proseIndex: 5, kind: 'paragraph' });
  });

  it('emits the image kind for an image child, enabling layout-view NodeSelection', async () => {
    el.shadowRoot.querySelector('.content-item').click();
    await el.updateComplete;

    let received;
    const unsub = editorProseSelectChange.subscribe((detail) => { received = detail; });
    const imageChild = [...el.shadowRoot.querySelectorAll('.content-child')][2];
    imageChild.click();
    unsub();

    expect(received).to.deep.equal({ proseIndex: 9, kind: 'image' });
  });

  it('marks a clicked content child as selected, and clears it when a block is selected instead', async () => {
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

    expect(paragraphChild.classList.contains('selected')).to.be.false;
    expect(paragraphChild.getAttribute('aria-selected')).to.equal('false');
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

    expect(docSeq(bridge.view.state.doc)).to.deep.equal(['Keep me']);
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
