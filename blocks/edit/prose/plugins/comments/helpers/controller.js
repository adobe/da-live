import {
  SET_SELECTED_THREAD,
  SET_PANEL_OPEN,
  SET_PENDING_ANCHOR,
  commentPluginKey,
} from '../commentPlugin.js';
import { decodeAnchor, encodeAnchor, getSelectionData } from './anchor.js';

function computeCounts(ymap) {
  let active = 0;
  let resolved = 0;

  ymap.forEach((c) => {
    if (c.parentId != null) return;
    if (c.resolved) resolved += 1;
    else active += 1;
  });

  return { active, resolved };
}

export function createCommentsController({ ymap, ydoc, wsProvider }) {
  let hasSelection = false;
  let counts = computeCounts(ymap);
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

  const onYmapChange = () => {
    counts = computeCounts(ymap);
    emit('counts');
  };

  let detachSync = null;
  let observerAttached = false;

  const attachObserver = () => {
    ymap.observe(onYmapChange);
    observerAttached = true;
    onYmapChange();
  };

  if (wsProvider && !wsProvider.synced) {
    const handleSynced = (isSynced) => {
      if (!isSynced) return;
      wsProvider.off('synced', handleSynced);
      detachSync = null;
      attachObserver();
    };

    wsProvider.on('synced', handleSynced);
    detachSync = () => wsProvider.off('synced', handleSynced);
  } else {
    attachObserver();
  }

  return {
    get ymap() { return ymap; },
    get ydoc() { return ydoc; },
    get wsProvider() { return wsProvider; },
    get panelOpen() {
      return Boolean(getPluginState()?.panelOpen);
    },
    get selectedThreadId() {
      return getPluginState()?.selectedThreadId ?? null;
    },
    get pendingAnchor() {
      return getPluginState()?.pendingAnchor ?? null;
    },
    get hasSelection() { return hasSelection; },
    get counts() { return counts; },

    getAttachedThreadIds() {
      if (!boundView) return null;
      const ids = new Set();
      ymap.forEach((comment, id) => {
        if (comment.parentId != null || comment.resolved) return;
        const range = decodeAnchor({ anchor: comment, state: boundView.state });
        if (range) ids.add(id);
      });
      return ids;
    },

    scrollToThread(threadId, { behavior = 'smooth' } = {}) {
      if (!boundView || boundView.isDestroyed || !threadId) return;
      const comment = ymap.get(threadId);
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

    notifyDocChange() {
      emit('docChange');
    },

    notifyPluginStateChange(prev, next) {
      if (!next) return;
      if (!prev) {
        if (next.panelOpen) emit('panelOpen');
        if (next.selectedThreadId != null) emit('selectedThreadId');
        if (next.pendingAnchor != null) emit('pendingAnchor');
        return;
      }
      if (prev.panelOpen !== next.panelOpen) emit('panelOpen');
      if (prev.selectedThreadId !== next.selectedThreadId) emit('selectedThreadId');
      if (prev.pendingAnchor !== next.pendingAnchor) emit('pendingAnchor');
    },

    bindView(view) {
      boundView = view;
    },

    setPanelOpen(open) {
      const next = Boolean(open);
      const ps = getPluginState();
      if (ps && ps.panelOpen === next) return;
      if (!next && ps && (ps.selectedThreadId != null || ps.pendingAnchor != null)) {
        dispatchPluginMeta({
          batch: [
            { type: SET_PANEL_OPEN, payload: false },
            { type: SET_SELECTED_THREAD, payload: null },
            { type: SET_PENDING_ANCHOR, payload: null },
          ],
        });
        return;
      }
      dispatchPluginMeta({ type: SET_PANEL_OPEN, payload: next });
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
      this.setPanelOpen(false);
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
      if (detachSync) detachSync();
      if (observerAttached) ymap.unobserve(onYmapChange);
      channels.clear();
      boundView = null;
    },
  };
}
