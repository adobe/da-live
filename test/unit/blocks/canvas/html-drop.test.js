import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setNx } from '../../../../scripts/utils.js';
import { makeRealView } from './test-helpers.js';
import { insertDroppedHtml } from '../../../../blocks/canvas/editor-utils/html-drop.js';
import { handleHtmlDrop } from '../../../../blocks/canvas/ew-editor-wysiwyg/utils/html-drop.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
const { default: imageDrop } = await import('../../../../blocks/canvas/ew-editor-doc/prose-plugins/imageDrop.js');
const { createControllerOnMessage } = await import('../../../../blocks/canvas/ew-editor-wysiwyg/quick-edit-controller.js');

describe('native HTML drops', () => {
  let view;
  const paragraph = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
  beforeEach(() => {
    view = makeRealView({ type: 'doc', content: [paragraph('Before'), paragraph('After')] });
  });
  afterEach(() => {
    const mount = view.dom.parentElement;
    view.destroy();
    mount.remove();
    sinon.restore();
  });

  it('parses HTML at the document drop coordinates, not the current selection', () => {
    const position = view.state.doc.firstChild.nodeSize;
    sinon.stub(view, 'posAtCoords').returns({ pos: position });
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/html', '<h2>Inserted</h2><p>Content</p>');
    const event = { clientX: 12, clientY: 34, preventDefault() {}, dataTransfer };
    const handler = imageDrop(view.state.schema, () => '').props.handleDOMEvents;
    expect(handler.dragover(view, event)).to.equal(true);
    expect(handler.drop(view, event)).to.equal(true);
    const types = [];
    view.state.doc.forEach((node) => types.push(node.type.name));
    expect(types).to.deep.equal(['paragraph', 'heading', 'paragraph', 'paragraph']);
    expect(view.state.doc.textContent).to.equal('BeforeInsertedContentAfter');
  });

  it('leaves internal moves and read-only drops to ProseMirror', () => {
    sinon.stub(view, 'posAtCoords').returns({ pos: 1 });
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/html', '<strong>Native</strong>');
    const event = { clientX: 12, clientY: 34, preventDefault() {}, dataTransfer };
    const handler = imageDrop(view.state.schema, () => '').props.handleDOMEvents;
    view.dragging = {};
    expect(handler.drop(view, event)).to.equal(false);
    view.dragging = null;
    view.setProps({ editable: () => false });
    expect(handler.dragover(view, event)).to.equal(false);
    expect(handler.drop(view, event)).to.equal(false);
    expect(view.state.doc.textContent).to.equal('BeforeAfter');
  });

  it('inserts WYSIWYG HTML beside its anchor and gates mutations by permission', () => {
    const html = '<ul><li>Item</li></ul>';
    const payload = { html, anchor: { kind: 'text', index: 1 }, side: 'after' };
    createControllerOnMessage({ view, canWrite: false })({ data: { type: 'html-drop', payload } });
    expect(view.state.doc.childCount).to.equal(2);
    createControllerOnMessage({ view, canWrite: true })({ data: { type: 'html-drop', payload } });
    expect(view.state.doc.child(1).type.name).to.equal('bullet_list');
    expect(view.state.doc.child(1).textContent).to.equal('Item');
    expect(handleHtmlDrop({ ...payload, anchor: { kind: 'block', index: 1 } }, { view })).to.equal(false);
    expect(handleHtmlDrop({ ...payload, anchor: { kind: 'text', index: 10000 } }, { view })).to.equal(false);
    expect(insertDroppedHtml({ view, html: '', position: 0 })).to.equal(false);
  });

  it('inserts before the outer table when the preview anchor is nested text', () => {
    const { schema } = view.state;
    const table = schema.node('table', null, [
      schema.node('table_row', null, [
        schema.node('table_cell', null, [schema.node('paragraph', null, schema.text('Cell'))]),
      ]),
    ]);
    view.dispatch(view.state.tr.insert(0, table));
    expect(handleHtmlDrop({ html: '<h2>Before table</h2>', anchor: { kind: 'text', index: 4 }, side: 'before' }, { view })).to.equal(true);
    expect(view.state.doc.firstChild.type.name).to.equal('heading');
    expect(view.state.doc.child(1).type.name).to.equal('table');
  });
});
