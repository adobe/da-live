import {
  Plugin,
  PluginKey,
  Decoration,
  DecorationSet,
  ySyncPluginKey,
} from 'da-y-wrapper';
import { decodeAnchor, encodeAnchor } from './helpers/anchor.js';

export const commentPluginKey = new PluginKey('comments');

export const SET_RANGES = 'setRanges';
export const SET_SELECTED_THREAD = 'setSelectedThread';
export const SET_PANEL_OPEN = 'setPanelOpen';
export const SET_PENDING_ANCHOR = 'setPendingAnchor';

export function computeRanges(ymap, state) {
  const out = new Map();
  ymap.forEach((comment, id) => {
    if (comment.parentId != null) return;
    if (comment.resolved) return;
    const range = decodeAnchor({ anchor: comment, state });
    if (range) out.set(id, { ...range, anchorType: comment.anchorType });
  });
  return out;
}

const emptyState = () => ({
  ranges: new Map(),
  selectedThreadId: null,
  panelOpen: false,
  pendingAnchor: null,
});

function applyAction(prev, action) {
  switch (action.type) {
    case SET_RANGES:
      if (prev.ranges === action.payload) return prev;
      return { ...prev, ranges: action.payload };
    case SET_SELECTED_THREAD: {
      const next = action.payload ?? null;
      if (prev.selectedThreadId === next) return prev;
      return { ...prev, selectedThreadId: next };
    }
    case SET_PANEL_OPEN: {
      const next = Boolean(action.payload);
      if (prev.panelOpen === next) return prev;
      return { ...prev, panelOpen: next };
    }
    case SET_PENDING_ANCHOR: {
      const next = action.payload ?? null;
      if (prev.pendingAnchor === next) return prev;
      return { ...prev, pendingAnchor: next };
    }
    default:
      return prev;
  }
}

function applyPluginMeta(prev, meta) {
  if (!meta) return prev;
  if (meta.batch?.length) {
    return meta.batch.reduce((p, step) => applyAction(p, step), prev);
  }
  return applyAction(prev, meta);
}

function mapRanges(prevRanges, tr) {
  const next = new Map();
  prevRanges.forEach((entry, id) => {
    const from = tr.mapping.map(entry.from, 1);
    const to = tr.mapping.map(entry.to, 1);
    if (from < to) next.set(id, { ...entry, from, to });
  });
  return next;
}

function rangesEqual(a, b) {
  if (a.size !== b.size) return false;
  let equal = true;
  a.forEach((va, id) => {
    if (!equal) return;
    const vb = b.get(id);
    if (!vb || vb.from !== va.from || vb.to !== va.to) equal = false;
  });
  return equal;
}

function pushAnchorDecoration(decorations, { from, to, anchorType, spec }) {
  if (anchorType === 'image' || anchorType === 'table') {
    decorations.push(Decoration.node(from, to, spec));
    return;
  }
  decorations.push(Decoration.inline(from, to, spec));
}

function computeRangesWithRescue({ ymap, state, mapped }) {
  const ranges = new Map();
  const rescued = [];
  ymap.forEach((comment, id) => {
    if (comment.parentId != null) return;
    if (comment.resolved) return;

    const range = decodeAnchor({ anchor: comment, state });
    if (range) {
      ranges.set(id, { ...range, anchorType: comment.anchorType });
      return;
    }

    if (comment.anchorType !== 'text' || !comment.anchorText) return;
    const mappedEntry = mapped?.get(id);
    if (!mappedEntry) return;
    const actual = state.doc.textBetween(mappedEntry.from, mappedEntry.to, ' ');
    if (actual !== comment.anchorText) return;
    const encoded = encodeAnchor({
      selectionData: {
        from: mappedEntry.from,
        to: mappedEntry.to,
        anchorType: 'text',
        anchorText: comment.anchorText,
      },
      state,
    });
    if (!encoded) return;
    ranges.set(id, { from: mappedEntry.from, to: mappedEntry.to, anchorType: 'text' });
    rescued.push({ id, entry: { ...comment, ...encoded } });
  });
  return { ranges, rescued };
}

