// Pure helpers that derive view-model shapes from the comments store.
// No side effects, no awareness, no editor coupling.

export function computeCounts(store) {
  let active = 0;
  let resolved = 0;
  store.forEach((c) => {
    if (c.threadId != null) return;
    if (c.resolved) resolved += 1;
    else active += 1;
  });
  return { active, resolved };
}

export function buildThreadGroups({ store, attachedIds }) {
  if (!store) return { active: [], detached: [], resolved: [] };

  const roots = new Map();
  const replyGroups = new Map();

  store.forEach((comment) => {
    if (comment.threadId == null) {
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
