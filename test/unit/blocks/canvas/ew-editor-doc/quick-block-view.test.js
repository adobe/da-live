import { expect } from '@esm-bundle/chai';
import { NodeSelection, columnResizing } from 'da-y-wrapper';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { createTestEditor, destroyEditor } = await import('../../edit/prose/test-helpers.js');
const { getInstrumentedHTML } = await import(
  '../../../../../blocks/canvas/editor-utils/editor-utils.js'
);
const { getCellImagePosition } = await import(
  '../../../../../blocks/canvas/editor-utils/table-cells.js'
);
const {
  default: quickBlockView,
  setQuickBlockViewMode,
} = await import(
  '../../../../../blocks/canvas/ew-editor-doc/prose-plugins/quickBlockViewState.js'
);

const ROWS = [
  { block: 'hero', property: 'quick' },
  { block: 'cards', property: 'multi' },
];

function createTemplateRow() {
  const row = document.createElement('tr');
  row.innerHTML = '<td>New title</td><td>New description</td>';
  return row;
}

function createTable(schema, name = 'hero') {
  const paragraph = (text) => schema.nodes.paragraph.create(null, schema.text(text));
  const cell = (text) => schema.nodes.table_cell.create(null, paragraph(text));
  const strong = schema.marks.strong.create();
  const link = schema.marks.link.create({ href: 'https://example.com' });
  const richCell = schema.nodes.table_cell.create(null, [
    schema.nodes.paragraph.create(null, [
      schema.text('Bold', [strong]),
      schema.text(' link', [link]),
    ]),
    paragraph('Second paragraph'),
  ]);
  const image = schema.nodes.image.create({
    src: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',
    alt: 'Hero image',
  });
  const imageCell = schema.nodes.table_cell.create(
    null,
    schema.nodes.paragraph.create(null, image),
  );
  return schema.nodes.table.create(null, [
    schema.nodes.table_row.create(null, [cell(name), cell('Description')]),
    schema.nodes.table_row.create(null, [cell('Title'), richCell]),
    schema.nodes.table_row.create(null, [cell('Image'), imageCell]),
  ]);
}

function setTable(editor, name = 'hero') {
  const { state } = editor.view;
  editor.view.dispatch(state.tr.replaceWith(
    0,
    state.doc.content.size,
    createTable(state.schema, name),
  ));
}

