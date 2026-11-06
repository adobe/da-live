import { expect } from '@esm-bundle/chai';
import { EditorState, ySyncPluginKey } from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import { createTrackingPlugin, trackingPluginKey } from '../../../../../blocks/canvas/editor-utils/prose-diff.js';

const schema = getSchema();

function docWithParagraph(text) {
  const para = schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
  return schema.nodes.doc.create(null, para);
}

function docWithHeading(text, level = 2) {
  const heading = schema.nodes.heading.create({ level }, schema.text(text));
  return schema.nodes.doc.create(null, heading);
}

function setup(content = 'hello') {
  let rerenderCalls = 0;
  let rerenderDetails;
  let getEditorCalls = 0;
  const plugin = createTrackingPlugin(
    (details) => { rerenderCalls += 1; rerenderDetails = details; },
    undefined,
    () => { getEditorCalls += 1; },
    undefined,
  );
  const doc = typeof content === 'string' ? docWithParagraph(content) : content;
  const prevState = EditorState.create({ schema, doc, plugins: [plugin] });
  return {
    plugin,
    prevState,
    counts: () => ({ rerenderCalls, getEditorCalls }),
    rerenderDetails: () => rerenderDetails,
  };
}

describe('createTrackingPlugin rendered editable targets', () => {
  const blockDoc = (name) => {
    const row = (text) => schema.node('table_row', null, [
      schema.node('table_cell', null, [schema.node('paragraph', null, [schema.text(text)])]),
    ]);
    return schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('text')]),
      schema.node('table', null, [row(name), row('before')]),
    ]);
  };

  const textPosition = (doc, text) => {
    const positions = [];
    doc.descendants((node, pos) => {
      if (node.isText && node.text === text) positions.push(pos);
    });
    expect(positions).to.have.length(1);
    return positions[0];
  };

  it('rerenders block-title edits instead of opening the preceding paragraph', () => {
    const { plugin, prevState, counts, rerenderDetails } = setup(blockDoc('hero'));
    const nextState = prevState.apply(
      prevState.tr.insertText('!', textPosition(prevState.doc, 'hero') + 1),
    );

    plugin.spec.view().update({ state: nextState }, prevState);

    expect(counts()).to.deep.equal({ rerenderCalls: 1, getEditorCalls: 0 });
    expect(rerenderDetails()).to.deep.include({
      previousDoc: prevState.doc,
      doc: nextState.doc,
    });
  });

  ['Metadata', 'Section Metadata', 'Section Metadata (highlight)', 'Library Metadata'].forEach((name) => {
    it(`rerenders body-cell edits inside ${name}`, () => {
      const { plugin, prevState, counts, rerenderDetails } = setup(blockDoc(name));
      const nextState = prevState.apply(
        prevState.tr.insertText('!', textPosition(prevState.doc, 'before') + 1),
      );

      plugin.spec.view().update({ state: nextState }, prevState);

      expect(counts()).to.deep.equal({ rerenderCalls: 1, getEditorCalls: 0 });
      expect(rerenderDetails()).to.deep.include({
        previousDoc: prevState.doc,
        doc: nextState.doc,
      });
    });
  });

  it('keeps body-cell edits in ordinary rendered blocks inline', () => {
    const { plugin, prevState, counts } = setup(blockDoc('hero'));
    const nextState = prevState.apply(
      prevState.tr.insertText('!', textPosition(prevState.doc, 'before') + 1),
    );

    plugin.spec.view().update({ state: nextState }, prevState);

    expect(counts()).to.deep.equal({ rerenderCalls: 0, getEditorCalls: 1 });
  });
});

