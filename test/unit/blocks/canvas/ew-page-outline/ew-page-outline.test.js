/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { makeView, posOf } from '../test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let editorProseSelectChange;
let getExtensionsBridge;

before(async () => {
  await import('../../../../../blocks/canvas/ew-page-outline/ew-page-outline.js');
  ({ editorProseSelectChange } = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js'));
  ({ getExtensionsBridge } = await import('../../../../../blocks/canvas/editor-utils/extensions-bridge.js'));
});

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
    bridge.view = makeView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Keep me' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Delete me' }] },
      ],
    });
    const deletePos = posOf(bridge.view.state.doc, (n) => n.textContent === 'Delete me');

    el._sections = [{
      sectionIndex: 0,
      blocks: [],
      items: [contentGroupItem(deletePos, [
        { type: 'content', kind: 'paragraph', proseIndex: deletePos, innerText: 'Delete me' },
      ])],
    }];
    await el.updateComplete;
    el.shadowRoot.querySelector('.content-item').click();
    await el.updateComplete;

    el.shadowRoot.querySelector('.content-child .delete-btn').click();

    expect(docSeq(bridge.view.state.doc)).to.deep.equal(['Keep me']);
  });

  it('reorders content children via drop onto another content child', () => {
    bridge.view = makeView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
      ],
    });
    const aPos = posOf(bridge.view.state.doc, (n) => n.textContent === 'A');
    const bPos = posOf(bridge.view.state.doc, (n) => n.textContent === 'B');
    const childA = { kind: 'paragraph', proseIndex: aPos };
    const childB = { kind: 'paragraph', proseIndex: bPos };

    el._dragging = { type: 'content', index: childA };
    el._dropTarget = { contentChild: childB, dropPosition: 'after' };
    el._onDrop({ preventDefault() {}, stopPropagation() {} });

    expect(docSeq(bridge.view.state.doc)).to.deep.equal(['B', 'A']);
  });

  it('routes a content drop onto a section header through moveContentItem', () => {
    bridge.view = makeView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Move me' }] },
        { type: 'horizontal_rule' },
        { type: 'paragraph', content: [{ type: 'text', text: 'Existing' }] },
      ],
    });
    const movePos = posOf(bridge.view.state.doc, (n) => n.textContent === 'Move me');

    el._dragging = { type: 'content', index: { kind: 'paragraph', proseIndex: movePos } };
    el._dropTarget = { sectionIndex: 1, dropPosition: 'after' };
    el._onDrop({ preventDefault() {}, stopPropagation() {} });

    expect(docSeq(bridge.view.state.doc)).to.deep.equal(['hr', 'Move me', 'Existing']);
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
