import { Plugin } from 'da-y-wrapper';
import { checkForLocNodes } from '../../edit/prose/diff/diff-utils.js';
import { getDiffEngine, loadDiffEngine } from '../../edit/prose/diff/diff-engine.js';
import { canvasBus } from '../utils/canvas-bus.js';
import { hasGroupedMarkup } from './diff-review.js';
import { removeReviewBar, renderReviewBar } from './diff-review-view.js';

const CHECK_DELAY = 500; // ms

let reviewing;

function endReview(view) {
  removeReviewBar(view);
  if (reviewing !== view) return;
  reviewing = undefined;
  canvasBus.diffReviewState.emit(null);
}

function summarize(doc) {
  try {
    return getDiffEngine().reviewSummary(doc);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Could not summarize the review:', error);
    return null;
  }
}

function check(view, hostEl, recheck) {
  const grouped = hasGroupedMarkup(view.state.doc);
  const engine = getDiffEngine();
  if (grouped && !engine) loadDiffEngine().then(recheck).catch(() => {});
  const summary = grouped && engine ? summarize(view.state.doc) : null;
  const showDialog = !grouped || (!!engine && !summary);
  const hasMergeConflicts = checkForLocNodes(view, hostEl, { showDialog });
  if (summary) {
    renderReviewBar(view, summary);
    reviewing = view;
    canvasBus.diffReviewState.emit({ view, summary });
  } else {
    endReview(view);
  }
  return hasMergeConflicts;
}

export function createMergeConflictsPlugin(onMergeConflictsChange, hostEl) {
  let timer;
  let destroyed = false;
  const scheduleCheck = (view) => {
    if (destroyed) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      onMergeConflictsChange?.(check(view, hostEl, () => scheduleCheck(view)));
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
          destroyed = true;
          clearTimeout(timer);
          endReview(editorView);
        },
      };
    },
  });
}
