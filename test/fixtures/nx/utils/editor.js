export const getEditor = (opts) => globalThis.__editorMock?.(opts)
  ?? (opts.ewEnabled ? '/canvas#' : '/edit#');
