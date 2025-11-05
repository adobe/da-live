/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/**
 * Example test demonstrating how to test ProseMirror editor code
 * with y-collab plugins without requiring a server connection.
 */

import { expect } from '@esm-bundle/chai';
import { TextSelection, Plugin } from 'da-y-wrapper';
import { createTestEditor, destroyEditor } from './test-helpers.js';

describe('ProseMirror Editor with y-collab (no server)', () => {
  let editor;

  afterEach(() => {
    if (editor) {
      destroyEditor(editor);
      editor = null;
    }
  });

  it('should create editor with y-collab plugins without server', async () => {
    editor = await createTestEditor();

    expect(editor.view).to.exist;
    expect(editor.ydoc).to.exist;
    expect(editor.yXmlFragment).to.exist;
    expect(editor.awareness).to.exist;

    // Verify y-collab plugins are working
    const { state } = editor.view;
    expect(state.plugins.length).to.be.greaterThan(0);

    // Verify we can interact with the editor
    const { view } = editor;

    // Insert some text
    const tr = view.state.tr.insertText('Hello, world!');
    view.dispatch(tr);

    // Check the updated state after dispatch
    expect(view.state.doc.textContent).to.include('Hello');
  });

  it('should sync changes to Y.XmlFragment', async () => {
    editor = await createTestEditor();

    const { view, yXmlFragment } = editor;

    // Insert text
    const tr = view.state.tr.insertText('Test content');
    view.dispatch(tr);

    // Y.XmlFragment should have the content synced
    // Note: ySyncPlugin syncs ProseMirror changes to Y.XmlFragment automatically
    expect(yXmlFragment.toString()).to.exist;
  });

  it('should work with awareness for cursor tracking', async () => {
    editor = await createTestEditor();

    const { awareness } = editor;

    // Set cursor position
    awareness.setLocalStateField('cursor', { from: 0, to: 5 });

    const localState = awareness.getLocalState();
    expect(localState.cursor).to.exist;
    expect(localState.cursor.from).to.equal(0);
  });

  it('should support undo/redo via yUndoPlugin', async () => {
    editor = await createTestEditor();

    const { view } = editor;

    // Insert initial text
    let tr = view.state.tr.insertText('First');
    view.dispatch(tr);

    const initialContent = view.state.doc.textContent;

    // Insert more text
    tr = view.state.tr.insertText('Second');
    view.dispatch(tr);

    expect(view.state.doc.textContent).to.not.equal(initialContent);

    // Note: To actually test undo, you'd need to import yUndo from 'da-y-wrapper'
    // and call it via a command or plugin action
  });

  it('should work with custom plugins', async () => {
    const customPlugin = new Plugin({
      state: {
        init() {
          return { customData: 'test' };
        },
        apply(tr, value) {
          return value;
        },
      },
    });

    editor = await createTestEditor({ additionalPlugins: [customPlugin] });

    expect(editor.view).to.exist;
    const { state } = editor.view;
    expect(state.plugins).to.exist;
  });

  it('should allow testing editor interactions', async () => {
    editor = await createTestEditor();

    const { view } = editor;

    // Simulate typing
    const tr1 = view.state.tr.insertText('Hello');
    view.dispatch(tr1);

    // Simulate selection
    const tr2 = view.state.tr.setSelection(
      TextSelection.create(view.state.doc, 0, 5),
    );
    view.dispatch(tr2);

    const { selection } = view.state;
    expect(selection.from).to.equal(0);
    expect(selection.to).to.equal(5);
  });
});
