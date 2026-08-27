import { expect } from '@esm-bundle/chai';
import { EditorState } from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import { createTrackingPlugin, trackingPluginKey } from '../../../../../blocks/canvas/editor-utils/prose-diff.js';

const schema = getSchema();

function docWithParagraph(text) {
  const para = schema.nodes.paragraph.create(null, schema.text(text));
  return schema.nodes.doc.create(null, para);
}

function docWithHeading(text, level = 2) {
  const heading = schema.nodes.heading.create({ level }, schema.text(text));
  return schema.nodes.doc.create(null, heading);
}

function setup() {
  let rerenderCalls = 0;
  let getEditorCalls = 0;
  const plugin = createTrackingPlugin(
    () => { rerenderCalls += 1; },
    undefined,
    () => { getEditorCalls += 1; },
    undefined,
  );
  const prevState = EditorState.create({ schema, doc: docWithParagraph('hello'), plugins: [plugin] });
  return { plugin, prevState, counts: () => ({ rerenderCalls, getEditorCalls }) };
}

describe('createTrackingPlugin — trackingPluginKey skip flag', () => {
  it('a normal small edit resolves a common editable ancestor and calls getEditor', () => {
    const { plugin, prevState, counts } = setup();
    const tr = prevState.tr.insertText('!', 1);
    const nextState = prevState.apply(tr);

    plugin.spec.view().update({ state: nextState }, prevState);

    expect(counts()).to.deep.equal({ rerenderCalls: 0, getEditorCalls: 1 });
  });

  it('the same edit with trackingPluginKey set skips the diff walk and calls rerenderPage instead', () => {
    const { plugin, prevState, counts } = setup();
    const tr = prevState.tr.insertText('!', 1).setMeta(trackingPluginKey, true);
    const nextState = prevState.apply(tr);

    plugin.spec.view().update({ state: nextState }, prevState);

    expect(counts()).to.deep.equal({ rerenderCalls: 1, getEditorCalls: 0 });
  });

  it('a full-document replace with the meta flag set never attempts position resolution, even when the new doc is much shorter', () => {
    const { plugin, prevState, counts } = setup();
    const shortDoc = docWithParagraph('x');
    const tr = prevState.tr
      .replaceWith(0, prevState.doc.content.size, shortDoc.content)
      .setMeta(trackingPluginKey, true);
    const nextState = prevState.apply(tr);

    expect(() => plugin.spec.view().update({ state: nextState }, prevState)).to.not.throw();
    expect(counts()).to.deep.equal({ rerenderCalls: 1, getEditorCalls: 0 });
  });
});

function setupHeading(level = 2) {
  let rerenderCalls = 0;
  let getEditorCalls = 0;
  const plugin = createTrackingPlugin(
    () => { rerenderCalls += 1; },
    undefined,
    () => { getEditorCalls += 1; },
    undefined,
  );
  const prevState = EditorState.create({ schema, doc: docWithHeading('Title', level), plugins: [plugin] });
  return { plugin, prevState, counts: () => ({ rerenderCalls, getEditorCalls }) };
}

describe('createTrackingPlugin — block identity changes', () => {
  it('changing a heading\'s level calls rerenderPage, not getEditor (outline needs a full re-parse)', () => {
    const { plugin, prevState, counts } = setupHeading(2);
    const tr = prevState.tr.setNodeMarkup(0, undefined, { level: 3 });
    const nextState = prevState.apply(tr);

    plugin.spec.view().update({ state: nextState }, prevState);

    expect(counts()).to.deep.equal({ rerenderCalls: 1, getEditorCalls: 0 });
  });

  it('a plain text edit inside a heading still takes the lightweight getEditor path', () => {
    const { plugin, prevState, counts } = setupHeading(2);
    const tr = prevState.tr.insertText('!', 1);
    const nextState = prevState.apply(tr);

    plugin.spec.view().update({ state: nextState }, prevState);

    expect(counts()).to.deep.equal({ rerenderCalls: 0, getEditorCalls: 1 });
  });
});

