// Comments controller — view-model that sits between three peers:
//
//   commentPlugin (ProseMirror)  ←→  controller  ←→  ew-comments (Lit panel)
//                                       ↕
//                         comments-store (REST + awareness)
//
// State ownership:
//   - commentPlugin    : ephemeral editor state (ranges, panelOpen,
//                        selectedThreadId, pendingAnchor, showHighlights).
//                        Reads from the store directly to maintain its ranges.
//   - comments-store   : persistent comment data, fetched/written via REST
//   - controller       : derived view-model (counts, thread groups), pub/sub
//                        with reasons, and the public API for the panel.
//                        Composes awareness-sync and thread-grouping helpers.
//
// Two audiences:
//   - "Inward" (called by the plugin):
//       bindView, notifyDocChange, notifyPluginStateChange, setHasSelection
//   - "Outward" (called by the panel / da-content / shortcut handler):
//       getCurrentUser, on/subscribe, getThreadGroups, getAttachedThreadIds,
//       create*/delete*/resolve*, scrollToThread,
//       collapseSelection, openPanel, closePanel, requestCompose, set* …

import { TextSelection } from 'da-y-wrapper';
import {
  SET_SELECTED_THREAD,
  SET_PANEL_OPEN,
  SET_PENDING_ANCHOR,
  SET_SHOW_HIGHLIGHTS,
  commentPluginKey,
} from '../comment-plugin.js';
import { decodeAnchor, encodeAnchor, getSelectionData } from './anchor.js';
import { createAwarenessSync } from './awareness-sync.js';
import { computeCounts, buildThreadGroups } from './thread-grouping.js';

