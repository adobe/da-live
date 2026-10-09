import { expect } from '@esm-bundle/chai';
import { DOMParser as PMDOMParser, EditorState, EditorView, TextSelection, columnResizing } from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import { setNx } from '../../../../../scripts/utils.js';
import { applyEditorChanges, describeEditorBlock, getEditorSnapshot, resolveEditorTarget } from '../../../../../blocks/canvas/editor-utils/editor-sdk.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
const { createExtensionsBridgePlugin } = await import('../../../../../blocks/canvas/editor-utils/extensions-bridge.js');
const { getInstrumentedHTML } = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js');
const { createEditorProtocol } = await import('../../../../../blocks/canvas/ew-panel-extensions/editor-protocol.js');

const TABLE = `<table>
  <tr><td colspan="2"><p>Cards (Wide)</p></td></tr>
  <tr><td><p><strong>First</strong></p><p><a href="/first">Link</a></p></td>
    <td><p><img src="/first.png" alt="First"></p><ul><li><p>One</p></li><li><p>Two</p></li></ul></td></tr>
  <tr><td><p>Second</p></td><td><p>Value</p></td></tr>
</table>`;

function request(snapshot, changes) {
  return { documentId: snapshot.documentId, revision: snapshot.revision, changes };
}

describe('editor extension host', () => {
  let view;
  let container;

  beforeEach(() => {
    const schema = getSchema();
    container = document.createElement('div');
    document.body.append(container);
    const parsed = new DOMParser().parseFromString(TABLE, 'text/html');
    const state = EditorState.create({
      schema,
      doc: PMDOMParser.fromSchema(schema).parse(parsed.body),
      plugins: [columnResizing(), createExtensionsBridgePlugin(null, getInstrumentedHTML)],
    });
    view = new EditorView(container, {
      state,
      dispatchTransaction(tr) { view.updateState(view.state.apply(tr)); },
    });
  });

  afterEach(() => {
    view.destroy();
    container.remove();
  });

  it('publishes instrumented HTML and source-backed field descriptors', () => {
    const snapshot = getEditorSnapshot(view);
    expect(snapshot.html).to.contain('data-block-index="1"');
    expect(snapshot.revision).to.equal(0);
    const [block] = snapshot.blocks;
    expect(block.name).to.equal('cards');
    expect(block.variant).to.equal('Wide');
    expect(block.rows).to.have.lengthOf(2);
    expect(block.rows[0].cells[0].fields[0].value).to.equal('First');
    expect(block.rows[0].cells[1].fields[0].type).to.equal('image');
    expect(block.rows[0].cells[1].fields[1].items[0].value).to.equal('One');
  });

  it('accepts the existing data-prose-index without a new identifier', () => {
    const snapshot = getEditorSnapshot(view);
    const html = new DOMParser().parseFromString(snapshot.html, 'text/html');
    const element = [...html.querySelectorAll('p[data-prose-index]')].find((el) => el.textContent === 'First');
    const target = { attribute: 'data-prose-index', index: Number(element.dataset.proseIndex) };
    applyEditorChanges(view, request(snapshot, [{ type: 'setText', target, value: 'Changed' }]));
    const node = getEditorSnapshot(view).blocks[0].rows[0].cells[0].fields[0];
    expect(node.value).to.equal('Changed');
    expect(view.state.doc.textContent).to.contain('Changed');
    expect(view.state.doc.firstChild.child(1).firstChild.firstChild.firstChild.marks[0].type.name).to.equal('strong');
  });

  it('rejects stale snapshots and the wrong document before changing content', () => {
    const snapshot = getEditorSnapshot(view);
    const { target } = snapshot.blocks[0].rows[0].cells[0].fields[0];
    view.dispatch(view.state.tr.insertText('!', 4));
    expect(() => applyEditorChanges(view, request(snapshot, [{ type: 'setText', target, value: 'Wrong' }])))
      .to.throw('The page changed');
    const latest = getEditorSnapshot(view);
    expect(() => applyEditorChanges(view, { ...request(latest, []), documentId: 'other' }))
      .to.throw('The document changed');
  });

  it('tracks enclosing blocks for collapsed selections without advancing the revision', () => {
    const snapshot = getEditorSnapshot(view);
    const { target } = snapshot.blocks[0].rows[0].cells[0].fields[0];
    const { pos } = resolveEditorTarget(view, { ...snapshot, target });
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 1)));
    const latest = getEditorSnapshot(view);
    expect(latest.selectedBlock).to.deep.equal(snapshot.blocks[0].target);
    expect(latest.revision).to.equal(snapshot.revision);
  });

  it('applies disjoint edits atomically and rejects an invalid later operation', () => {
    const snapshot = getEditorSnapshot(view);
    const { fields } = snapshot.blocks[0].rows[0].cells[0];
    const changes = [
      { type: 'setText', target: fields[0].target, value: 'Changed' },
      { type: 'setLink', target: fields[1].target, href: 'data:text/html,unsafe' },
    ];
    const before = view.state.doc;
    expect(() => applyEditorChanges(view, request(snapshot, changes))).to.throw('Unsupported URL');
    expect(view.state.doc).to.equal(before);
    changes[1].href = '/updated';
    applyEditorChanges(view, request(snapshot, changes));
    expect(getEditorSnapshot(view).blocks[0].rows[0].cells[0].fields[1].href).to.equal('/updated');
    expect(getEditorSnapshot(view).revision).to.equal(1);
  });

  it('rejects forged and overlapping targets', () => {
    const snapshot = getEditorSnapshot(view);
    const { target } = snapshot.blocks[0].rows[0].cells[0].fields[0];
    expect(() => applyEditorChanges(view, request(snapshot, [{ type: 'setText', target: { attribute: 'data-prose-index', index: 999 }, value: 'Wrong' }]))).to.throw('not issued');
    expect(() => applyEditorChanges(view, request(snapshot, [
      { type: 'setText', target, value: 'First' },
      { type: 'setText', target, value: 'Second' },
    ]))).to.throw('Overlapping');
  });

  it('updates variants independently of the current selection', () => {
    const snapshot = getEditorSnapshot(view);
    applyEditorChanges(view, request(snapshot, [{ type: 'setBlockVariant', target: snapshot.blocks[0].target, value: 'Narrow' }]));
    expect(getEditorSnapshot(view).blocks[0].variant).to.equal('Narrow');
  });

  it('adds, reorders and deletes repeating rows', () => {
    let snapshot = getEditorSnapshot(view);
    const apply = (change) => {
      const targeted = { ...change, target: snapshot.blocks[0].target };
      applyEditorChanges(view, request(snapshot, [targeted]));
      snapshot = getEditorSnapshot(view);
    };
    apply({ type: 'appendBlockRow', html: '<tr><td><p>Third</p></td><td><p>Value</p></td></tr>' });
    expect(snapshot.blocks[0].rows).to.have.lengthOf(3);
    apply({ type: 'moveBlockRow', from: 2, to: 0 });
    expect(snapshot.blocks[0].rows[0].cells[0].fields[0].value).to.equal('Third');
    apply({ type: 'deleteBlockRow', rowIndex: 0 });
    expect(snapshot.blocks[0].rows).to.have.lengthOf(2);
  });

  it('rejects template rows with a different column width', () => {
    const snapshot = getEditorSnapshot(view);
    expect(() => applyEditorChanges(view, request(snapshot, [{ type: 'appendBlockRow', target: snapshot.blocks[0].target, html: '<tr><td><p>Wrong</p></td></tr>' }]))).to.throw('columns');
    expect(getEditorSnapshot(view).revision).to.equal(0);
  });

  it('changes nested list items while enforcing the minimum item count', () => {
    let snapshot = getEditorSnapshot(view);
    const list = () => snapshot.blocks[0].rows[0].cells[1].fields[1];
    applyEditorChanges(view, request(snapshot, [{ type: 'setText', target: list().items[0].target, value: 'Updated item' }]));
    snapshot = getEditorSnapshot(view);
    expect(list().items[0].value).to.equal('Updated item');
    applyEditorChanges(view, request(snapshot, [{ type: 'changeList', target: list().target, from: 1, to: null }]));
    snapshot = getEditorSnapshot(view);
    expect(() => applyEditorChanges(view, request(snapshot, [{ type: 'changeList', target: list().target, from: 0, to: null }]))).to.throw('At least one');
  });

  it('normalizes original library tables without exposing editor nodes', () => {
    const description = describeEditorBlock(view, { html: TABLE });
    expect(description.name).to.equal('cards');
    expect(description.rows[0].cells[0].fields[0]).not.to.have.property('node');
    expect(description.rows[0].cells[0].fields[0]).not.to.have.property('target');
  });

  it('enforces read-only state on writes', () => {
    view.setProps({ editable: () => false });
    const snapshot = getEditorSnapshot(view);
    expect(snapshot.editable).to.equal(false);
    expect(() => applyEditorChanges(view, request(snapshot, [{ type: 'setText', target: snapshot.blocks[0].rows[0].cells[0].fields[0].target, value: 'Wrong' }]))).to.throw('read-only');
  });

  it('streams content and selection updates and unsubscribes', async () => {
    const channel = new MessageChannel();
    const getView = () => view;
    const protocol = createEditorProtocol({ port: channel.port1, getView, hashState: {} });
    const messages = [];
    channel.port2.onmessage = ({ data }) => messages.push(data);
    const details = { subscriptionId: 'sub' };
    await protocol.handle({ action: 'subscribeDocument', requestId: 'one', details });
    view.dispatch(view.state.tr.insertText('!', 4));
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 4)));
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    expect(messages.filter((message) => message.action === 'editorSnapshot').map((message) => message.details.revision))
      .to.deep.equal([0, 1, 1]);
    await protocol.handle({ action: 'unsubscribeDocument', requestId: 'two', details: { subscriptionId: 'sub' } });
    view.dispatch(view.state.tr.insertText('!', 4));
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    expect(messages.filter((message) => message.action === 'editorSnapshot')).to.have.lengthOf(3);
    protocol.destroy();
    channel.port1.close();
    channel.port2.close();
  });
});
