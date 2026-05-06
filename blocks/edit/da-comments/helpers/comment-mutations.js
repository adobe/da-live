export function createRootComment({ ymap, user, anchor, body, now = Date.now() }) {
  const id = crypto.randomUUID();
  ymap.set(id, {
    id,
    threadId: id,
    parentId: null,
    ...anchor,
    author: user,
    body,
    createdAt: now,
    edited: false,
    editedAt: null,
    resolved: false,
    resolvedBy: null,
    resolvedAt: null,
    reactions: {},
  });
  return id;
}

export function createReply({ ymap, threadId, user, body, now = Date.now() }) {
  const id = crypto.randomUUID();
  ymap.set(id, {
    id,
    threadId,
    parentId: threadId,
    author: user,
    body,
    createdAt: now,
    edited: false,
    editedAt: null,
  });
  return id;
}

export function updateBody({ ymap, commentId, body, now = Date.now() }) {
  const comment = ymap.get(commentId);
  if (!comment) return;
  ymap.set(commentId, { ...comment, body, edited: true, editedAt: now });
}

export function resolveThread({ ymap, threadId, user, now = Date.now() }) {
  const comment = ymap.get(threadId);
  if (!comment) return;
  ymap.set(threadId, {
    ...comment,
    resolved: true,
    resolvedBy: { id: user.id, name: user.name },
    resolvedAt: now,
    reopenedBy: null,
    reopenedAt: null,
  });
}

export function unresolveThread({ ymap, threadId, user, now = Date.now() }) {
  const comment = ymap.get(threadId);
  if (!comment) return;
  ymap.set(threadId, {
    ...comment,
    resolved: false,
    resolvedBy: null,
    resolvedAt: null,
    reopenedBy: { id: user.id, name: user.name },
    reopenedAt: now,
  });
}

export function deleteComment({ ymap, commentId }) {
  const comment = ymap.get(commentId);
  if (!comment) return;
  if (comment.parentId == null) {
    const replyIds = [];
    ymap.forEach((entry, id) => {
      if (entry.threadId === commentId && entry.parentId) replyIds.push(id);
    });
    replyIds.forEach((id) => ymap.delete(id));
  }
  ymap.delete(commentId);
}
