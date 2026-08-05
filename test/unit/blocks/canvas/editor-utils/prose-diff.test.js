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