describe('quick block view decorations', () => {
  let editor;
  let pickerView;

  beforeEach(async () => {
    pickerView = null;
    editor = await createTestEditor(
      {
        additionalPlugins: [
          columnResizing(),
          quickBlockView(ROWS, {
            imagePicker: (view) => { pickerView = view; },
            getMultiTemplateRow: async () => createTemplateRow(),
          }),
        ],
      },
    );
  });

  afterEach(() => destroyEditor(editor));

  it('keeps the real table DOM and renders the quick UI as a sibling widget', () => {
    setTable(editor);

    const widget = editor.view.dom.querySelector('.quick-block-ui');
    const wrapper = editor.view.dom.querySelector('.tableWrapper');

    expect(widget).to.exist;
    expect(wrapper).to.exist;
    expect(wrapper.querySelector('table')).to.exist;
    expect(wrapper.classList.contains('quick-block-table-hidden')).to.be.true;
    expect(widget.nextElementSibling).to.equal(wrapper);
    expect(widget.querySelectorAll('.quick-block-pill')).to.have.length(4);
    expect(widget.textContent).not.to.include('Description');
  });

  it('edits and saves the complete rich cell content', async () => {
    setTable(editor);
    const original = editor.view.state.doc.nodeAt(0).child(1).child(1);
    const outside = document.createElement('button');
    document.body.append(outside);

    editor.view.dom.querySelectorAll('.quick-block-pill')[1].click();
    await Promise.resolve();

    const field = editor.view.dom.querySelector('.quick-block-popup-editor .ProseMirror');
    expect(editor.view.dom.querySelector('.quick-block-popup-label').textContent).to.equal('Edit');
    expect(field.querySelector('strong')?.textContent).to.equal('Bold');
    expect(field.querySelector('a')?.getAttribute('href')).to.equal('https://example.com');
    expect(field.querySelectorAll('p')).to.have.length(2);
    expect(editor.view.dom.querySelector('.quick-block-popup-button')).to.equal(null);

    outside.focus();
    await Promise.resolve();

    expect(editor.view.state.doc.nodeAt(0).child(1).child(1).eq(original)).to.be.true;
    expect(editor.view.dom.querySelector('.quick-block-popup')).to.equal(null);
    outside.remove();
  });

  it('does not recreate the rich editor when its content is clicked', () => {
    setTable(editor);
    editor.view.dom.querySelectorAll('.quick-block-pill')[1].click();

    const field = editor.view.dom.querySelector('.quick-block-popup-editor .ProseMirror');
    field.querySelector('p').click();

    expect(
      editor.view.dom.querySelector('.quick-block-popup-editor .ProseMirror'),
    ).to.equal(field);
  });

  it('keeps the edit popup inside the viewport', async () => {
    setTable(editor);
    const pill = editor.view.dom.querySelector('.quick-block-pill');
    pill.getBoundingClientRect = () => ({
      left: window.innerWidth - 40,
      right: window.innerWidth - 20,
      top: 100,
      bottom: 130,
      width: 20,
      height: 30,
    });

    pill.click();
    const popup = editor.view.dom.querySelector('.quick-block-popup');
    popup.getBoundingClientRect = () => ({
      left: window.innerWidth - 40,
      right: window.innerWidth + 440,
      top: 138,
      bottom: 438,
      width: 480,
      height: 300,
    });
    await Promise.resolve();

    expect(parseFloat(popup.style.left)).to.be.lessThan(0);
    expect(parseFloat(popup.style.width)).to.be.at.most(window.innerWidth - 32);
  });

  it('opens the toolbar image picker for image-only cells', () => {
    setTable(editor);

    editor.view.dom.querySelectorAll('.quick-block-pill')[3].click();

    expect(editor.view.state.selection).to.be.instanceOf(NodeSelection);
    expect(editor.view.state.selection.node.type.name).to.equal('image');
    expect(pickerView).to.equal(editor.view);
  });

  it('groups multi-block content pills by item row', async () => {
    setTable(editor, 'cards');
    await Promise.resolve();
    await Promise.resolve();

    const items = editor.view.dom.querySelectorAll('.quick-block-item');
    expect(items).to.have.length(2);
    expect(items[0].querySelectorAll('.quick-block-pill')).to.have.length(3);
    expect(items[1].querySelectorAll('.quick-block-pill')).to.have.length(2);
    expect(editor.view.dom.querySelectorAll('.quick-block-item-delete')).to.have.length(2);
    const dragHandles = editor.view.dom.querySelectorAll('.quick-block-item-drag');
    expect(dragHandles).to.have.length(2);
    expect(dragHandles[0].querySelector('use').getAttribute('href'))
      .to.equal('/img/icons/s2-icon-draghandle-20-n.svg#icon');
    expect(editor.view.dom.querySelectorAll('.quick-block-drop-target')).to.have.length(3);
    expect(editor.view.dom.querySelector('.quick-block-add-item')).to.exist;
  });

  it('reorders multi-block item rows with the drag handle', () => {
    setTable(editor, 'cards');
    const items = editor.view.dom.querySelectorAll('.quick-block-item');
    const dropTargets = editor.view.dom.querySelectorAll('.quick-block-drop-target');
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData() {},
    };
    const dragStart = new Event('dragstart', { bubbles: true });
    Object.defineProperty(dragStart, 'dataTransfer', { value: dataTransfer });
    items[0].querySelector('.quick-block-item-drag').dispatchEvent(dragStart);

    const dragOver = new MouseEvent('dragover', { bubbles: true });
    Object.defineProperty(dragOver, 'dataTransfer', { value: dataTransfer });
    dropTargets[2].dispatchEvent(dragOver);
    expect(dropTargets[2].hasAttribute('data-drop-active')).to.be.true;

    const drop = new MouseEvent('drop', { bubbles: true });
    Object.defineProperty(drop, 'dataTransfer', { value: dataTransfer });
    dropTargets[2].dispatchEvent(drop);

    const table = editor.view.state.doc.nodeAt(0);
    expect(table.child(1).child(0).textContent).to.equal('Image');
    expect(table.child(2).child(0).textContent).to.equal('Title');
  });

  it('deletes a multi-block item row', () => {
    setTable(editor, 'cards');

    editor.view.dom.querySelector('.quick-block-item-delete').click();

    const table = editor.view.state.doc.nodeAt(0);
    expect(table.childCount).to.equal(2);
    expect(table.child(1).child(0).textContent).to.equal('Image');
    expect(editor.view.dom.querySelectorAll('.quick-block-item')).to.have.length(1);
  });

  it('adds the configured multi-block template row', async () => {
    setTable(editor, 'cards');
    await Promise.resolve();
    await Promise.resolve();

    editor.view.dom.querySelector('.quick-block-add-item').click();

    const table = editor.view.state.doc.nodeAt(0);
    expect(table.childCount).to.equal(4);
    expect(table.lastChild.child(0).textContent).to.equal('New title');
    expect(editor.view.dom.querySelectorAll('.quick-block-item')).to.have.length(3);
  });

  it('opens the image picker from a multi-block image pill', () => {
    setTable(editor, 'cards');

    editor.view.dom.querySelectorAll('.quick-block-pill')[4].click();

    expect(editor.view.state.selection).to.be.instanceOf(NodeSelection);
    expect(editor.view.state.selection.node.type.name).to.equal('image');
    expect(pickerView).to.equal(editor.view);
  });

  it('updates the image pill when the table image changes', () => {
    setTable(editor);
    const table = editor.view.state.doc.nodeAt(0);
    const imagePos = getCellImagePosition(table, 0, 2, 1);
    const originalThumb = editor.view.dom.querySelector('.quick-block-pill-thumb');

    editor.view.dispatch(editor.view.state.tr.setNodeAttribute(
      imagePos,
      'src',
      'updated.png',
    ));

    const updatedThumb = editor.view.dom.querySelector('.quick-block-pill-thumb');
    expect(updatedThumb).not.to.equal(originalThumb);
    expect(updatedThumb.getAttribute('src')).to.equal('updated.png');
  });

  it('reveals the existing table when switched to table mode', () => {
    setTable(editor);
    const wrapper = editor.view.dom.querySelector('.tableWrapper');

    setQuickBlockViewMode(editor.view, 0, 'table');

    expect(editor.view.dom.querySelector('.quick-block')).to.equal(null);
    const toggle = editor.view.dom.querySelector('.quick-block-table-toggle');
    expect(toggle).to.exist;
    expect(toggle.getAttribute('aria-label')).to.equal('Show quick view');
    expect(toggle.children).to.have.length(0);
    expect(editor.view.dom.querySelector('.tableWrapper')).to.equal(wrapper);
    expect(wrapper.classList.contains('quick-block-table-hidden')).to.be.false;
  });

  it('switches from the normal table back to quick view', () => {
    setTable(editor);
    setQuickBlockViewMode(editor.view, 0, 'table');
    const wrapper = editor.view.dom.querySelector('.tableWrapper');

    editor.view.dom.querySelector('.quick-block-table-toggle').click();

    expect(editor.view.dom.querySelector('.quick-block')).to.exist;
    expect(editor.view.dom.querySelector('.quick-block-table-toggle')).to.equal(null);
    expect(wrapper.classList.contains('quick-block-table-hidden')).to.be.true;
  });

  it('does not decorate tables that are not configured as quick blocks', () => {
    setTable(editor, 'columns');

    expect(editor.view.dom.querySelector('.quick-block-ui')).to.equal(null);
    expect(
      editor.view.dom.querySelector('.tableWrapper').classList
        .contains('quick-block-table-hidden'),
    ).to.be.false;
  });

  it('serializes identical HTML in quick and table modes', () => {
    setTable(editor);
    const quickHTML = getInstrumentedHTML(editor.view);

    setQuickBlockViewMode(editor.view, 0, 'table');

    expect(getInstrumentedHTML(editor.view)).to.equal(quickHTML);
  });
});
