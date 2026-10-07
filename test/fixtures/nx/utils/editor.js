// Mock NX /utils/editor.js for tests
// Returns the default editor (/canvas# when ewEnabled, else /edit#) unless tests override
// via globalThis.__editorMock.
export const getEditor = (opts) => globalThis.__editorMock?.(opts)
  ?? (opts.ewEnabled ? '/canvas#' : '/edit#');
