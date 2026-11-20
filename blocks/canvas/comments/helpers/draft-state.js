export const DRAFT_MODES = Object.freeze({ NEW: 'new', REPLY: 'reply', EDIT: 'edit' });

export function makeNewDraft(anchorData) {
  return { mode: DRAFT_MODES.NEW, anchorData, text: '', mentions: [] };
}

export function makeReplyDraft(threadId) {
  return { mode: DRAFT_MODES.REPLY, threadId, text: '', mentions: [] };
}

export function makeEditDraft(comment) {
  return {
    mode: DRAFT_MODES.EDIT,
    commentId: comment.id,
    text: comment.body ?? '',
    mentions: comment.mentions ?? [],
  };
}

export function setDraftText(draft, text) {
  if (!draft) return null;
  return { ...draft, text };
}

export function addDraftMention(draft, user) {
  if (!draft) return null;
  const mentions = draft.mentions ?? [];
  if (mentions.some((m) => m.email === user.email)) return draft;
  return { ...draft, mentions: [...mentions, { name: user.name, email: user.email }] };
}

export function hasUnsavedText(draft) {
  return Boolean(draft?.text?.trim());
}

export function shouldAdoptPendingAnchor(currentDraft, pendingAnchor) {
  if (!pendingAnchor) return false;
  if (!currentDraft) return true;
  if (currentDraft.mode === DRAFT_MODES.NEW) {
    return currentDraft.anchorData !== pendingAnchor;
  }
  return !hasUnsavedText(currentDraft);
}
