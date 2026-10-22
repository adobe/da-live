import { Plugin } from 'da-y-wrapper';
import { checkForLocNodes } from '../../edit/prose/diff/diff-utils.js';

const CHECK_DELAY = 500; // ms

export function createMergeConflictsPlugin(onMergeConflictsChange, hostEl) {
  let timer;
  const scheduleCheck = (view) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      onMergeConflictsChange?.(checkForLocNodes(view, hostEl));
    }, CHECK_DELAY);
  };

  return new Plugin({
    view(editorView) {
      scheduleCheck(editorView);
      return {
        update(view, prevState) {
          if (view.state.doc !== prevState.doc) scheduleCheck(view);
        },
        // A check still pending for a page that is gone must not report its state.
        destroy() {
          clearTimeout(timer);
        },
      };
    },
  });
}
