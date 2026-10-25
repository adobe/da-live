import { expect } from '@esm-bundle/chai';
import {
  mentionQuery,
  insertMention,
  filterRoster,
  activeMentions,
  splitMentions,
} from '../../../../../../blocks/canvas/comments/helpers/mentions.js';

const alice = { name: 'Alice Smith', email: 'alice@example.com' };
const bob = { name: 'Bob Jones', email: 'bob@example.com' };

describe('mentions', () => {
  describe('mentionQuery', () => {
    it('finds the @ token before the caret', () => {
      expect(mentionQuery('hey @ali', 8)).to.deep.equal({ query: 'ali', start: 4 });
      expect(mentionQuery('@', 1)).to.deep.equal({ query: '', start: 0 });
    });

    it('ignores emails and text after whitespace', () => {
      expect(mentionQuery('mail me@x.com', 13)).to.equal(null);
      expect(mentionQuery('@ali done', 9)).to.equal(null);
    });
  });

  describe('insertMention', () => {
    it('replaces the query with the name and moves the caret', () => {
      const out = insertMention({ text: 'hey @ali now', caret: 8, user: alice });
      expect(out.text).to.equal('hey @Alice Smith  now');
      expect(out.caret).to.equal(17);
    });

    it('is a no-op without an active query', () => {
      expect(insertMention({ text: 'plain', caret: 5, user: alice })).to.deep.equal({ text: 'plain', caret: 5 });
    });
  });

  describe('filterRoster', () => {
    it('matches name or email, case-insensitively, with a limit', () => {
      expect(filterRoster([alice, bob], 'BOB')).to.deep.equal([bob]);
      expect(filterRoster([alice, bob], 'example')).to.deep.equal([alice, bob]);
      expect(filterRoster([alice, bob], '', 1)).to.deep.equal([alice]);
    });
  });

  describe('activeMentions', () => {
    it('drops mentions whose name was edited out and dedupes by email', () => {
      const text = 'ping @Alice Smith and @Alice Smith';
      expect(activeMentions(text, [alice, bob, alice])).to.deep.equal([alice]);
    });
  });

  describe('splitMentions', () => {
    it('splits a body into text and mention segments', () => {
      const body = 'hi @Alice Smith, cc @Bob Jones';
      expect(splitMentions(body, [alice, bob])).to.deep.equal([
        { text: 'hi ' },
        { mention: alice },
        { text: ', cc ' },
        { mention: bob },
      ]);
    });

    it('returns plain text when there are no mentions', () => {
      expect(splitMentions('just text', [])).to.deep.equal([{ text: 'just text' }]);
      expect(splitMentions('@Alice Smith', undefined)).to.deep.equal([{ text: '@Alice Smith' }]);
    });
  });
});
