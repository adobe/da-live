import { expect } from '@esm-bundle/chai';
import { Y } from 'da-y-wrapper';
import {
  hasUserReacted,
  toggleReaction,
  getReactionsList,
  REACTION_EMOJIS,
} from '../../../../../../blocks/edit/da-comments/helpers/reaction-utils.js';

describe('reaction-utils', () => {
  describe('REACTION_EMOJIS', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(REACTION_EMOJIS)).to.be.true;
      expect(REACTION_EMOJIS.length).to.be.greaterThan(0);
    });
  });

  describe('hasUserReacted', () => {
    it('returns true when user is in the reaction list', () => {
      const comment = { reactions: { '👍': [{ userId: 'u1', name: 'Alice' }] } };
      expect(hasUserReacted({ comment, emoji: '👍', userId: 'u1' })).to.be.true;
    });

    it('returns false when user is not in the reaction list', () => {
      const comment = { reactions: { '👍': [{ userId: 'u2', name: 'Bob' }] } };
      expect(hasUserReacted({ comment, emoji: '👍', userId: 'u1' })).to.be.false;
    });

    it('returns false when the emoji has no reactions', () => {
      expect(hasUserReacted({ comment: { reactions: {} }, emoji: '👍', userId: 'u1' })).to.be.false;
    });

    it('returns false when comment has no reactions field', () => {
      expect(hasUserReacted({ comment: {}, emoji: '👍', userId: 'u1' })).to.be.false;
    });
  });

  describe('toggleReaction', () => {
    const user = { id: 'u1', name: 'Alice' };
    let ymap;
    beforeEach(() => { ymap = new Y.Doc().getMap('comments'); });

    it('adds reaction when user has not yet reacted', () => {
      ymap.set('t', { id: 't', parentId: null, reactions: {} });
      toggleReaction({ ymap, threadId: 't', emoji: '👍', user });
      expect(ymap.get('t').reactions['👍']).to.deep.equal([{ userId: 'u1', name: 'Alice' }]);
    });

    it('removes reaction when user has already reacted', () => {
      ymap.set('t', { id: 't', parentId: null, reactions: { '👍': [{ userId: 'u1', name: 'Alice' }] } });
      toggleReaction({ ymap, threadId: 't', emoji: '👍', user });
      expect(ymap.get('t').reactions['👍']).to.be.undefined;
    });

    it('removes the emoji key entirely when the last reactor removes their reaction', () => {
      ymap.set('t', { id: 't', parentId: null, reactions: { '👍': [{ userId: 'u1', name: 'Alice' }] } });
      toggleReaction({ ymap, threadId: 't', emoji: '👍', user });
      expect(Object.keys(ymap.get('t').reactions)).to.not.include('👍');
    });

    it('preserves other users reactions when toggling off', () => {
      ymap.set('t', {
        id: 't',
        parentId: null,
        reactions: { '👍': [{ userId: 'u1', name: 'Alice' }, { userId: 'u2', name: 'Bob' }] },
      });
      toggleReaction({ ymap, threadId: 't', emoji: '👍', user });
      expect(ymap.get('t').reactions['👍']).to.deep.equal([{ userId: 'u2', name: 'Bob' }]);
    });

    it('is a no-op when the comment does not exist', () => {
      toggleReaction({ ymap, threadId: 'missing', emoji: '👍', user });
      expect(ymap.has('missing')).to.be.false;
    });
  });

  describe('getReactionsList', () => {
    it('returns a list entry per emoji with count and users', () => {
      const comment = { reactions: { '👍': [{ userId: 'u1', name: 'Alice' }] } };
      const list = getReactionsList(comment);
      expect(list.length).to.equal(1);
      expect(list[0].emoji).to.equal('👍');
      expect(list[0].count).to.equal(1);
      expect(list[0].users).to.deep.equal([{ userId: 'u1', name: 'Alice' }]);
    });

    it('filters out emojis with empty user lists', () => {
      const comment = { reactions: { '👍': [], '❤️': [{ userId: 'u1', name: 'Alice' }] } };
      expect(getReactionsList(comment).length).to.equal(1);
    });

    it('returns empty array for no reactions field', () => {
      expect(getReactionsList({}).length).to.equal(0);
    });

    it('returns empty array for empty reactions object', () => {
      expect(getReactionsList({ reactions: {} }).length).to.equal(0);
    });
  });
});
