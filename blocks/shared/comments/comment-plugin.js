import {
  Plugin,
  PluginKey,
  Decoration,
  DecorationSet,
  ySyncPluginKey,
} from 'da-y-wrapper';
import { decodeAnchor } from './helpers/anchor.js';

export const commentPluginKey = new PluginKey('comments');

export const SET_RANGES = 'setRanges';
export const SET_SELECTED_THREAD = 'setSelectedThread';
export const SET_PANEL_OPEN = 'setPanelOpen';
export const SET_PENDING_ANCHOR = 'setPendingAnchor';

const emptyState = () => ({
  ranges: new Map(),
  selectedThreadId: null,
  panelOpen: false,
  pendingAnchor: null,
  needsResync: false,
});

function applyAction(prev, action) {
  switch (action.type) {
    case SET_RANGES:
      if (prev.ranges === action.payload && !prev.needsResync) return prev;
      return { ...prev, ranges: action.payload, needsResync: false };
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
    if (entry.anchorType === 'image' || entry.anchorType === 'table') {
      const from = tr.mapping.map(entry.from, -1);
      const typeName = entry.anchorType === 'image' ? 'image' : 'table';
      const node = tr.doc.nodeAt(from);
      if (node?.type.name === typeName) {
        next.set(id, { ...entry, from, to: from + node.nodeSize });
        return;
      }
    }
    const from = tr.mapping.map(entry.from, 1);
    const to = tr.mapping.map(entry.to, -1);
    if (from < to) next.set(id, { ...entry, from, to });
  });
  return next;
}

function pushAnchorDecoration(decorations, { from, to, anchorType, spec }) {
  if (anchorType === 'image' || anchorType === 'table') {
    decorations.push(Decoration.node(from, to, spec));
    return;
  }
  decorations.push(Decoration.inline(from, to, spec));
}

function computeRanges(store, state) {
  const out = new Map();
  if (!store) return out;
  store.forEach((comment, id) => {
    if (comment.threadId != null) return;
    if (comment.resolved) return;
    const range = decodeAnchor({ anchor: comment, state });
    if (range) out.set(id, { ...range, anchorType: comment.anchorType });
  });
  return out;
}

export default function commentPlugin({ controller, store }) {
  return new Plugin({
    key: commentPluginKey,

    state: {
      init() { return emptyState(); },
      apply(tr, prev, _oldState, newState) {
        const meta = tr.getMeta(commentPluginKey);
        let next = meta ? applyPluginMeta(prev, meta) : prev;

        if (!prev.panelOpen && next.panelOpen) {
          next = { ...next, ranges: computeRanges(store, newState), needsResync: false };
        } else if (tr.docChanged && next.panelOpen) {
          const yMeta = ySyncPluginKey.getState(newState);
          const mustRebuild = yMeta?.isUndoRedoOperation || yMeta?.isChangeOrigin;
          if (mustRebuild) {
            next = { ...next, ranges: computeRanges(store, newState), needsResync: false };
          } else {
            const ranges = mapRanges(next.ranges, tr);
            next = { ...next, ranges, needsResync: ranges.size < next.ranges.size };
          }
        }
        return next;
      },
    },

    view(editorView) {
      controller.bindView(editorView);

      const onStoreChange = () => {
        if (editorView.isDestroyed) return;
        if (!commentPluginKey.getState(editorView.state)?.panelOpen) return;
        const ranges = computeRanges(store, editorView.state);
        editorView.dispatch(
          editorView.state.tr.setMeta(commentPluginKey, { type: SET_RANGES, payload: ranges }),
        );
      };
      store?.observe(onStoreChange);

      return {
        update(view, prevState) {
          const prev = commentPluginKey.getState(prevState);
          const next = commentPluginKey.getState(view.state);
          controller.notifyPluginStateChange(prev, next);

          const { from, to } = view.state.selection;
          controller.setHasSelection(from !== to);

          if (view.state.doc !== prevState.doc) {
            controller.notifyDocChange();
          }

          if (next.needsResync && next.panelOpen) {
            queueMicrotask(() => {
              if (view.isDestroyed) return;
              const state = commentPluginKey.getState(view.state);
              if (!state.needsResync || !state.panelOpen) return;
              const ranges = computeRanges(store, view.state);
              view.dispatch(
                view.state.tr.setMeta(commentPluginKey, { type: SET_RANGES, payload: ranges }),
              );
            });
          }
        },
        destroy() {
          store?.unobserve(onStoreChange);
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
            ? 'ew-comment-highlight ew-comment-highlight-active'
            : 'ew-comment-highlight';
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
            spec: { class: 'ew-comment-highlight ew-comment-highlight-pending' },
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
