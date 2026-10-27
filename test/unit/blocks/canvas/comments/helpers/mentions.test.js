import { expect } from '@esm-bundle/chai';
import {
  mentionQuery,
  insertMention,
  filterRoster,
  activeMentions,
  splitMentions,
  emailsFromPermissions,
  buildRoster,
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

  describe('emailsFromPermissions', () => {
    it('collects unique emails from rows that grant access', () => {
      const rows = [
        { path: 'CONFIG', groups: 'Admin@Example.com', actions: 'write' },
        { path: '/ + **', groups: 'admin@example.com, bob@example.com', actions: 'read' },
        { path: '/locked/**', groups: 'carol@example.com', actions: '' },
        { path: '/x/**', groups: '613E19736765B4B80A494030/dana@example.com', actions: 'read' },
        { path: '/y/**', groups: '613E19736765B4B80A494030, 613E19736765B4B80A494030/Authors', actions: 'write' },
        { path: '', groups: '', actions: '' },
      ];
      expect(emailsFromPermissions(rows)).to.deep.equal([
        'admin@example.com', 'bob@example.com', 'dana@example.com',
      ]);
    });

    it('handles a missing sheet', () => {
      expect(emailsFromPermissions(undefined)).to.deep.equal([]);
    });
  });

  describe('buildRoster', () => {
    it('fills names from known people and sorts by name', () => {
      const people = [null, { name: 'Zed Admin', email: 'Admin@example.com' }, { name: 'No Email' }];
      expect(buildRoster(['bob@example.com', 'admin@example.com'], people)).to.deep.equal([
        { email: 'bob@example.com', name: 'bob@example.com' },
        { email: 'admin@example.com', name: 'Zed Admin' },
      ]);
    });
  });
});
