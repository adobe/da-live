export function buildThreadGroups({ ymap, attachedIds }) {
  if (!ymap) return { active: [], detached: [], resolved: [] };

  const roots = new Map();
  const replyGroups = new Map();

  ymap.forEach((comment) => {
    if (!comment.parentId) {
      roots.set(comment.id, comment);
    } else {
      const group = replyGroups.get(comment.threadId) ?? [];
      group.push(comment);
      replyGroups.set(comment.threadId, group);
    }
  });

  const active = [];
  const detached = [];
  const resolved = [];

  roots.forEach((root) => {
    const replies = (replyGroups.get(root.id) ?? [])
      .sort((a, b) => a.createdAt - b.createdAt);

    if (root.resolved) {
      resolved.push({ ...root, replies, isDetached: false, isResolved: true });
    } else if (attachedIds == null || attachedIds.has(root.id)) {
      active.push({ ...root, replies, isDetached: false, isResolved: false });
    } else {
      detached.push({ ...root, replies, isDetached: true, isResolved: false });
    }
  });

  active.sort((a, b) => b.createdAt - a.createdAt);
  detached.sort((a, b) => b.createdAt - a.createdAt);
  resolved.sort((a, b) => b.resolvedAt - a.resolvedAt);

  return { active, detached, resolved };
}

export function findThreadIdForComment({ ymap, commentId }) {
  const entry = ymap?.get(commentId);
  if (!entry) return null;
  return entry.threadId;
}