export default function commentPlugin(controller) {
  return new Plugin({
    key: commentPluginKey,

    state: {
      init() { return emptyState(); },
      apply(tr, prev, _oldState, newState) {
        const meta = tr.getMeta(commentPluginKey);
        let next = meta ? applyPluginMeta(prev, meta) : prev;
        if (tr.docChanged) {
          const yMeta = ySyncPluginKey.getState(newState);
          const mustRebuild = yMeta?.isUndoRedoOperation || yMeta?.isChangeOrigin;
          const ranges = mustRebuild
            ? computeRanges(controller.ymap, newState)
            : mapRanges(next.ranges, tr);
          next = { ...next, ranges };
        }
        return next;
      },
    },

    view(editorView) {
      controller.bindView(editorView);

      const onYmapChange = () => {
        if (editorView.isDestroyed) return;
        const ranges = computeRanges(controller.ymap, editorView.state);
        editorView.dispatch(
          editorView.state.tr.setMeta(commentPluginKey, { type: SET_RANGES, payload: ranges }),
        );
      };
      controller.ymap.observe(onYmapChange);

      return {
        update(view, prevState) {
          const prev = commentPluginKey.getState(prevState);
          const next = commentPluginKey.getState(view.state);
          controller.notifyPluginStateChange(prev, next);

          const { from, to } = view.state.selection;
          controller.setHasSelection(from !== to);

          if (view.state.doc !== prevState.doc) {
            controller.notifyDocChange();
            const yMeta = ySyncPluginKey.getState(view.state);
            const isLocalEdit = !yMeta?.isChangeOrigin && !yMeta?.isUndoRedoOperation;
            if (isLocalEdit && next?.ranges.size > 0) {
              const { ranges: fresh, rescued } = computeRangesWithRescue({
                ymap: controller.ymap,
                state: view.state,
                mapped: next.ranges,
              });
              if (rescued.length) {
                controller.ydoc.transact(() => {
                  rescued.forEach(({ id, entry }) => controller.ymap.set(id, entry));
                });
              } else if (!rangesEqual(fresh, next.ranges)) {
                view.dispatch(view.state.tr.setMeta(commentPluginKey, {
                  type: SET_RANGES,
                  payload: fresh,
                }));
              }
            }
          }
        },
        destroy() {
          controller.ymap.unobserve(onYmapChange);
          controller.bindView(null);
        },
      };
    },

    props: {
      decorations(state) {
        const pluginState = commentPluginKey.getState(state);
        if (!pluginState.panelOpen) return DecorationSet.empty;

        const decorations = [];
        pluginState.ranges.forEach(({ from, to, anchorType }, threadId) => {
          const isSelected = threadId === pluginState.selectedThreadId;
          const cls = isSelected
            ? 'da-comment-highlight da-comment-highlight-active'
            : 'da-comment-highlight';
          pushAnchorDecoration(decorations, {
            from,
            to,
            anchorType,
            spec: { class: cls, 'data-comment-thread': threadId },
          });
        });

        const { pendingAnchor } = pluginState;
        const pendingRange = decodeAnchor({ anchor: pendingAnchor, state });
        if (pendingRange) {
          pushAnchorDecoration(decorations, {
            from: pendingRange.from,
            to: pendingRange.to,
            anchorType: pendingAnchor?.anchorType,
            spec: { class: 'da-comment-highlight da-comment-highlight-pending' },
          });
        }

        return DecorationSet.create(state.doc, decorations);
      },

      handleDOMEvents: {
        click(view, event) {
          const pluginState = commentPluginKey.getState(view.state);
          if (!pluginState.panelOpen) return false;
          const target = event.target?.closest?.('[data-comment-thread]');
          if (target) {
            controller.setSelectedThread(target.getAttribute('data-comment-thread'));
            return true;
          }
          if (pluginState.selectedThreadId) controller.setSelectedThread(null);
          return false;
        },
      },
    },
  });
}
