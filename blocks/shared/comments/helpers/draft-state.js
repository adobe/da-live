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

// True if the draft has user-typed content that would be lost on transition.
export function hasUnsavedText(draft) {
  return Boolean(draft?.text?.trim());
}

// Decide whether a fresh `pendingAnchor` should replace the current draft.
// Replacing a 'new' draft for a stale anchor is fine, but never silently
// clobber a 'reply' that has typed text.
export function shouldAdoptPendingAnchor(currentDraft, pendingAnchor) {
  if (!pendingAnchor) return false;
  if (!currentDraft) return true;
  if (currentDraft.mode === DRAFT_MODES.NEW) {
    return currentDraft.anchorData !== pendingAnchor;
  }
  return !hasUnsavedText(currentDraft);
}