function setupImage(src) {
  let rerenderCalls = 0;
  let getEditorCalls = 0;
  const plugin = createTrackingPlugin(
    () => { rerenderCalls += 1; },
    undefined,
    () => { getEditorCalls += 1; },
    undefined,
  );
  const para = schema.nodes.paragraph.create(null, schema.nodes.image.create({ src }));
  const doc = schema.nodes.doc.create(null, para);
  const prevState = EditorState.create({ schema, doc, plugins: [plugin] });
  return { plugin, prevState, counts: () => ({ rerenderCalls, getEditorCalls }) };
}

describe('createTrackingPlugin — attrs changes outside EDITABLE_TYPES', () => {
  it('changing an image\'s attrs (e.g. src) takes the lightweight getEditor path, not a full rerenderPage', () => {
    const { plugin, prevState, counts } = setupImage('/a.png');
    const imagePos = 1;
    const tr = prevState.tr.setNodeMarkup(imagePos, undefined, { src: '/b.png' });
    const nextState = prevState.apply(tr);

    plugin.spec.view().update({ state: nextState }, prevState);

    expect(counts()).to.deep.equal({ rerenderCalls: 0, getEditorCalls: 1 });
  });
});

function setupBlockCell() {
  let rerenderCalls = 0;
  let getEditorCalls = 0;
  const offsets = [];
  const plugin = createTrackingPlugin(
    () => { rerenderCalls += 1; },
    undefined,
    ({ cursorOffset }) => { getEditorCalls += 1; offsets.push(cursorOffset); },
    undefined,
  );
  const cell = schema.nodes.table_cell.create(null, [
    schema.nodes.heading.create({ level: 1 }, schema.text('Author Kit')),
    schema.nodes.paragraph.create(null, schema.text('Powerfully simple')),
  ]);
  const doc = schema.nodes.doc.create(null, schema.nodes.table.create(
    null,
    [
      schema.nodes.table_row.create(null, schema.nodes.table_cell.create(
        null,
        schema.nodes.paragraph.create(null, schema.text('hero')),
      )),
      schema.nodes.table_row.create(null, cell),
    ],
  ));
  const prevState = EditorState.create({ schema, doc, plugins: [plugin] });
  return { plugin, prevState, offsets, counts: () => ({ rerenderCalls, getEditorCalls }) };
}

// Regression: the diff spans two coordinate spaces. Reporting the paragraph's
// *old* position while resolving it in the *new* doc made it land inside the
// grown heading, so both changes collapsed onto one "common ancestor" and the
// paragraph edit was never synced to the quick-edit iframe.
describe('createTrackingPlugin — two sibling nodes changed in one transaction', () => {
  it('reports both changes at their new-doc positions, so no common ancestor is found', () => {
    const { plugin, prevState, counts } = setupBlockCell();
    const headingPos = prevState.doc.resolve(0).nodeAfter.child(0).nodeSize + 3;
    const heading = prevState.doc.nodeAt(headingPos);
    expect(heading.type.name).to.equal('heading');

    const paragraphPos = headingPos + heading.nodeSize;
    const tr = prevState.tr
      .insertText('!!!', paragraphPos + 1)
      .insertText('???', headingPos + 1);
    const nextState = prevState.apply(tr);

    plugin.spec.view().update({ state: nextState }, prevState);

    expect(counts()).to.deep.equal({ rerenderCalls: 1, getEditorCalls: 0 });
  });

  it('still takes the lightweight path when only one of the two siblings changes', () => {
    const { plugin, prevState, offsets, counts } = setupBlockCell();
    const headingPos = prevState.doc.resolve(0).nodeAfter.child(0).nodeSize + 3;
    const heading = prevState.doc.nodeAt(headingPos);
    const paragraphPos = headingPos + heading.nodeSize;

    const tr = prevState.tr.insertText('!!!', paragraphPos + 1);
    const nextState = prevState.apply(tr);

    plugin.spec.view().update({ state: nextState }, prevState);

    expect(counts()).to.deep.equal({ rerenderCalls: 0, getEditorCalls: 1 });
    expect(offsets).to.deep.equal([paragraphPos + 1]);
  });
});