export function createCommentsController({ commentsStore: store, wsProvider }) {
  let hasSelection = false;
  let counts = store ? computeCounts(store) : { active: 0, resolved: 0 };
  let boundView = null;

  const channels = new Map();
  const emit = (reason) => {
    channels.get(reason)?.forEach((fn) => fn());
    channels.get('*')?.forEach((fn) => fn(reason));
  };

  const getPluginState = () => (
    boundView ? commentPluginKey.getState(boundView.state) : null
  );

  const dispatchPluginMeta = (meta) => {
    if (!boundView) return;
    boundView.dispatch(boundView.state.tr.setMeta(commentPluginKey, meta));
  };

  const onStoreChange = () => {
    counts = computeCounts(store);
    emit('counts');
  };

  if (store) store.observe(onStoreChange);

  const awareness = createAwarenessSync({ wsProvider, commentsStore: store });
  const { broadcastChange } = awareness;

  const controller = {
    getCurrentUser: awareness.getCurrentUser,
    onCurrentUserChange: awareness.onCurrentUserChange,

    get panelOpen() {
      return Boolean(getPluginState()?.panelOpen);
    },

    get showHighlights() {
      return Boolean(getPluginState()?.showHighlights);
    },

    get selectedThreadId() {
      return getPluginState()?.selectedThreadId ?? null;
    },

    get pendingAnchor() {
      return getPluginState()?.pendingAnchor ?? null;
    },

    get hasSelection() { return hasSelection; },

    // No store (unsaved doc) means there is nothing to fetch — treat as loaded.
    get loaded() { return store ? store.loaded : true; },

    get counts() { return counts; },

    getComment(id) { return store?.get(id); },
    getCommentCount() { return store?.size ?? 0; },

    getThreadGroups(attachedIds) {
      return buildThreadGroups({ store, attachedIds });
    },

    findThreadForComment(commentId) {
      const entry = store?.get(commentId);
      if (!entry) return null;
      return entry.threadId ?? commentId;
    },

    getAttachedThreadIds() {
      if (!boundView || !store) return null;
      const ids = new Set();
      store.forEach((comment, id) => {
        if (comment.threadId != null || comment.resolved) return;
        const range = decodeAnchor({ anchor: comment, state: boundView.state });
        if (range) ids.add(id);
      });
      return ids;
    },

    async createRootComment({ user, anchor, body, now = Date.now() }) {
      const id = crypto.randomUUID();
      await store.set(id, {
        id,
        threadId: null,
        ...anchor,
        author: user,
        body,
        createdAt: now,
        resolved: false,
        resolvedBy: null,
        resolvedAt: null,
      });
      broadcastChange();
      return id;
    },

    async createReply({ threadId, user, body, now = Date.now() }) {
      const id = crypto.randomUUID();
      await store.set(id, {
        id,
        threadId,
        author: user,
        body,
        createdAt: now,
      });
      broadcastChange();
      return id;
    },

    async resolveThread({ threadId, user, now = Date.now() }) {
      const comment = store.get(threadId);
      if (!comment) return;
      await store.set(threadId, {
        ...comment,
        resolved: true,
        resolvedBy: { id: user.id, name: user.name },
        resolvedAt: now,
        reopenedBy: null,
        reopenedAt: null,
      });
      broadcastChange();
    },

    async unresolveThread({ threadId, user, now = Date.now() }) {
      const comment = store.get(threadId);
      if (!comment) return;
      await store.set(threadId, {
        ...comment,
        resolved: false,
        resolvedBy: null,
        resolvedAt: null,
        reopenedBy: { id: user.id, name: user.name },
        reopenedAt: now,
      });
      broadcastChange();
    },

    async deleteComment({ commentId }) {
      const comment = store.get(commentId);
      if (!comment) return;
      if (comment.threadId == null) {
        const replyIds = [];
        store.forEach((entry, id) => {
          if (entry.threadId === commentId) replyIds.push(id);
        });
        await store.deleteBatch([...replyIds, commentId]);
      } else {
        await store.delete(commentId);
      }
      broadcastChange();
    },

    scrollToThread(threadId, { behavior = 'smooth' } = {}) {
      if (!boundView || boundView.isDestroyed || !threadId || !store) return;
      const comment = store.get(threadId);
      if (!comment) return;
      const range = decodeAnchor({ anchor: comment, state: boundView.state });
      if (!range) return;
      const { anchorType } = comment;
      const isTableOrImage = anchorType === 'table' || anchorType === 'image';
      let targetEl = null;
      if (isTableOrImage) {
        targetEl = boundView.nodeDOM(range.from);
      } else {
        const { node } = boundView.domAtPos(range.from);
        targetEl = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      }
      targetEl?.scrollIntoView({ behavior, block: 'center' });
    },

    collapseSelection() {
      if (!boundView || boundView.isDestroyed) return;
      const { state } = boundView;
      if (state.selection.empty) return;
      const { to } = state.selection;
      boundView.dispatch(state.tr.setSelection(TextSelection.create(state.doc, to)));
    },

    notifyDocChange() {
      emit('docChange');
    },

    notifyPluginStateChange(prev, next) {
      if (!next) return;
      const prevPanel = prev?.panelOpen ?? false;
      const prevThread = prev?.selectedThreadId ?? null;
      const prevAnchor = prev?.pendingAnchor ?? null;
      const prevShow = prev?.showHighlights ?? false;

      if (prevPanel !== next.panelOpen) emit('panelOpen');
      if (prevShow !== next.showHighlights) emit('showHighlights');
      if (prevThread !== next.selectedThreadId) emit('selectedThreadId');
      if (prevAnchor !== next.pendingAnchor) emit('pendingAnchor');
    },

    bindView(view) {
      boundView = view;
    },

    setPanelOpen(open) {
      const next = Boolean(open);
      const ps = getPluginState();
      if (ps && ps.panelOpen === next) return;
      dispatchPluginMeta({ type: SET_PANEL_OPEN, payload: next });
    },

    setShowHighlights(show) {
      const next = Boolean(show);
      const ps = getPluginState();
      if (ps && ps.showHighlights === next) return;
      dispatchPluginMeta({ type: SET_SHOW_HIGHLIGHTS, payload: next });
    },

    setSelectedThread(id) {
      const next = id ?? null;
      const ps = getPluginState();
      if (ps && ps.selectedThreadId === next) return;
      dispatchPluginMeta({ type: SET_SELECTED_THREAD, payload: next });
    },

    setPendingAnchor(anchor) {
      const next = anchor ?? null;
      const ps = getPluginState();
      if (ps && ps.pendingAnchor === next) return;
      dispatchPluginMeta({ type: SET_PENDING_ANCHOR, payload: next });
    },

    clearPendingAnchor() {
      this.setPendingAnchor(null);
    },

    setHasSelection(next) {
      const value = Boolean(next);
      if (value === hasSelection) return;
      hasSelection = value;
      emit('hasSelection');
    },

    openPanel({ pendingAnchor: anchor = null } = {}) {
      if (!boundView) return;
      const batch = [];
      if (anchor != null) {
        batch.push({ type: SET_SELECTED_THREAD, payload: null });
      }
      batch.push(
        { type: SET_PANEL_OPEN, payload: true },
        { type: SET_PENDING_ANCHOR, payload: anchor },
      );
      dispatchPluginMeta({ batch });
    },

    closePanel() {
      dispatchPluginMeta({
        batch: [
          { type: SET_PANEL_OPEN, payload: false },
          { type: SET_SELECTED_THREAD, payload: null },
          { type: SET_PENDING_ANCHOR, payload: null },
        ],
      });
    },

    requestCompose() {
      if (!boundView) return;
      const selectionData = getSelectionData(boundView.state);
      const anchor = selectionData
        ? encodeAnchor({ selectionData, state: boundView.state })
        : null;
      this.openPanel({ pendingAnchor: anchor });
    },

    on(reason, fn) {
      if (!channels.has(reason)) channels.set(reason, new Set());
      channels.get(reason).add(fn);
      return () => channels.get(reason)?.delete(fn);
    },

    subscribe(fn) {
      const off = this.on('*', (reason) => fn({ reason }));
      fn({ reason: 'init' });
      return off;
    },

    destroy() {
      if (store) store.unobserve(onStoreChange);
      awareness.destroy();
      channels.clear();
      boundView = null;
    },
  };

  return controller;
}
