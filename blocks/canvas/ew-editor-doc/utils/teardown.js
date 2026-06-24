export function teardownEditorDocResources({
  clearPortHandler,
  awarenessOff,
  wsProvider,
  view,
  proseEl,
  onCollabUsersCleared,
}) {
  clearPortHandler();
  if (awarenessOff) {
    awarenessOff();
  }
  if (wsProvider) {
    wsProvider.disconnect({ data: 'unmount' });
  }
  if (view) {
    view.destroy();
  }
  if (proseEl?.parentNode) {
    proseEl.remove();
  }
  onCollabUsersCleared();
}
