import { expect } from '@esm-bundle/chai';
import {
  DRAFT_MODES,
  makeNewDraft,
  makeReplyDraft,
  setDraftText,
  hasUnsavedText,
  shouldAdoptPendingAnchor,
} from '../../../../../../blocks/shared/comments/helpers/draft-state.js';

describe('ew-comments draft-state', () => {
  it('makeNewDraft creates a new-mode draft with the given anchor', () => {
    const anchor = { anchorType: 'text', anchorText: 'hi' };
    const draft = makeNewDraft(anchor);
    expect(draft.mode).to.equal(DRAFT_MODES.NEW);
    expect(draft.anchorData).to.equal(anchor);
    expect(draft.text).to.equal('');
  });

  it('makeReplyDraft creates a reply with the given threadId', () => {
    const draft = makeReplyDraft('t1');
    expect(draft.mode).to.equal(DRAFT_MODES.REPLY);
    expect(draft.threadId).to.equal('t1');
    expect(draft.text).to.equal('');
  });

  it('setDraftText returns null on a null draft', () => {
    expect(setDraftText(null, 'x')).to.be.null;
  });

  it('setDraftText returns a new draft preserving other fields', () => {
    const draft = makeReplyDraft('t1');
    const next = setDraftText(draft, 'reply text');
    expect(next).to.not.equal(draft);
    expect(next.mode).to.equal(DRAFT_MODES.REPLY);
    expect(next.threadId).to.equal('t1');
    expect(next.text).to.equal('reply text');
  });

  it('hasUnsavedText is false for null and whitespace-only', () => {
    expect(hasUnsavedText(null)).to.be.false;
    expect(hasUnsavedText({ text: '' })).to.be.false;
    expect(hasUnsavedText({ text: '   ' })).to.be.false;
    expect(hasUnsavedText({ text: 'x' })).to.be.true;
  });

  describe('shouldAdoptPendingAnchor', () => {
    const anchor = { anchorType: 'text', anchorText: 'hi' };

    it('is false when there is no pending anchor', () => {
      expect(shouldAdoptPendingAnchor(null, null)).to.be.false;
      expect(shouldAdoptPendingAnchor(makeReplyDraft('t1'), null)).to.be.false;
    });

    it('is true when there is no current draft', () => {
      expect(shouldAdoptPendingAnchor(null, anchor)).to.be.true;
    });

    it('replaces a stale `new` draft for a different anchor', () => {
      const stale = makeNewDraft({ anchorType: 'text', anchorText: 'old' });
      expect(shouldAdoptPendingAnchor(stale, anchor)).to.be.true;
    });

    it('keeps the existing `new` draft if the anchor is unchanged', () => {
      const draft = makeNewDraft(anchor);
      expect(shouldAdoptPendingAnchor(draft, anchor)).to.be.false;
    });

    it('does NOT clobber a reply with typed text', () => {
      const reply = setDraftText(makeReplyDraft('t1'), 'in progress');
      expect(shouldAdoptPendingAnchor(reply, anchor)).to.be.false;
    });

    it('replaces an empty reply draft (focused but never typed in)', () => {
      const reply = makeReplyDraft('t1');
      expect(shouldAdoptPendingAnchor(reply, anchor)).to.be.true;
    });
  });
});
