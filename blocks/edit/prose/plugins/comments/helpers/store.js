import { daFetch, saveToDa } from '../../../../../shared/utils.js';
import {
  getRootComment,
  buildNewComment,
  createReply,
  markThreadResolved,
  markThreadUnresolved,
  groupCommentsByThread,
  buildThreadGroups,
} from './model.js';

function buildSidecarUrl(docName, docId) {
  if (!docName || !docId) return null;

  try {
    const url = new URL(docName);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 3) return null;
    const base = parts.slice(0, 3).join('/');
    return `${url.origin}/${base}/.da/comments/${encodeURIComponent(docId)}.json`;
  } catch {
    return null;
  }
}

export function getDefaultCommentsState() {
  return {
    selectedThreadId: null,
    selectedThread: null,
    canAddComment: false,
    hasExplicitSelection: false,
    editorFocused: false,
    commentsPanelOpen: false,
    pendingRange: null,
    threadGroups: { active: [], detached: [], resolved: [] },
  };
}

function getThreadFromCommentsMap(commentsMap, threadId) {
  if (!commentsMap) return null;
  const thread = [];

  commentsMap.forEach((comment) => {
    if (comment?.threadId === threadId) thread.push(comment);
  });

  return thread.length ? thread : null;
}

function isDesignatedWriter(awareness) {
  if (!awareness) return true;
  const clients = [...awareness.getStates().keys()].sort((a, b) => a - b);
  return clients[0] === awareness.clientID;
}

