import { Plugin } from 'da-y-wrapper';
import { checkForLocNodes } from '../../edit/prose/diff/diff-utils.js';
import { canvasBus } from '../utils/canvas-bus.js';
import { getReviewSummary, hasGroupedMarkup } from './diff-review.js';
import { removeReviewBar, renderReviewBar } from './diff-review-view.js';

const CHECK_DELAY = 500; // ms

function check(view, hostEl) {
  const grouped = hasGroupedMarkup(view.state.doc);
  const hasMergeConflicts = checkForLocNodes(view, hostEl, { showDialog: !grouped });
  if (grouped) {
    const summary = getReviewSummary(view.state.doc);
    renderReviewBar(view, summary);
    canvasBus.diffReviewState.emit({ view, summary });
  } else {
    removeReviewBar(view);
  }
  return hasMergeConflicts;
}

export function createMergeConflictsPlugin(onMergeConflictsChange, hostEl) {
  let timer;
  const scheduleCheck = (view) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      onMergeConflictsChange?.(check(view, hostEl));
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
          removeReviewBar(editorView);
        },
      };
    },
  });
}