describe('createTrackingPlugin — trackingPluginKey skip flag', () => {
  it('rerenders the scope when typing into an empty paragraph missing from the preview', () => {
    const { plugin, prevState, counts, rerenderDetails } = setup('');
    const nextState = prevState.apply(prevState.tr.insertText('-', 1));

    plugin.spec.view().update({ state: nextState }, prevState);

    expect(counts()).to.deep.equal({ rerenderCalls: 1, getEditorCalls: 0 });
    expect(rerenderDetails()).to.deep.include({
      previousDoc: prevState.doc,
      doc: nextState.doc,
    });
    expect(rerenderDetails().changes).to.have.lengthOf(1);
    expect(rerenderDetails().changes[0]).to.include({ type: 'added', pos: 1 });
  });

  it('a normal small edit resolves a common editable ancestor and calls getEditor', () => {
    const { plugin, prevState, counts } = setup();
    const tr = prevState.tr.insertText('!', 1);
    const nextState = prevState.apply(tr);

    plugin.spec.view().update({ state: nextState }, prevState);

    expect(counts()).to.deep.equal({ rerenderCalls: 0, getEditorCalls: 1 });
  });

  it('the same edit with trackingPluginKey set skips the diff walk and calls rerenderPage instead', () => {
    const { plugin, prevState, counts, rerenderDetails } = setup();
    const tr = prevState.tr.insertText('!', 1).setMeta(trackingPluginKey, true);
    const nextState = prevState.apply(tr);

    plugin.spec.view().update({ state: nextState }, prevState);

    expect(counts()).to.deep.equal({ rerenderCalls: 1, getEditorCalls: 0 });
    expect(rerenderDetails()).to.be.undefined;
  });

  it('resumes diffing after a skipped update', () => {
    const { plugin, prevState, counts } = setup();
    const skippedState = prevState.apply(
      prevState.tr.insertText('!', 1).setMeta(trackingPluginKey, true),
    );
    plugin.spec.view().update({ state: skippedState }, prevState);

    const nextState = skippedState.apply(skippedState.tr.insertText('?', 1));
    plugin.spec.view().update({ state: nextState }, skippedState);

    expect(counts()).to.deep.equal({ rerenderCalls: 1, getEditorCalls: 1 });
  });

  it('rerenders when a skipped transaction has a chained document change', () => {
    const { plugin, prevState, counts } = setup();
    const skippedState = prevState.apply(
      prevState.tr.insertText('!', 1).setMeta(trackingPluginKey, true),
    );
    const nextState = skippedState.apply(skippedState.tr.insertText('?', 1));

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
  let rerenderDetails;
  let getEditorCalls = 0;
  const plugin = createTrackingPlugin(
    (details) => { rerenderCalls += 1; rerenderDetails = details; },
    undefined,
    () => { getEditorCalls += 1; },
    undefined,
  );
  const prevState = EditorState.create({ schema, doc: docWithHeading('Title', level), plugins: [plugin] });
  return {
    plugin,
    prevState,
    counts: () => ({ rerenderCalls, getEditorCalls }),
    rerenderDetails: () => rerenderDetails,
  };
}

describe('createTrackingPlugin — block identity changes', () => {
  it('changing a heading\'s level calls rerenderPage, not getEditor (outline needs a full re-parse)', () => {
    const { plugin, prevState, counts, rerenderDetails } = setupHeading(2);
    const tr = prevState.tr.setNodeMarkup(0, undefined, { level: 3 });
    const nextState = prevState.apply(tr);

    plugin.spec.view().update({ state: nextState }, prevState);

    expect(counts()).to.deep.equal({ rerenderCalls: 1, getEditorCalls: 0 });
    expect(rerenderDetails()).to.deep.include({
      previousDoc: prevState.doc,
      doc: nextState.doc,
    });
    expect(rerenderDetails().changes).to.have.lengthOf(1);
    expect(rerenderDetails().changes[0]).to.include({ type: 'attrs', pos: 0, nodeType: 'heading' });
  });

  it('a plain text edit inside a heading still takes the lightweight getEditor path', () => {
    const { plugin, prevState, counts } = setupHeading(2);
    const tr = prevState.tr.insertText('!', 1);
    const nextState = prevState.apply(tr);

    plugin.spec.view().update({ state: nextState }, prevState);

    expect(counts()).to.deep.equal({ rerenderCalls: 0, getEditorCalls: 1 });
  });

  it('uses the inline path when undo restores text inside a retained empty heading', () => {
    const { plugin, prevState, counts } = setupHeading(2);
    const pluginView = plugin.spec.view();
    const cut = prevState.tr.delete(1, prevState.doc.firstChild.nodeSize - 1);
    const cutState = prevState.apply(cut);
    expect(cutState.doc.firstChild.type.name).to.equal('heading');
    expect(cutState.doc.firstChild.content.size).to.equal(0);
    pluginView.update({ state: cutState }, prevState);
    expect(counts()).to.deep.equal({ rerenderCalls: 1, getEditorCalls: 0 });

    const restoredState = cutState.apply(
      cutState.tr.step(cut.steps[0].invert(prevState.doc))
        .setMeta(ySyncPluginKey, { isChangeOrigin: true, isUndoRedoOperation: true }),
    );
    pluginView.update({ state: restoredState }, cutState);

    expect(restoredState.doc.eq(prevState.doc)).to.equal(true);
    expect(counts()).to.deep.equal({ rerenderCalls: 1, getEditorCalls: 1 });
  });

  it('rerenders when undo restores a removed top-level heading', () => {
    const heading = docWithHeading('Title').firstChild;
    const paragraph = docWithParagraph('Body').firstChild;
    const { plugin, prevState, counts } = setup(
      schema.nodes.doc.create(null, [heading, paragraph]),
    );
    const pluginView = plugin.spec.view();
    const cut = prevState.tr.delete(0, heading.nodeSize);
    const cutState = prevState.apply(cut);
    expect(cutState.doc.childCount).to.equal(1);
    expect(cutState.doc.firstChild.eq(paragraph)).to.equal(true);
    pluginView.update({ state: cutState }, prevState);
    expect(counts()).to.deep.equal({ rerenderCalls: 1, getEditorCalls: 0 });

    const restoredState = cutState.apply(
      cutState.tr.step(cut.steps[0].invert(prevState.doc))
        .setMeta(ySyncPluginKey, { isChangeOrigin: true, isUndoRedoOperation: true }),
    );
    pluginView.update({ state: restoredState }, cutState);

    expect(restoredState.doc.eq(prevState.doc)).to.equal(true);
    expect(counts()).to.deep.equal({ rerenderCalls: 2, getEditorCalls: 0 });
  });

  it('rerenders when undo restores a heading replaced by an empty paragraph', () => {
    const { plugin, prevState, counts } = setupHeading(2);
    const pluginView = plugin.spec.view();
    const emptyParagraph = schema.nodes.paragraph.create();
    const cut = prevState.tr.replaceWith(0, prevState.doc.content.size, emptyParagraph);
    const cutState = prevState.apply(cut);
    pluginView.update({ state: cutState }, prevState);
    expect(counts()).to.deep.equal({ rerenderCalls: 1, getEditorCalls: 0 });

    const restoredState = cutState.apply(
      cutState.tr.step(cut.steps[0].invert(prevState.doc))
        .setMeta(ySyncPluginKey, { isChangeOrigin: true, isUndoRedoOperation: true }),
    );
    pluginView.update({ state: restoredState }, cutState);

    expect(restoredState.doc.eq(prevState.doc)).to.equal(true);
    expect(counts()).to.deep.equal({ rerenderCalls: 2, getEditorCalls: 0 });
  });

  it('reports the accumulated diff when updates are coalesced', () => {
    const { plugin, prevState, rerenderDetails } = setupHeading(2);
    const intermediateState = prevState.apply(
      prevState.tr.setNodeMarkup(0, undefined, { level: 3 }),
    );
    const documentState = intermediateState.apply(
      intermediateState.tr.setNodeMarkup(0, undefined, { level: 4 }),
    );
    const nextState = documentState.apply(documentState.tr.setMeta('test', true));

    plugin.spec.view().update({ state: nextState }, prevState);

    expect(rerenderDetails().changes).to.have.lengthOf(1);
    expect(rerenderDetails().changes[0]).to.deep.include({
      type: 'attrs',
      pos: 0,
      nodeType: 'heading',
    });
    expect(rerenderDetails().changes[0].oldAttrs.level).to.equal(2);
    expect(rerenderDetails().changes[0].newAttrs.level).to.equal(4);
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

  it('rerenders after deleting an image so the outline removes it', () => {
    const { plugin, prevState, counts } = setupImage('/a.png');
    const nextState = prevState.apply(prevState.tr.delete(1, 2));

    plugin.spec.view().update({ state: nextState }, prevState);

    expect(counts()).to.deep.equal({ rerenderCalls: 1, getEditorCalls: 0 });
  });

  ['', 'caption'].forEach((text) => {
    it(`rerenders image cut, undo and redo ${text ? 'alongside text' : 'in an image-only paragraph'}`, () => {
      const image = schema.nodes.image.create({ src: '/a.png' });
      const paragraph = schema.nodes.paragraph.create(null, [
        image,
        ...(text ? [schema.text(text)] : []),
      ]);
      const { plugin, prevState, counts } = setup(schema.nodes.doc.create(null, paragraph));
      const pluginView = plugin.spec.view();
      const cut = prevState.tr.delete(1, 2);
      const cutState = prevState.apply(cut);
      pluginView.update({ state: cutState }, prevState);
      expect(counts()).to.deep.equal({ rerenderCalls: 1, getEditorCalls: 0 });

      const undoState = cutState.apply(
        cutState.tr.step(cut.steps[0].invert(prevState.doc))
          .setMeta(ySyncPluginKey, { isChangeOrigin: true, isUndoRedoOperation: true }),
      );
      pluginView.update({ state: undoState }, cutState);
      expect(undoState.doc.eq(prevState.doc)).to.equal(true);
      expect(counts()).to.deep.equal({ rerenderCalls: 2, getEditorCalls: 0 });

      const redoState = undoState.apply(
        undoState.tr.step(cut.steps[0])
          .setMeta(ySyncPluginKey, { isChangeOrigin: true, isUndoRedoOperation: true }),
      );
      pluginView.update({ state: redoState }, undoState);
      expect(redoState.doc.eq(cutState.doc)).to.equal(true);
      expect(counts()).to.deep.equal({ rerenderCalls: 3, getEditorCalls: 0 });
    });
  });

  it('rerenders when inserting an image into existing text', () => {
    const { plugin, prevState, counts } = setup('caption');
    const nextState = prevState.apply(
      prevState.tr.insert(1, schema.nodes.image.create({ src: '/a.png' })),
    );

    plugin.spec.view().update({ state: nextState }, prevState);

    expect(counts()).to.deep.equal({ rerenderCalls: 1, getEditorCalls: 0 });
  });

  it('rerenders when an image is replaced with text and restored', () => {
    const { plugin, prevState, counts } = setupImage('/a.png');
    const pluginView = plugin.spec.view();
    const replacement = prevState.tr.replaceWith(1, 2, schema.text('caption'));
    const nextState = prevState.apply(replacement);
    pluginView.update({ state: nextState }, prevState);
    expect(counts()).to.deep.equal({ rerenderCalls: 1, getEditorCalls: 0 });

    const restoredState = nextState.apply(
      nextState.tr.step(replacement.steps[0].invert(prevState.doc)),
    );
    pluginView.update({ state: restoredState }, nextState);
    expect(restoredState.doc.eq(prevState.doc)).to.equal(true);
    expect(counts()).to.deep.equal({ rerenderCalls: 2, getEditorCalls: 0 });
  });

  it('rerenders after clearing an editable item so the outline removes it', () => {
    const { plugin, prevState, counts } = setup('Text');
    const nextState = prevState.apply(prevState.tr.delete(1, 5));

    plugin.spec.view().update({ state: nextState }, prevState);

    expect(counts()).to.deep.equal({ rerenderCalls: 1, getEditorCalls: 0 });
  });
});

describe('createTrackingPlugin — edit origin', () => {
  function setupOrigin() {
    const calls = [];
    const plugin = createTrackingPlugin(undefined, undefined, (data) => calls.push(data.origin));
    const state = EditorState.create({ schema, doc: docWithParagraph('hello'), plugins: [plugin] });
    const update = (prevState, ...metas) => {
      const nextState = metas.reduce(
        (current, meta) => current.apply(meta
          ? current.tr.insertText('!', 1).setMeta(ySyncPluginKey, meta)
          : current.tr.insertText('!', 1)),
        prevState,
      );
      plugin.spec.view().update({ state: nextState }, prevState);
      return nextState;
    };
    return { state, update, calls };
  }

  it('tags local edits as local', () => {
    const { state, update, calls } = setupOrigin();
    update(state, null);
    expect(calls).to.deep.equal(['local']);
  });

  it('tags collaborator edits applied through Yjs as remote', () => {
    const { state, update, calls } = setupOrigin();
    update(state, { isChangeOrigin: true });
    expect(calls).to.deep.equal(['remote']);
  });

  it('treats a local undo/redo through Yjs as local', () => {
    const { state, update, calls } = setupOrigin();
    update(state, { isChangeOrigin: true, isUndoRedoOperation: true });
    expect(calls).to.deep.equal(['local']);
  });

  it('treats a coalesced update with any local change as local, then resets', () => {
    const { state, update, calls } = setupOrigin();
    const next = update(state, { isChangeOrigin: true }, null);
    update(next, { isChangeOrigin: true });
    expect(calls).to.deep.equal(['local', 'remote']);
  });
});
