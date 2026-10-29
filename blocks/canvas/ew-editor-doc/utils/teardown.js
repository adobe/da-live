import { removeActiveView } from '../../../edit/prose/diff/diff-utils.js';

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
    removeActiveView(view);
    view.destroy();
  }
  if (proseEl?.parentNode) {
    proseEl.remove();
  }
  onCollabUsersCleared();
}
