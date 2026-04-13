export function groupCommentsByThread(commentsMap) {
  const threads = new Map();
  commentsMap?.forEach((comment) => {
    if (!comment?.threadId) return;
    if (!threads.has(comment.threadId)) threads.set(comment.threadId, []);
    threads.get(comment.threadId).push(comment);
  });
  for (const comments of threads.values()) {
    comments.sort((a, b) => a.createdAt - b.createdAt);
  }
  return threads;
}

export function getRootComment(threadComments) {
  return threadComments.find((comment) => comment.parentId === null) || threadComments[0];
}

function buildCommentBase({ author, content }) {
  const now = Date.now();

  return {
    id: crypto.randomUUID(),
    author: {
      id: author.id,
      name: author.name,
      email: author.email || '',
    },
    content,
    createdAt: now,
    updatedAt: now,
    resolved: false,
    resolvedBy: null,
    resolvedAt: null,
    reactions: {},
  };
}

export function createReply({ parentComment, author, content }) {
  const { resolved, resolvedBy, resolvedAt, ...base } = buildCommentBase({ author, content });
  return {
    ...base,
    threadId: parentComment.threadId,
    parentId: parentComment.id,
  };
}

function updateResolutionState({ comment, resolved, user }) {
  const userSummary = { id: user.id, name: user.name };
  return {
    ...comment,
    resolved,
    ...(resolved
      ? { resolvedBy: userSummary, resolvedAt: Date.now(), reopenedBy: null, reopenedAt: null }
      : { resolvedBy: null, resolvedAt: null, reopenedBy: userSummary, reopenedAt: Date.now() }
    ),
  };
}

export function markThreadResolved({ rootComment, resolver }) {
  return updateResolutionState({ comment: rootComment, resolved: true, user: resolver });
}

export function markThreadUnresolved({ rootComment, reopener }) {
  return updateResolutionState({ comment: rootComment, resolved: false, user: reopener });
}

export function buildThreadGroups({ threads, positionCache }) {
  const active = [];
  const detached = [];
  const resolved = [];

  for (const [threadId, comments] of threads.entries()) {
    const rootComment = getRootComment(comments);
    const replies = comments.filter((comment) => comment.parentId !== null);
    const isResolved = Boolean(rootComment?.resolved);
    const thread = { threadId, rootComment, replies, isDetached: false, isResolved };

    if (isResolved) {
      resolved.push(thread);
    } else {
      const range = positionCache?.get(threadId);
      if (range && range.from < range.to) {
        active.push(thread);
      } else {
        detached.push({ ...thread, isDetached: true });
      }
    }
  }

  const sortByNewest = (left, right) => right.rootComment.createdAt - left.rootComment.createdAt;
  return {
    active: active.sort(sortByNewest),
    detached: detached.sort(sortByNewest),
    resolved: resolved.sort(sortByNewest),
  };
}

export function buildNewComment({ selection, user, content }) {
  const comment = buildCommentBase({ author: user, content });

  return {
    ...comment,
    threadId: comment.id,
    parentId: null,
    selectedText: selection.selectedText,
    isImage: selection.isImage || false,
    imageRef: selection.imageRef || null,
  };
}
