# Testing ProseMirror with y-collab (No Server Required)

## Overview

Yes, you can absolutely test ProseMirror editor code with y-collab plugins in unit tests **without requiring any server connection**. Yjs (the underlying library) works perfectly fine in standalone mode.

## Key Insight

The y-collab plugins (`ySyncPlugin`, `yCursorPlugin`, `yUndoPlugin`) don't actually require a `WebsocketProvider`:

- **`ySyncPlugin`**: Only needs a `Y.XmlFragment` (which can be created from a standalone `Y.Doc`)
- **`yCursorPlugin`**: Only needs an `Awareness` instance (Yjs has a built-in `Awareness` class that works standalone)
- **`yUndoPlugin`**: Doesn't need any provider at all

## Usage

Use the `createTestEditor` helper from `test-helpers.js`:

```javascript
import { createTestEditor, destroyEditor } from './test-helpers.js';

describe('My ProseMirror Tests', () => {
  let editor;

  afterEach(() => {
    destroyEditor(editor);
  });

  it('should test editor functionality', () => {
    editor = createTestEditor({
      // Optional: customize schema, plugins, etc.
      additionalPlugins: [myCustomPlugin],
      editable: true,
    });

    const { view, ydoc, yXmlFragment, awareness } = editor;

    // Test your editor code here
    const tr = view.state.tr.insertText('Hello, world!');
    view.dispatch(tr);

    expect(view.state.doc.textContent).to.include('Hello');
  });
});
```

## What Gets Created

The `createTestEditor` helper creates:

- **`view`**: A fully functional ProseMirror `EditorView` with y-collab plugins
- **`ydoc`**: A standalone `Y.Doc` (no server connection)
- **`yXmlFragment`**: A `Y.XmlFragment` used by `ySyncPlugin`
- **`awareness`**: A mock awareness object for `yCursorPlugin`
- **`destroy()`**: Method to clean up the editor

## Example Test

See `editor-with-ycollab.test.js` for a complete example of how to use this helper.

## Notes

- All Yjs operations work synchronously in standalone mode
- Changes sync between ProseMirror and Y.XmlFragment automatically via `ySyncPlugin`
- You can test collaboration features by creating multiple editor instances with shared `Y.Doc` state (using `Y.Doc` binary encoding/decoding)
- No WebSocket connections, no servers, no network calls needed!

