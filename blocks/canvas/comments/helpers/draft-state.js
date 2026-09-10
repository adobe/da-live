export const DRAFT_MODES = Object.freeze({ NEW: 'new', REPLY: 'reply' });

export function makeNewDraft(anchorData) {
  return { mode: DRAFT_MODES.NEW, anchorData, text: '' };
}

export function makeReplyDraft(threadId) {
  return { mode: DRAFT_MODES.REPLY, threadId, text: '' };
}

export function setDraftText(draft, text) {
  if (!draft) return null;
  return { ...draft, text };
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
