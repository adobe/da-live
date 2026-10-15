import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { NodeSelection, TextSelection } from 'da-y-wrapper';
import { getNx, setNx } from '../../../../../scripts/utils.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';
import { appendBlockRow } from '../../../../../blocks/canvas/editor-utils/blocks.js';
import { setDaConfigs } from '../../../../fixtures/nx/utils/daConfig.js';
import { makeView } from '../test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const THUMBNAIL_SRC = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

let getExtensionsBridge;
let resetBlockLibraryCache;
let resetBlockOptionsCache;
let hashChange;

before(async () => {
  await import('../../../../../blocks/canvas/ew-block-properties/ew-block-properties.js');
  await import('../../../../../blocks/canvas/ew-editor-doc/ew-editor-doc.js');
  ({ getExtensionsBridge } = await import('../../../../../blocks/canvas/editor-utils/extensions-bridge.js'));
  ({ resetBlockLibraryCache, resetBlockOptionsCache } = await import('../../../../../blocks/canvas/ew-panel-extensions/helpers.js'));
  ({ hashChange } = await import(`${getNx()}/utils/utils.js`));
});

function table(name, items) {
  const cell = (text, attrs = {}) => ({
    type: 'table_cell',
    attrs,
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
  return {
    type: 'table',
    content: [
      { type: 'table_row', content: [cell(name, { colspan: 2 })] },
      ...items.map((text) => ({ type: 'table_row', content: [cell(text), cell(`${text} details`)] })),
    ],
  };
}

describe('multi-item block properties', () => {
  let el;
  let view;
  let tablePos;

  beforeEach(async () => {
    resetBlockLibraryCache();
    resetBlockOptionsCache();
    setDaConfigs([{ library: { data: [{ title: 'Blocks', path: 'http://localhost:2000/multi-blocks.json' }] } }]);
    const originalFetch = window.fetch;
    sinon.stub(window, 'fetch').callsFake(async (url, ...args) => {
      if (String(url).endsWith('multi-blocks.json')) {
        return new Response(JSON.stringify({
          data: [{ name: 'Hero', path: 'http://localhost:2000/multi-hero.html' }],
          editor: { data: [{ block: 'hero', property: 'multi' }] },
        }), { headers: { 'Content-Type': 'application/json' } });
      }
      if (String(url).endsWith('multi-hero.html')) {
        return new Response(`<body><div><h2>Hero</h2><div class="hero">
          <div><div>Template item</div><div>Template details</div></div>
        </div></div></body>`, { headers: { 'Content-Type': 'text/html' } });
      }
      return originalFetch.call(window, url, ...args);
    });
    hashChange._set({ org: 'multi-org', site: 'multi-site' });
    view = makeView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
        table('Hero (dark, wide)', ['First', 'Second', 'Third']),
        table('Cards', ['Other']),
      ],
    });
    view.focus = sinon.spy();
    tablePos = view.state.doc.firstChild.nodeSize;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, tablePos)));
    getExtensionsBridge().view = view;
    canvasBus.editorHtmlState.emit('<div>Document</div>');
    el = document.createElement('ew-block-properties');
    document.body.append(el);
    await el._loadMultiBlock();
    await el.updateComplete;
  });

  afterEach(() => {
    el.remove();
    getExtensionsBridge().view = null;
    setDaConfigs([]);
    hashChange._set({});
    resetBlockLibraryCache();
    resetBlockOptionsCache();
    sinon.restore();
  });

  function itemRows() {
    return [...el.shadowRoot.querySelectorAll('.ew-block-item')];
  }

  function rowNames() {
    const block = view.state.doc.nodeAt(tablePos);
    return Array.from(
      { length: block.childCount - 1 },
      (_, i) => block.child(i + 1).firstChild.textContent,
    );
  }

  function dropZones() {
    return [...el.shadowRoot.querySelectorAll('.ew-block-drop-zone')];
  }

  function text(value, marks = []) {
    return { type: 'text', text: value, marks };
  }

  function paragraph(...content) {
    return { type: 'paragraph', content };
  }

  function image(alt = 'Preview image') {
    return { type: 'image', attrs: { src: THUMBNAIL_SRC, alt } };
  }

  async function setPreviewContent(cells) {
    const tableNode = view.state.doc.nodeAt(tablePos);
    const from = tablePos + 1 + tableNode.firstChild.nodeSize;
    const row = view.state.schema.nodeFromJSON({
      type: 'table_row',
      content: cells.map((content) => ({ type: 'table_cell', content })),
    });
    const tr = view.state.tr.replaceWith(from, from + tableNode.child(1).nodeSize, row);
    view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, tablePos)));
    canvasBus.editorDocState.emit();
    await el.updateComplete;
  }

  async function dragItem(from, boundary) {
    const dataTransfer = new DataTransfer();
    itemRows()[from].dispatchEvent(new DragEvent('dragstart', { dataTransfer, bubbles: true, cancelable: true }));
    await el.updateComplete;
    expect(dataTransfer.getData('text/plain')).to.equal('');
    expect(dataTransfer.getData('application/x-da-block-item')).to.equal(String(from));
    const target = dropZones()[boundary];
    target.dispatchEvent(new DragEvent('dragover', { dataTransfer, bubbles: true, cancelable: true }));
    await el.updateComplete;
    expect(target.hasAttribute('data-drop-active')).to.be.true;
    target.dispatchEvent(new DragEvent('drop', { dataTransfer, bubbles: true, cancelable: true }));
    await el.updateComplete;
  }

  it('shows content previews for each body row, excluding the header', () => {
    expect(itemRows().map((row) => row.querySelector('.ew-block-item-text').textContent))
      .to.deep.equal(['First', 'Second', 'Third']);
    expect(itemRows().every((row) => row.draggable)).to.be.true;
    expect(el.shadowRoot.querySelector('[aria-label="Add item"]').disabled).to.be.false;
  });

  function itemProseIndex(index) {
    let pos = tablePos + 1;
    const block = view.state.doc.nodeAt(tablePos);
    for (let row = 0; row <= index; row += 1) pos += block.child(row).nodeSize;
    return pos + 3;
  }

  it('navigates to the clicked item using the existing document and iframe scroll path', () => {
    const editor = document.createElement('ew-editor-doc');
    const postMessage = sinon.spy();
    editor._proseContext = { view };
    editor._controllerCtx = { port: { postMessage } };
    const unsubscribe = canvasBus.editorProseSelectState.subscribe(({ proseIndex, kind }) => {
      editor._scrollDocToProseIndex(proseIndex, kind);
    });
    const dispatch = sinon.spy(view, 'dispatch');
    const { doc } = view.state;
    try {
      for (let index = 0; index < 3; index += 1) {
        const proseIndex = itemProseIndex(index);
        itemRows()[index].querySelector('.ew-block-item-preview').click();
        expect(view.state.selection.from).to.equal(proseIndex - 1);
        expect(view.state.selection.node.textContent).to.equal(['First', 'Second', 'Third'][index]);
        expect(dispatch.lastCall.args[0].scrolledIntoView).to.be.true;
        expect(postMessage.lastCall.args[0]).to.include({ scrollIntoView: true });
        expect(postMessage.lastCall.args[0].node).to.deep.equal({ anchorType: 'content', proseIndex });
        expect(view.state.doc).to.equal(doc);
      }
    } finally {
      unsubscribe();
    }
  });

  it('supports scrolling with Enter and Space on the item itself', () => {
    const emit = sinon.spy(canvasBus.editorProseSelectState, 'emit');
    for (const key of ['Enter', ' ']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      itemRows()[1].dispatchEvent(event);
      expect(event.defaultPrevented).to.be.true;
      expect(emit.lastCall.args[0]).to.deep.equal({ proseIndex: itemProseIndex(1), kind: 'paragraph' });
    }
    expect(emit.callCount).to.equal(2);
  });

  it('scrolls image-first items using the image anchor', async () => {
    await setPreviewContent([[paragraph(image())], [paragraph(text('Image details'))]]);
    const emit = sinon.spy(canvasBus.editorProseSelectState, 'emit');
    itemRows()[0].querySelector('img').click();
    const target = { proseIndex: itemProseIndex(0), kind: 'image' };
    expect(emit.calledOnceWithExactly(target)).to.be.true;
    const editor = document.createElement('ew-editor-doc');
    const postMessage = sinon.spy();
    editor._proseContext = { view };
    editor._controllerCtx = { port: { postMessage } };
    editor._scrollDocToProseIndex(target.proseIndex, target.kind);
    expect(view.state.selection.node.type.name).to.equal('image');
    expect(postMessage.lastCall.args[0].node)
      .to.deep.equal({ anchorType: 'image', proseIndex: target.proseIndex, src: THUMBNAIL_SRC });
    expect(postMessage.lastCall.args[0].scrollIntoView).to.be.true;
  });

  it('does not navigate when deleting an item or activating its delete button with the keyboard', async () => {
    const emit = sinon.spy(canvasBus.editorProseSelectState, 'emit');
    const button = itemRows()[1].querySelector('button');
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    button.querySelector('svg').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await el.updateComplete;
    expect(rowNames()).to.deep.equal(['First', 'Third']);
    expect(emit.called).to.be.false;
  });

  it('allows scrolling in read-only documents without enabling item mutations', async () => {
    view.editable = false;
    canvasBus.editorDocState.emit();
    await el.updateComplete;
    const emit = sinon.spy(canvasBus.editorProseSelectState, 'emit');
    itemRows()[1].click();
    expect(emit.calledOnceWithExactly({ proseIndex: itemProseIndex(1), kind: 'paragraph' })).to.be.true;
    expect(itemRows()[1].draggable).to.be.false;
    expect(itemRows()[1].querySelector('button').disabled).to.be.true;
  });

  it('does not navigate during a drag or after the selected block changes', () => {
    const emit = sinon.spy(canvasBus.editorProseSelectState, 'emit');
    itemRows()[0].dispatchEvent(new DragEvent('dragstart', { dataTransfer: new DataTransfer() }));
    itemRows()[1].click();
    expect(emit.called).to.be.false;
    itemRows()[0].dispatchEvent(new DragEvent('dragend'));
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
    itemRows()[1].click();
    expect(emit.called).to.be.false;
  });

  it('uses current item positions after reorder, including empty items', async () => {
    await setPreviewContent([[paragraph()], [paragraph()]]);
    await dragItem(0, 3);
    const emit = sinon.spy(canvasBus.editorProseSelectState, 'emit');
    itemRows()[2].querySelector('.ew-block-item-label').click();
    expect(emit.calledOnceWithExactly({ proseIndex: itemProseIndex(2), kind: 'paragraph' })).to.be.true;
  });

  it('shows and edits items while the cursor is inside the block', async () => {
    const selectContent = async () => {
      const pos = tablePos + view.state.doc.nodeAt(tablePos).firstChild.nodeSize + 4;
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
      canvasBus.toolbarSelectionState.emit({ surface: 'doc', showable: true });
      await el.updateComplete;
    };
    await selectContent();
    expect(itemRows()).to.have.lengthOf(3);
    expect(view.state.selection).to.be.instanceOf(TextSelection);
    el.shadowRoot.querySelector('[aria-label="Add item"]').click();
    await el.updateComplete;
    expect(rowNames()).to.deep.equal(['First', 'Second', 'Third', 'Template item']);

    await selectContent();
    el.shadowRoot.querySelector('[aria-label="Delete item 1"]').click();
    await el.updateComplete;
    expect(rowNames()).to.deep.equal(['Second', 'Third', 'Template item']);

    await selectContent();
    await dragItem(2, 0);
    expect(rowNames()).to.deep.equal(['Template item', 'Second', 'Third']);
  });

  it('shows images and plain text in order across all cells', async () => {
    await setPreviewContent([
      [paragraph(text('Before'), image('First image'), text('After'))],
      [paragraph(image('Second image')), paragraph(text('Second cell'))],
    ]);
    const preview = itemRows()[0].querySelector('.ew-block-item-preview');
    expect([...preview.children].map((child) => child.tagName))
      .to.deep.equal(['SPAN', 'SPAN', 'IMG', 'SPAN', 'SPAN', 'SPAN', 'IMG', 'SPAN', 'SPAN']);
    const separators = [...preview.querySelectorAll('.ew-block-item-separator')];
    expect(separators).to.have.lengthOf(4);
    expect(separators.every((separator) => separator.getAttribute('aria-hidden') === 'true')).to.be.true;
    expect(preview.firstElementChild.className).to.equal('ew-block-item-text');
    expect(preview.lastElementChild.className).to.equal('ew-block-item-text');
    expect([...preview.querySelectorAll('.ew-block-item-text')].map((span) => span.textContent))
      .to.deep.equal(['Before', 'After', 'Second cell']);
    const images = [...preview.querySelectorAll('img')];
    expect(images.map((img) => img.getAttribute('src'))).to.deep.equal([THUMBNAIL_SRC, THUMBNAIL_SRC]);
    expect(images.map((img) => img.alt)).to.deep.equal(['First image', 'Second image']);
    expect(images.every((img) => !img.draggable)).to.be.true;
  });

  it('separates adjacent text snippets and images without separating empty content', async () => {
    await setPreviewContent([
      [paragraph(text('First')), paragraph(), paragraph(text('Second'))],
      [paragraph(image(), image())],
    ]);
    const preview = itemRows()[0].querySelector('.ew-block-item-preview');
    expect([...preview.children].map((child) => child.className)).to.deep.equal([
      'ew-block-item-text', 'ew-block-item-separator',
      'ew-block-item-text', 'ew-block-item-separator',
      'ew-block-item-thumbnail', 'ew-block-item-separator', 'ew-block-item-thumbnail',
    ]);

    await setPreviewContent([[paragraph(text('Only content'))], [paragraph(text('   '))]]);
    expect(itemRows()[0].querySelector('.ew-block-item-separator')).to.be.null;
  });

  it('limits each paragraph to 30 characters without splitting it at formatting marks', async () => {
    await setPreviewContent([
      [paragraph(text('A'.repeat(20), [{ type: 'strong' }]), text('B'.repeat(20)))],
      [paragraph(text('123456789012345678901234567890EXTRA'))],
    ]);
    const preview = itemRows()[0].querySelector('.ew-block-item-preview');
    const snippets = [...preview.querySelectorAll('.ew-block-item-text')].map((span) => span.textContent);
    expect(snippets).to.deep.equal([
      `${'A'.repeat(20)}${'B'.repeat(10)}`,
      '123456789012345678901234567890',
    ]);
    expect(snippets.every((snippet) => Array.from(snippet).length === 30)).to.be.true;
    expect(preview.querySelector('strong')).to.be.null;
  });

  it('does not split Unicode characters at the 30-character limit', async () => {
    await setPreviewContent([
      [paragraph(text('\u{1F642}'.repeat(35)))],
      [paragraph()],
    ]);
    const snippet = itemRows()[0].querySelector('.ew-block-item-text').textContent;
    expect(Array.from(snippet)).to.have.lengthOf(30);
    expect(snippet).to.equal('\u{1F642}'.repeat(30));
  });

  it('shows plain text rather than HTML and collapses line breaks into spaces', async () => {
    await setPreviewContent([
      [paragraph(text('<b>Plain</b>'), { type: 'hard_break' }, text('  text  '))],
      [paragraph()],
    ]);
    const preview = itemRows()[0].querySelector('.ew-block-item-preview');
    expect(preview.querySelector('.ew-block-item-text').textContent).to.equal('<b>Plain</b> text');
    expect(preview.querySelector('b')).to.be.null;
  });

  it('keeps a numbered label for an empty row', async () => {
    await setPreviewContent([
      [paragraph()],
      [paragraph(text('   '))],
    ]);
    const preview = itemRows()[0].querySelector('.ew-block-item-preview');
    expect(preview.querySelector('.ew-block-item-label').textContent).to.equal('item 1');
    expect(preview.querySelector('.ew-block-item-text')).to.be.null;
    expect(preview.querySelector('img')).to.be.null;
    expect(preview.querySelector('.ew-block-item-separator')).to.be.null;

    await dragItem(0, 3);
    expect(itemRows()[2].querySelector('.ew-block-item-label').textContent).to.equal('item 3');
  });

  it('clips excess preview content while keeping the drag handle and delete button visible', async () => {
    await setPreviewContent([
      [paragraph(image(), text('W'.repeat(50)), image())],
      [paragraph(text('M'.repeat(50)))],
    ]);
    const response = await fetch('/blocks/canvas/ew-block-properties/ew-block-properties.css');
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(await response.text());
    el.shadowRoot.adoptedStyleSheets = [...el.shadowRoot.adoptedStyleSheets, sheet];
    el.style.display = 'block';
    el.style.width = '240px';
    el.style.fontFamily = 'Arial';
    el.style.setProperty('--s2-component-s-regular-font-size', '13px');
    el.style.setProperty('--s2-spacing-100', '8px');
    el.style.setProperty('--s2-spacing-200', '16px');
    const row = itemRows()[0];
    const preview = row.querySelector('.ew-block-item-preview');
    const thumbnail = preview.querySelector('img');
    const button = row.querySelector('button');
    expect(getComputedStyle(preview).overflowX).to.equal('hidden');
    expect(getComputedStyle(preview).whiteSpace).to.equal('nowrap');
    expect(getComputedStyle(preview).textOverflow).to.equal('clip');
    expect(preview.scrollWidth).to.be.greaterThan(preview.clientWidth);
    expect(row.scrollWidth).to.equal(row.clientWidth);
    expect(row.getBoundingClientRect().width).to.equal(240);
    expect(thumbnail.getBoundingClientRect().width).to.equal(24);
    expect(thumbnail.getBoundingClientRect().height).to.equal(24);
    expect(getComputedStyle(thumbnail).objectFit).to.equal('cover');
    const separator = preview.querySelector('.ew-block-item-separator');
    expect(separator.getBoundingClientRect().width).to.equal(3);
    expect(separator.getBoundingClientRect().height).to.equal(3);
    expect(getComputedStyle(separator).flexShrink).to.equal('0');
    expect(getComputedStyle(button).flexShrink).to.equal('0');
    const gripStyle = getComputedStyle(row.querySelector('.ew-block-item-grip'));
    const previewRect = preview.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    expect(gripStyle.flexShrink).to.equal('0');
    expect(previewRect.right).to.be.at.most(buttonRect.left);
    expect(buttonRect.right).to.be.at.most(row.getBoundingClientRect().right);
  });

  it('adds the library template row with the plus button', async () => {
    const template = el._multiTemplateRow.outerHTML;
    el.shadowRoot.querySelector('[aria-label="Add item"]').click();
    await el.updateComplete;
    expect(rowNames()).to.deep.equal(['First', 'Second', 'Third', 'Template item']);
    expect(view.state.selection).to.be.instanceOf(NodeSelection);
    expect(view.state.selection.node.lastChild.child(1).textContent).to.equal('Template details');
    expect(view.state.selection.node.firstChild.textContent).to.equal('Hero (dark, wide)');
    expect(view.state.doc.child(2).firstChild.textContent).to.equal('Cards');
    expect(itemRows()).to.have.lengthOf(4);
    expect(el._multiTemplateRow.outerHTML).to.equal(template);
  });

  it('deletes only the chosen item and renumbers the remaining items', async () => {
    el.shadowRoot.querySelector('[aria-label="Delete item 2"]').click();
    await el.updateComplete;
    expect(rowNames()).to.deep.equal(['First', 'Third']);
    expect(itemRows().map((row) => row.querySelector('.ew-block-item-text').textContent))
      .to.deep.equal(['First', 'Third']);
    expect(itemRows().map((row) => row.getAttribute('aria-label')))
      .to.deep.equal(['Item 1', 'Item 2']);
    expect(view.state.selection.node.firstChild.textContent).to.equal('Hero (dark, wide)');
    expect(view.state.doc.child(2).child(1).firstChild.textContent).to.equal('Other');
  });

  it('can delete all items and add one again without deleting the block', async () => {
    for (let i = 0; i < 3; i += 1) {
      el.shadowRoot.querySelector('[aria-label="Delete item 1"]').click();
      await el.updateComplete;
    }
    expect(itemRows()).to.have.lengthOf(0);
    expect(view.state.selection.node.childCount).to.equal(1);
    expect(el.shadowRoot.querySelector('[aria-label="Add item"]').disabled).to.be.false;
    el.shadowRoot.querySelector('[aria-label="Add item"]').click();
    await el.updateComplete;
    expect(rowNames()).to.deep.equal(['Template item']);
    expect(itemRows()).to.have.lengthOf(1);
  });

  it('drag-and-drop moves an item after a later item', async () => {
    await dragItem(0, 3);
    expect(rowNames()).to.deep.equal(['Second', 'Third', 'First']);
    expect(itemRows().map((row) => row.querySelector('.ew-block-item-text').textContent))
      .to.deep.equal(['Second', 'Third', 'First']);
    expect(view.state.selection.node.child(3).child(1).textContent).to.equal('First details');
    expect(el.shadowRoot.querySelector('.is-dragging')).to.be.null;
    expect(el.shadowRoot.querySelector('[data-drop-active]')).to.be.null;
  });

  it('places drop targets in the gaps and outside the first and last items', () => {
    const rows = itemRows();
    const zones = dropZones();
    expect(zones).to.have.lengthOf(rows.length + 1);
    expect(zones[0].nextElementSibling).to.equal(rows[0]);
    expect(zones[rows.length].previousElementSibling).to.equal(rows[rows.length - 1]);
    for (let i = 1; i < rows.length; i += 1) {
      expect(zones[i].previousElementSibling).to.equal(rows[i - 1]);
      expect(zones[i].nextElementSibling).to.equal(rows[i]);
    }
    expect(rows.every((row) => !row.hasAttribute('data-drop-position'))).to.be.true;
    expect(zones.every((zone) => zone.getAttribute('role') === 'presentation')).to.be.true;
  });

  it('moves an item into a middle gap', async () => {
    await dragItem(0, 2);
    expect(rowNames()).to.deep.equal(['Second', 'First', 'Third']);
  });

  it('does not accept drops on the item boxes themselves', () => {
    const { doc } = view.state;
    const dataTransfer = new DataTransfer();
    itemRows()[0].dispatchEvent(new DragEvent('dragstart', { dataTransfer }));
    const over = new DragEvent('dragover', { dataTransfer, bubbles: true, cancelable: true });
    itemRows()[1].dispatchEvent(over);
    expect(over.defaultPrevented).to.be.false;
    itemRows()[1].dispatchEvent(new DragEvent('drop', { dataTransfer, bubbles: true }));
    expect(view.state.doc).to.equal(doc);
  });

  it('clears the indicator when the pointer leaves a gap', async () => {
    const dataTransfer = new DataTransfer();
    itemRows()[0].dispatchEvent(new DragEvent('dragstart', { dataTransfer }));
    const target = dropZones()[2];
    target.dispatchEvent(new DragEvent('dragover', { dataTransfer }));
    await el.updateComplete;
    expect(target.hasAttribute('data-drop-active')).to.be.true;
    target.dispatchEvent(new DragEvent('dragleave', { dataTransfer }));
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('[data-drop-active]')).to.be.null;
  });

  it('centers the insertion indicator between the boxes, not on their borders', async () => {
    const response = await fetch('/blocks/canvas/ew-block-properties/ew-block-properties.css');
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(await response.text());
    el.shadowRoot.adoptedStyleSheets = [...el.shadowRoot.adoptedStyleSheets, sheet];
    el.style.setProperty('--s2-spacing-100', '8px');
    el.style.setProperty('--s2-blue-600', '#147af3');
    const dataTransfer = new DataTransfer();
    itemRows()[0].dispatchEvent(new DragEvent('dragstart', { dataTransfer }));
    const target = dropZones()[2];
    target.dispatchEvent(new DragEvent('dragover', { dataTransfer }));
    await el.updateComplete;
    const style = getComputedStyle(target, '::after');
    const center = target.getBoundingClientRect().top + Number.parseFloat(style.top);
    expect(target.getBoundingClientRect().height).to.equal(8);
    expect(style.height).to.equal('2px');
    expect(style.backgroundColor).to.equal('rgb(20, 122, 243)');
    expect(center).to.be.greaterThan(target.previousElementSibling.getBoundingClientRect().bottom);
    expect(center).to.be.lessThan(target.nextElementSibling.getBoundingClientRect().top);
    expect(getComputedStyle(target.previousElementSibling).boxShadow).to.equal('none');
  });

  it('drag-and-drop moves an item before an earlier item', async () => {
    await dragItem(2, 0);
    expect(rowNames()).to.deep.equal(['Third', 'First', 'Second']);
    expect(view.state.selection).to.be.instanceOf(NodeSelection);
    expect(view.state.selection.from).to.equal(tablePos);
  });

  it('dropping immediately before the next item is a no-op', async () => {
    const { doc } = view.state;
    await dragItem(0, 1);
    expect(view.state.doc).to.equal(doc);
  });

  it('clears a canceled drag without editing the document', async () => {
    const { doc } = view.state;
    const dataTransfer = new DataTransfer();
    itemRows()[0].dispatchEvent(new DragEvent('dragstart', { dataTransfer }));
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.is-dragging')).to.exist;
    itemRows()[0].dispatchEvent(new DragEvent('dragend', { dataTransfer }));
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.is-dragging')).to.be.null;
    expect(view.state.doc).to.equal(doc);
  });

  it('ignores external drops without an item drag source', () => {
    const { doc } = view.state;
    dropZones()[1].dispatchEvent(new DragEvent('drop', { dataTransfer: new DataTransfer(), cancelable: true }));
    expect(view.state.doc).to.equal(doc);
  });

  it('does not reorder stale rows after the document changes during a drag', async () => {
    const dataTransfer = new DataTransfer();
    itemRows()[0].dispatchEvent(new DragEvent('dragstart', { dataTransfer }));
    const target = dropZones()[3];
    target.dispatchEvent(new DragEvent('dragover', { dataTransfer }));
    view.dispatch(view.state.tr.insertText('Edited ', tablePos + 4));
    const { doc } = view.state;
    target.dispatchEvent(new DragEvent('drop', { dataTransfer }));
    await el.updateComplete;
    expect(view.state.doc).to.equal(doc);
    expect(el._dragSource).to.be.null;
  });

  it('supports keyboard reordering and retains focus on the moved item', async () => {
    itemRows()[0].focus();
    itemRows()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true }));
    await el.updateComplete;
    expect(rowNames()).to.deep.equal(['Second', 'First', 'Third']);
    expect(el.shadowRoot.activeElement).to.equal(itemRows()[1]);
  });

  it('disables adding, deleting and dragging in read-only documents', async () => {
    view.editable = false;
    canvasBus.editorDocState.emit();
    await el.updateComplete;
    const { doc } = view.state;
    expect(itemRows().every((row) => !row.draggable)).to.be.true;
    expect(itemRows().every((row) => row.tabIndex === -1)).to.be.true;
    expect(el.shadowRoot.querySelector('[aria-label="Add item"]').disabled).to.be.true;
    expect(el.shadowRoot.querySelector('[aria-label="Delete item 1"]').disabled).to.be.true;
    el._onAddItem();
    el._onDeleteItem(0);
    itemRows()[0].dispatchEvent(new DragEvent('dragstart', { dataTransfer: new DataTransfer() }));
    expect(view.state.doc).to.equal(doc);
    expect(el._dragSource).to.be.null;
  });

  it('hides the item editor for blocks not marked multi', async () => {
    const otherPos = tablePos + view.state.doc.nodeAt(tablePos).nodeSize;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, otherPos)));
    canvasBus.toolbarSelectionState.emit({ surface: 'doc', showable: false, block: { name: 'cards' } });
    await el._loadMultiBlock();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.ew-block-items')).to.be.null;
  });

  it('hides items on deselection and refuses to edit a stale block', async () => {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
    canvasBus.toolbarSelectionState.emit({ surface: 'doc', showable: true });
    await el.updateComplete;
    const { doc } = view.state;
    el._onAddItem();
    el._onDeleteItem(0);
    expect(el.shadowRoot.querySelector('.ew-block-items')).to.be.null;
    expect(view.state.doc).to.equal(doc);
  });

  it('refreshes item counts after remote or toolbar document changes', async () => {
    appendBlockRow(view, tablePos, el._multiTemplateRow);
    canvasBus.editorDocState.emit();
    await el.updateComplete;
    expect(itemRows()).to.have.lengthOf(4);
    expect(itemRows()[3].querySelector('.ew-block-item-text').textContent).to.equal('Template item');
    expect(itemRows()[3].getAttribute('aria-label')).to.equal('Item 4');
  });

  it('clears item controls when the document unloads', async () => {
    canvasBus.editorHtmlState.emit('');
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.ew-block-items')).to.be.null;
    expect(el._multiTemplateRow).to.be.null;
  });

  it('uses gray bordered boxes for each item', async () => {
    const response = await fetch('/blocks/canvas/ew-block-properties/ew-block-properties.css');
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(await response.text());
    el.shadowRoot.adoptedStyleSheets = [...el.shadowRoot.adoptedStyleSheets, sheet];
    el.style.setProperty('--s2-gray-300', '#d5d5d5');
    el.style.setProperty('--s2-corner-radius-500', '8px');
    const style = getComputedStyle(itemRows()[0]);
    expect(style.borderTopWidth).to.equal('1px');
    expect(style.borderTopStyle).to.equal('solid');
    expect(style.borderTopColor).to.equal('rgb(213, 213, 213)');
    expect(style.borderRadius).to.equal('8px');
  });

  it('matches the Items heading typography to the Name and Variant labels', async () => {
    const response = await fetch('/blocks/canvas/ew-block-properties/ew-block-properties.css');
    const formStyle = new CSSStyleSheet();
    formStyle.replaceSync(`
      .nx-form-field {
        font-size: var(--s2-component-m-medium-font-size);
        color: var(--s2-gray-700);
      }
    `);
    const style = new CSSStyleSheet();
    style.replaceSync(await response.text());
    el.shadowRoot.adoptedStyleSheets = [...el.shadowRoot.adoptedStyleSheets, formStyle, style];
    el.style.setProperty('--s2-font-family', 'Arial');
    el.style.setProperty('--s2-component-m-medium-font-size', '18px');
    el.style.setProperty('--s2-component-s-regular-font-size', '13px');
    el.style.setProperty('--s2-gray-700', '#606060');
    el.style.fontFamily = 'Arial';
    el.style.fontWeight = '400';
    el._variantOptions = ['dark, wide'];
    await el.updateComplete;
    const heading = getComputedStyle(el.shadowRoot.querySelector('#block-items-heading'));
    const name = el.shadowRoot.querySelector('.ew-block-name').parentElement.querySelector('span');
    const variant = el.shadowRoot.querySelector('.ew-block-variant > span');
    expect(heading.fontSize).to.equal('18px');
    for (const label of [name, variant]) {
      const labelStyle = getComputedStyle(label);
      for (const property of ['fontFamily', 'fontSize', 'fontWeight', 'color']) {
        expect(heading[property]).to.equal(labelStyle[property]);
      }
    }
  });
});
