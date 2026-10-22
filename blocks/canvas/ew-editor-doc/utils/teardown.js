export function teardownEditorDocResources({
  clearPortHandler,
  awarenessOff,
  wsProvider,
  view,
  ydoc,
  proseEl,
  onCollabUsersCleared,
}) {
  clearPortHandler();
  if (awarenessOff) {
    awarenessOff();
  }
  if (view) {
    view.destroy();
  }
  if (wsProvider) {
    wsProvider.disconnect({ data: 'unmount' });
    wsProvider.destroy?.();
  }
  ydoc?.destroy();
  if (proseEl?.parentNode) {
    proseEl.remove();
  }
  onCollabUsersCleared();
}
