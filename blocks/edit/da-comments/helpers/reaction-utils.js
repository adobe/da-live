export const REACTION_EMOJIS = ['👍', '❤️', '🎉', '🚀', '🥳', '✅'];

export function hasUserReacted({ comment, emoji, userId }) {
  return comment.reactions?.[emoji]?.some((r) => r.userId === userId) || false;
}

export function toggleReaction({ ymap, threadId, emoji, user }) {
  const comment = ymap.get(threadId);
  if (!comment) return;
  const reactions = { ...(comment.reactions || {}) };
  const list = reactions[emoji] || [];
  const reacted = list.some((r) => r.userId === user.id);
  reactions[emoji] = reacted
    ? list.filter((r) => r.userId !== user.id)
    : [...list, { userId: user.id, name: user.name }];
  if (reactions[emoji].length === 0) delete reactions[emoji];
  ymap.set(threadId, { ...comment, reactions });
}

export function getReactionsList(comment) {
  if (!comment.reactions) return [];
  return Object.entries(comment.reactions)
    .filter(([, users]) => users.length > 0)
    .map(([emoji, users]) => ({ emoji, users, count: users.length }));
}
