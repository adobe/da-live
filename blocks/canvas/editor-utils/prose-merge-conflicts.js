import { Plugin } from 'da-y-wrapper';
import { checkForLocNodes } from '../../edit/prose/diff/diff-utils.js';
import { debounce } from '../../edit/utils/helpers.js';

export function createMergeConflictsPlugin(onMergeConflictsChange, hostEl) {
  const debouncedCheck = debounce((view) => {
    onMergeConflictsChange?.(checkForLocNodes(view, hostEl));
  }, 500);

  return new Plugin({
    view(editorView) {
      debouncedCheck(editorView);
      return {
        update(view, prevState) {
          if (view.state.doc !== prevState.doc) debouncedCheck(view);
        },
      };
    },
  });
}