function createCommentsStore({ map, docName, docId, whenSynced, awareness }) {
  const subs = new Set();
  let commentsMap = map ?? null;
  const sidecarUrl = buildSidecarUrl(docName, docId);
  let destroyed = false;
  let writeInFlight = null;
  let writeDirty = false;

  const uiState = {
    commentsPanelOpen: false,
    selectedThreadId: null,
    pendingRange: null,
    canAddComment: false,
    hasExplicitSelection: false,
    editorFocused: false,
  };

  let resolvedPositions = new Map();

  const handlers = {
    scroll: null,
    getSelection: null,
  };

  const cache = { threadMap: null, categorizedThreads: null };

  function getThreadMap() {
    if (!cache.threadMap) {
      cache.threadMap = commentsMap ? groupCommentsByThread(commentsMap) : new Map();
    }

    return cache.threadMap;
  }

  function getCategorizedThreads() {
    if (!cache.categorizedThreads) {
      const threads = getThreadMap();
      cache.categorizedThreads = buildThreadGroups({ threads, positionCache: resolvedPositions });
    }
    return cache.categorizedThreads;
  }

  function invalidateCache() {
    cache.threadMap = null;
    cache.categorizedThreads = null;
  }

  function findThread(groups, threadId) {
    if (!threadId) return null;
    return groups.active.find((thread) => thread.threadId === threadId)
      || groups.detached.find((thread) => thread.threadId === threadId)
      || groups.resolved.find((thread) => thread.threadId === threadId)
      || null;
  }

  function computeState() {
    const groups = getCategorizedThreads();
    return {
      ...uiState,
      selectedThread: findThread(groups, uiState.selectedThreadId),
      threadGroups: groups,
    };
  }

  function notify() {
    if (destroyed) return;
    const state = computeState();
    subs.forEach((callback) => callback(state));
  }

  async function writeSidecar() {
    if (!sidecarUrl || !commentsMap) return;
    const { pathname } = new URL(sidecarUrl);
    if (!pathname.startsWith('/source/')) return;
    const comments = {};

    commentsMap.forEach((comment, commentId) => { comments[commentId] = comment; });

    await saveToDa({
      path: pathname.replace('/source', ''),
      blob: new Blob([JSON.stringify({ comments })], { type: 'application/json' }),
    });
  }

  function flushSidecar() {
    if (!sidecarUrl || !commentsMap || destroyed) return;

    if (writeInFlight) {
      writeDirty = true; return;
    }

    writeDirty = false;
    writeInFlight = writeSidecar()
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.warn('Unable to save comments sidecar.', error);
      })
      .finally(() => {
        writeInFlight = null;
        if (writeDirty && !destroyed) {
          flushSidecar();
        }
      });
  }

  async function loadSidecar() {
    if (!sidecarUrl || !commentsMap || commentsMap.size > 0) return;

    try {
      const response = await daFetch(sidecarUrl);
      if (destroyed || !commentsMap || !response.ok) {
        return;
      }

      if (commentsMap.size > 0) {
        return;
      }

      const data = await response.json();
      if (destroyed || !commentsMap || !data?.comments) {
        return;
      }

      if (commentsMap.size > 0) {
        return;
      }

      Object.values(data.comments).forEach((comment) => {
        if (!destroyed && commentsMap && comment?.id) {
          commentsMap.set(comment.id, comment);
        }
      });
    } catch {
      /* no sidecar found */
    }
  }

  let observerScheduled = false;

  const mapObserver = () => {
    if (observerScheduled) return;
    observerScheduled = true;

    queueMicrotask(() => {
      observerScheduled = false;
      if (destroyed) return;
      invalidateCache();

      if (isDesignatedWriter(awareness)) {
        flushSidecar();
      }

      notify();
    });
  };

  commentsMap?.observe(mapObserver);

  whenSynced?.then(() => loadSidecar());

  function saveComment(comment) { commentsMap?.set(comment.id, comment); }

  function deleteAllInThread(threadId) {
    if (!commentsMap) return;
    const commentIds = [];
    commentsMap.forEach((comment, commentId) => {
      if (comment?.threadId === threadId) commentIds.push(commentId);
    });
    commentIds.forEach((commentId) => commentsMap.delete(commentId));
  }

  function subscribe(callback) {
    subs.add(callback);
    callback(computeState());
    return () => subs.delete(callback);
  }

  function setCommentsPanelOpen(open) {
    if (uiState.commentsPanelOpen === open) return;
    uiState.commentsPanelOpen = open;
    if (!open) uiState.selectedThreadId = null;
    notify();
  }

  function setSelectedThread(threadId) {
    const next = threadId ?? null;
    if (uiState.selectedThreadId === next) return;
    uiState.selectedThreadId = next;
    notify();
  }

  function beginNewCommentDraft() {
    const selection = handlers.getSelection?.() ?? null;
    if (!selection) return null;
    uiState.selectedThreadId = null;
    uiState.pendingRange = (!selection.isImage && selection.from < selection.to)
      ? { from: selection.from, to: selection.to } : null;
    notify();
    return selection;
  }

  function clearPendingRange() {
    if (!uiState.pendingRange) return;
    uiState.pendingRange = null;
    notify();
  }

  function setResolvedPositions(positions) {
    resolvedPositions = positions;
    invalidateCache();
    notify();
  }

  function setSelectionInfo({ canAdd, hasExplicitSelection, focused }) {
    if (uiState.canAddComment === canAdd
      && uiState.hasExplicitSelection === hasExplicitSelection
      && uiState.editorFocused === focused) return;
    uiState.canAddComment = canAdd;
    uiState.hasExplicitSelection = hasExplicitSelection;
    uiState.editorFocused = focused;
    notify();
  }

  function registerScrollHandler(handler) {
    handlers.scroll = handler;
  }

  function registerSelectionProvider(provider) {
    handlers.getSelection = provider;
  }

  function scrollThreadIntoView(threadId) {
    handlers.scroll?.(threadId);
  }

  function getThreadIdForComment(commentId) {
    return commentsMap?.get(commentId)?.threadId ?? null;
  }

  function submitComment({ selection, user, content }) {
    const comment = buildNewComment({ selection, user, content });
    comment.selector = selection?.selector ?? null;
    saveComment(comment);
    uiState.selectedThreadId = comment.threadId;
    uiState.pendingRange = null;
    notify();
    return comment;
  }

  function submitReply({ parentId, user, content }) {
    const parent = commentsMap?.get(parentId) ?? null;
    if (!parent) return null;
    const reply = createReply({ parentComment: parent, author: user, content });
    saveComment(reply);
    return reply;
  }

  function updateComment({ commentId, changes }) {
    const comment = commentsMap?.get(commentId) ?? null;
    if (!comment) return null;
    const updated = {
      ...comment,
      ...(typeof changes?.content === 'string'
        ? { content: changes.content, updatedAt: Date.now() } : {}),
      ...(Object.hasOwn(changes ?? {}, 'reactions')
        ? { reactions: changes.reactions } : {}),
    };
    saveComment(updated);
    return updated;
  }

  function resolveThread({ threadId, user }) {
    const thread = commentsMap ? getThreadFromCommentsMap(commentsMap, threadId) : null;
    const root = thread ? getRootComment(thread) : null;
    if (!root) return null;
    saveComment(markThreadResolved({ rootComment: root, resolver: user }));
    uiState.selectedThreadId = null;
    notify();
    return root;
  }

  function unresolveThread({ threadId, user }) {
    const thread = commentsMap ? getThreadFromCommentsMap(commentsMap, threadId) : null;
    const root = thread ? getRootComment(thread) : null;
    if (!root) return null;
    saveComment(markThreadUnresolved({ rootComment: root, reopener: user }));
    return root;
  }

  function deleteThread(threadId) {
    deleteAllInThread(threadId);
    uiState.selectedThreadId = null;
    notify();
  }

  function deleteComment(commentId) {
    const comment = commentsMap?.get(commentId) ?? null;
    if (!comment) return;
    if (comment.parentId === null) { deleteThread(comment.threadId); return; }
    commentsMap?.delete(commentId);
  }

  function destroy() {
    destroyed = true;
    subs.clear();
    commentsMap?.unobserve(mapObserver);
    handlers.scroll = null;
    handlers.getSelection = null;
    commentsMap = null;
    writeInFlight = null;
    writeDirty = false;
  }

  return {
    destroy,
    get state() {
      return computeState();
    },
    subscribe,
    setCommentsPanelOpen,
    setSelectedThread,
    beginNewCommentDraft,
    clearPendingRange,
    scrollThreadIntoView,
    getThreadIdForComment,
    setResolvedPositions,
    setSelectionInfo,
    registerScrollHandler,
    registerSelectionProvider,
    getThreadMap,
    saveComment,
    submitComment,
    submitReply,
    updateComment,
    resolveThread,
    unresolveThread,
    deleteComment,
    deleteThread,
  };
}

let instance = null;

export function initCommentsStore({ map, docName, docId, whenSynced, awareness }) {
  instance?.destroy();
  instance = createCommentsStore({ map, docName, docId, whenSynced, awareness });
  return instance;
}

export function getCommentsStore() {
  return instance;
}
