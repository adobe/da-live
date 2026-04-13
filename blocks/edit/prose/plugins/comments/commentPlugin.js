import {
  Plugin,
  PluginKey,
  Decoration,
  DecorationSet,
} from 'da-y-wrapper';
import {
  findThreadAtPosition,
  hasCommentableSelection,
  canExpandForComment,
  expandAndGetSelectionData,
  resolveAllAnchors,
  buildTextSelector,
} from './helpers/anchor.js';
import { getRootComment } from './helpers/model.js';
import { getCommentsStore } from './helpers/store.js';

const commentPluginKey = new PluginKey('comments');

function buildDecorations(state, store, resolvedPositions) {
  if (!store?.state.commentsPanelOpen) return DecorationSet.empty;
  const { selectedThreadId, pendingRange } = store.state;
  const decorations = [];

  resolvedPositions.forEach((range, threadId) => {
    if (range.from >= range.to) return;
    const isSelected = threadId === selectedThreadId;
    const cls = isSelected
      ? 'da-comment-highlight da-comment-highlight-active'
      : 'da-comment-highlight';

    if (range.to - range.from === 1) {
      const node = state.doc.nodeAt(range.from);
      if (node?.type.name === 'image') {
        decorations.push(Decoration.node(range.from, range.to, { class: cls, 'data-comment-thread': threadId }));
        return;
      }
    }
    decorations.push(Decoration.inline(range.from, range.to, { class: cls, 'data-comment-thread': threadId }));
  });

  if (pendingRange && pendingRange.from < pendingRange.to) {
    decorations.push(Decoration.inline(pendingRange.from, pendingRange.to, { class: 'da-comment-highlight-pending' }));
  }

  return DecorationSet.create(state.doc, decorations);
}

function resolveAndRebuild(view) {
  if (!view || view.isDestroyed) return;
  const store = getCommentsStore();
  if (!store) return;

  const pluginState = commentPluginKey.getState(view.state);
  const threads = store.getThreadMap();
  const newResolved = new Map(pluginState.resolvedPositions);

  threads.forEach((thread, threadId) => {
    if (newResolved.has(threadId)) return;
    const root = getRootComment(thread);
    if (!root || root.resolved) return;
    const range = resolveAllAnchors({
      state: view.state,
      threads: new Map([[threadId, thread]]),
    }).get(threadId);
    if (range) newResolved.set(threadId, range);
  });

  newResolved.forEach((_, threadId) => {
    const thread = threads.get(threadId);
    if (!thread || getRootComment(thread)?.resolved) newResolved.delete(threadId);
  });

  view.dispatch(
    view.state.tr.setMeta(commentPluginKey, { type: 'SET_RESOLVED_POSITIONS', positions: newResolved }),
  );

  if (store.state.selectedThreadId && !threads.has(store.state.selectedThreadId)) {
    store.setSelectedThread(null);
  }
}

function handleClick(view, pos) {
  const store = getCommentsStore();
  if (!store?.state.commentsPanelOpen) return false;
  const { resolvedPositions } = commentPluginKey.getState(view.state);
  const threadId = findThreadAtPosition({ cache: resolvedPositions, pos }) ?? null;
  if (store.state.selectedThreadId !== threadId) store.setSelectedThread(threadId);
  return false;
}

