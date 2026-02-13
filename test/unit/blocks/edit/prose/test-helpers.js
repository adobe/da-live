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
 * Test helper utilities for setting up ProseMirror with y-collab plugins
 * without requiring a server connection.
 *
 * Yjs can work standalone - you only need:
 * - Y.Doc: Works without any provider
 * - Y.XmlFragment: Created from Y.Doc, works standalone
 * - Awareness: Yjs has built-in Awareness class that works without a provider
 *
 * This allows you to test ProseMirror editor code with y-collab plugins
 * in unit tests without needing WebSocket connections or servers.
 */

import {
  EditorState,
  EditorView,
  Y,
  ySyncPlugin,
  yCursorPlugin,
  yUndoPlugin,
} from 'da-y-wrapper';

/**
 * Creates a mock awareness object for testing.
 * This simulates the awareness API that yCursorPlugin expects.
 * @returns {Object} Mock awareness object
 */
export function createMockAwareness() {
  const states = new Map();
  const listeners = new Map();

  return {
    clientID: Math.floor(Math.random() * 1000000),
    getStates() {
      return states;
    },
    getLocalState() {
      return states.get(this.clientID);
    },
    setLocalStateField(field, value) {
      const current = states.get(this.clientID) || {};
      states.set(this.clientID, { ...current, [field]: value });
      this.emit('update', { added: [this.clientID], removed: [], updated: [this.clientID] });
    },
    setLocalState(state) {
      states.set(this.clientID, state);
      this.emit('update', { added: [this.clientID], removed: [], updated: [this.clientID] });
    },
    on(event, callback) {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event).push(callback);
    },
    off(event, callback) {
      const callbacks = listeners.get(event);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    },
    emit(event, data) {
      const callbacks = listeners.get(event);
      if (callbacks) {
        callbacks.forEach((cb) => cb(data));
      }
    },
  };
}

/**
 * Creates a ProseMirror editor with y-collab plugins for testing.
 * This setup works without any server connection - perfect for unit tests.
 *
 * @param {Object} options - Configuration options
 * @param {Schema} [options.schema] - ProseMirror schema (defaults to getSchema() if available)
 * @param {Array<Plugin>} [options.additionalPlugins] - Additional plugins to add
 * @param {boolean} [options.editable=true] - Whether the editor is editable
 * @param {Function} [options.dispatchTransaction] - Custom transaction dispatcher
 * @returns {Object} Object containing { view, ydoc, yXmlFragment, awareness }
 */
export async function createTestEditor({
  schema = null,
  additionalPlugins = [],
  editable = true,
  dispatchTransaction = null,
} = {}) {
  // Lazy load schema to avoid module loading issues
  let finalSchema = schema;
  if (!finalSchema) {
    const { getSchema } = await import('da-parser');
    finalSchema = getSchema();
  }
  // Create a standalone Y.Doc (no server needed)
  const ydoc = new Y.Doc();

  // Create Y.XmlFragment for ySyncPlugin (works standalone)
  const yXmlFragment = ydoc.getXmlFragment('prosemirror');

  // Create mock awareness for yCursorPlugin (works standalone)
  const awareness = createMockAwareness();

  // Set up awareness with default user state
  awareness.setLocalStateField('user', {
    color: '#000000',
    name: 'Test User',
    id: 'test-user',
  });

  // Build plugins array with y-collab plugins
  const plugins = [
    ySyncPlugin(yXmlFragment), // Works with just Y.XmlFragment, no provider needed
    yCursorPlugin(awareness), // Works with mock awareness, no provider needed
    yUndoPlugin(), // Doesn't need any provider
    ...additionalPlugins,
  ];

  // Create editor state
  const state = EditorState.create({ schema: finalSchema, plugins });

  // Create editor view
  const editorElement = document.createElement('div');
  editorElement.className = 'da-prose-mirror';
  document.body.appendChild(editorElement);

  // Use ref object to hold view and state for closure
  const viewRef = { view: null, state };

  // Build editor props
  const editorProps = {
    state,
    editable: () => editable,
  };

  // Provide a default dispatchTransaction that updates the view state
  // This is needed so that when transactions are dispatched, the view updates
  if (!dispatchTransaction) {
    editorProps.dispatchTransaction = (tr) => {
      const newState = viewRef.state.apply(tr);
      viewRef.state = newState;
      if (viewRef.view) {
        viewRef.view.updateState(newState);
      }
    };
  } else {
    editorProps.dispatchTransaction = dispatchTransaction;
  }

  const view = new EditorView(editorElement, editorProps);

  // Update the reference after view is created
  viewRef.view = view;

  return {
    view,
    ydoc,
    yXmlFragment,
    awareness,
    destroy() {
      if (view) {
        view.destroy();
      }
      if (editorElement && editorElement.parentNode) {
        editorElement.parentNode.removeChild(editorElement);
      }
    },
  };
}

/**
 * Helper to clean up editor instances after tests
 * @param {Object} editor - Editor instance returned from createTestEditor
 */
export function destroyEditor(editor) {
  if (editor && typeof editor.destroy === 'function') {
    editor.destroy();
  }
}