function commentPlugin() {
  return new Plugin({
    key: commentPluginKey,

    state: {
      init() {
        return { resolvedPositions: new Map(), decos: DecorationSet.empty };
      },

      apply(tr, prev, _, newEditorState) {
        let { resolvedPositions } = prev;

        const meta = tr.getMeta(commentPluginKey);
        if (meta?.type === 'SET_RESOLVED_POSITIONS') resolvedPositions = meta.positions;

        if (tr.docChanged) {
          const mapped = new Map();
          resolvedPositions.forEach((range, threadId) => {
            const from = tr.mapping.map(range.from, 1);
            const to = tr.mapping.map(range.to, -1);
            if (from < to) mapped.set(threadId, { from, to });
          });
          resolvedPositions = mapped;
        }

        const store = getCommentsStore();
        const decos = buildDecorations(newEditorState, store, resolvedPositions);
        if (resolvedPositions === prev.resolvedPositions && decos === prev.decos) return prev;
        return { resolvedPositions, decos };
      },
    },

    view(editorView) {
      let fingerprintTimer;
      let lastFingerprintTime = 0;
      const FINGERPRINT_DEBOUNCE = 2000;
      const FINGERPRINT_MAX_DELAY = 10000;
      let lastSelKey = '';
      const store = getCommentsStore();

      store?.registerScrollHandler((threadId) => {
        if (!threadId || editorView.isDestroyed) return;
        const el = editorView.dom?.querySelector(`.da-comment-highlight[data-comment-thread="${threadId}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      store?.registerSelectionProvider(() => expandAndGetSelectionData(editorView));

      let lastPanelOpen = store?.state.commentsPanelOpen ?? false;
      let lastSelectedId = store?.state.selectedThreadId ?? null;
      let lastPending = store?.state.pendingRange ?? null;

      const unsubStore = store?.subscribe((storeState) => {
        if (editorView.isDestroyed) return;

        requestAnimationFrame(() => {
          if (!editorView.isDestroyed) resolveAndRebuild(editorView);
        });

        const changed = storeState.commentsPanelOpen !== lastPanelOpen
          || storeState.selectedThreadId !== lastSelectedId
          || storeState.pendingRange !== lastPending;
        lastPanelOpen = storeState.commentsPanelOpen;
        lastSelectedId = storeState.selectedThreadId;
        lastPending = storeState.pendingRange;
        if (changed) editorView.dispatch(editorView.state.tr);
      });

      if (store?.getThreadMap().size > 0) {
        resolveAndRebuild(editorView);
        store?.setResolvedPositions(commentPluginKey.getState(editorView.state).resolvedPositions);
      }

      function refreshFingerprints(view) {
        const threads = store?.getThreadMap() ?? new Map();
        const { resolvedPositions } = commentPluginKey.getState(view.state);
        resolvedPositions.forEach((range, threadId) => {
          const thread = threads.get(threadId);
          const root = thread ? getRootComment(thread) : null;

          if (!root || !root.selector || root.isImage) return;

          const currentText = view.state.doc.textBetween(range.from, range.to, '', '');
          const updated = buildTextSelector(view.state, range.from, range.to, currentText);
          if (!updated) return;
          const { selector: prev } = root;

          if (updated.exact === prev.exact
            && updated.prefix === prev.prefix
            && updated.suffix === prev.suffix) return;

          store?.saveComment({ ...root, selector: updated, selectedText: currentText });
        });
      }

      return {
        update(view, prevState) {
          const prev = commentPluginKey.getState(prevState);
          const next = commentPluginKey.getState(view.state);

          if (next.resolvedPositions !== prev.resolvedPositions) {
            store?.setResolvedPositions(next.resolvedPositions);
          }

          const { from, to } = view.state.selection;
          const selKey = `${from}-${to}`;

          if (selKey !== lastSelKey || next !== prev) {
            lastSelKey = selKey;
            const hasExplicitSelection = from !== to && hasCommentableSelection(view.state);
            const canAdd = hasExplicitSelection || canExpandForComment(view.state);
            store?.setSelectionInfo({ canAdd, hasExplicitSelection, focused: view.hasFocus() });
          }

          if (view.state.doc !== prevState.doc) {
            const threads = store?.getThreadMap() ?? new Map();
            if (threads.size > next.resolvedPositions.size) {
              resolveAndRebuild(view);
            }

            clearTimeout(fingerprintTimer);
            const elapsed = Date.now() - lastFingerprintTime;

            if (elapsed >= FINGERPRINT_MAX_DELAY) {
              lastFingerprintTime = Date.now();
              refreshFingerprints(view);
            } else {
              fingerprintTimer = setTimeout(() => {
                lastFingerprintTime = Date.now();
                refreshFingerprints(view);
              }, FINGERPRINT_DEBOUNCE);
            }
          }
        },
        destroy() {
          clearTimeout(fingerprintTimer);
          unsubStore?.();
          store?.registerScrollHandler(null);
          store?.registerSelectionProvider(null);
        },
      };
    },

    props: {
      decorations(state) {
        return this.getState(state).decos;
      },

      handleClick(view, pos) {
        return handleClick(view, pos);
      },

      handleDOMEvents: {
        click(view, event) {
          const img = event.target?.closest('img.da-comment-highlight');
          const store = getCommentsStore();
          if (!img || !store?.state.commentsPanelOpen) return false;
          const threadId = img.getAttribute('data-comment-thread');
          if (!threadId) return false;
          if (store.state.selectedThreadId !== threadId) store.setSelectedThread(threadId);
          return true;
        },
      },
    },
  });
}

export default commentPlugin;
