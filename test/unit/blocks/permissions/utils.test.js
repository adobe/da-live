import { expect } from '@esm-bundle/chai';

import {
  normPath,
  splitGroups,
  levelToActions,
  actionsToLevel,
  defaultPaths,
  folderRulePath,
  scopeKind,
  scopeLabel,
  buildSlots,
  siteNames,
  filterSlots,
} from '../../../../blocks/permissions/utils.js';

describe('permissions utils', () => {
  describe('normPath', () => {
    it('normalizes +** variants with no, leading, or trailing space', () => {
      expect(normPath('/s/+**')).to.equal('/s/ + **');
      expect(normPath('/s/ +**')).to.equal('/s/ + **');
      expect(normPath('/s/+ **')).to.equal('/s/ + **');
    });

    it('leaves non-wildcard paths unchanged', () => {
      expect(normPath('CONFIG')).to.equal('CONFIG');
    });

    it('passes through undefined', () => {
      expect(normPath(undefined)).to.equal(undefined);
    });
  });

  describe('splitGroups', () => {
    it('trims, drops blanks, and splits on comma', () => {
      expect(splitGroups(' a@x.com, ,b@x.com ')).to.deep.equal(['a@x.com', 'b@x.com']);
    });

    it('returns an empty array for an empty string', () => {
      expect(splitGroups('')).to.deep.equal([]);
    });
  });

  describe('actionsToLevel / levelToActions', () => {
    it('maps actions to levels', () => {
      expect(actionsToLevel('')).to.equal('none');
      expect(actionsToLevel('read')).to.equal('read');
      expect(actionsToLevel('garbage')).to.equal('none');
    });

    it('maps none back to empty actions', () => {
      expect(levelToActions('none')).to.equal('');
    });
  });

  describe('defaultPaths', () => {
    it('returns org scopes when site is null', () => {
      expect(defaultPaths(null)).to.deep.equal(['CONFIG', '/ + **']);
    });

    it('returns site scopes when site is given', () => {
      expect(defaultPaths('s')).to.deep.equal(['/s/CONFIG', '/s/ + **']);
    });
  });

  describe('folderRulePath', () => {
    it('builds a normalized folder rule path', () => {
      expect(folderRulePath('s', 'blog/drafts')).to.equal('/s/blog/drafts/ + **');
    });
  });

  describe('scopeLabel / scopeKind', () => {
    it('labels org scopes', () => {
      expect(scopeLabel('CONFIG', null)).to.equal('DA configurations');
      expect(scopeKind('CONFIG', null)).to.equal('config');
      expect(scopeLabel('/ + **', null)).to.equal('All sites');
      expect(scopeKind('/ + **', null)).to.equal('content');
    });

    it('labels site scopes', () => {
      expect(scopeLabel('/s/CONFIG', 's')).to.equal('Site configurations');
      expect(scopeKind('/s/CONFIG', 's')).to.equal('config');

      expect(scopeLabel('/s/ + **', 's')).to.equal('All site content');
      expect(scopeKind('/s/ + **', 's')).to.equal('content');

      expect(scopeLabel('/s/blog/ + **', 's')).to.equal('blog/');
      expect(scopeKind('/s/blog/ + **', 's')).to.equal('folder');

      expect(scopeLabel('/s/doc.html', 's')).to.equal('/s/doc.html');
      expect(scopeKind('/s/doc.html', 's')).to.equal('other');
    });

    it('handles regex characters in site', () => {
      expect(scopeLabel('/my.site/blog/ + **', 'my.site')).to.equal('blog/');
      expect(scopeKind('/my.site/blog/ + **', 'my.site')).to.equal('folder');

      expect(scopeKind('/myXsite/blog/ + **', 'my.site')).to.equal('other');
    });
  });

  describe('buildSlots', () => {
    it('returns the two org scopes with empty lists when there are no rules', () => {
      const slots = buildSlots([], null);
      expect(slots).to.have.lengthOf(2);
      expect(slots.map((s) => s.path)).to.deep.equal(['CONFIG', '/ + **']);
      slots.forEach((slot) => {
        expect(slot.read).to.deep.equal([]);
        expect(slot.write).to.deep.equal([]);
        expect(slot.none).to.deep.equal([]);
        expect(slot.inheritedRead).to.deep.equal([]);
        expect(slot.inheritedWrite).to.deep.equal([]);
        expect(slot.inheritedNone).to.deep.equal([]);
      });
    });

    it('groups site rules, ignores unrelated sites, dedupes already-listed members', () => {
      const rules = [
        { path: 'CONFIG', groups: 'org@x.com', actions: 'write' },
        { path: '/s/CONFIG', groups: 'me@x.com, org@x.com', actions: 'write' },
        { path: '/s/blog/ + **', groups: 'b@x.com', actions: '' },
        { path: '/other/ + **', groups: 'z@x.com', actions: 'read' },
      ];
      const slots = buildSlots(rules, 's');

      expect(slots.map((s) => s.path)).to.deep.equal(['/s/CONFIG', '/s/ + **', '/s/blog/ + **']);

      const configSlot = slots.find((s) => s.path === '/s/CONFIG');
      expect(configSlot.write).to.deep.equal(['me@x.com', 'org@x.com']);
      expect(configSlot.inheritedWrite).to.deep.equal([]);

      const blogSlot = slots.find((s) => s.path === '/s/blog/ + **');
      expect(blogSlot.none).to.deep.equal(['b@x.com']);

      expect(slots.some((s) => s.path.startsWith('/other/'))).to.be.false;
    });

    it('adds inherited members from the org /+** rule', () => {
      const rules = [{ path: '/ + **', groups: 'all@x.com', actions: 'read' }];
      const slots = buildSlots(rules, 's');
      const contentSlot = slots.find((s) => s.path === '/s/ + **');
      expect(contentSlot.inheritedRead).to.deep.equal(['all@x.com']);
    });

    it('inherits all matching org rules per level, not just the first', () => {
      const rules = [
        { path: 'CONFIG', actions: 'read', groups: 'reader@x.com' },
        { path: 'CONFIG', actions: 'write', groups: 'writer@x.com' },
        { path: '/ + **', actions: 'read', groups: 'content-reader@x.com' },
        { path: '/ + **', actions: 'write', groups: 'content-writer@x.com' },
      ];
      const slots = buildSlots(rules, 'mysite');

      const configSlot = slots.find((s) => s.path === '/mysite/CONFIG');
      expect(configSlot.inheritedRead).to.deep.equal(['reader@x.com']);
      expect(configSlot.inheritedWrite).to.deep.equal(['writer@x.com']);

      const contentSlot = slots.find((s) => s.path === '/mysite/ + **');
      expect(contentSlot.inheritedRead).to.deep.equal(['content-reader@x.com']);
      expect(contentSlot.inheritedWrite).to.deep.equal(['content-writer@x.com']);
    });

    it('merges path variants into one slot', () => {
      const rules = [
        { path: '/s/+**', groups: 'a@x.com', actions: 'write' },
        { path: '/s/ + **', groups: 'b@x.com', actions: 'write' },
      ];
      const slots = buildSlots(rules, 's');
      const contentSlots = slots.filter((s) => s.path === '/s/ + **');
      expect(contentSlots).to.have.lengthOf(1);
      expect(contentSlots[0].write).to.deep.equal(['a@x.com', 'b@x.com']);
    });

    it('marks a pending folder slot with no rule yet, and not when a rule exists', () => {
      const pendingSlots = buildSlots([], 's', 'blog');
      const pendingSlot = pendingSlots.find((s) => s.path === '/s/blog/ + **');
      expect(pendingSlot).to.exist;
      expect(pendingSlot.pending).to.be.true;

      const rules = [{ path: '/s/blog/ + **', groups: 'a@x.com', actions: 'read' }];
      const existingSlots = buildSlots(rules, 's', 'blog');
      const existingSlot = existingSlots.find((s) => s.path === '/s/blog/ + **');
      expect(existingSlot.pending).to.not.be.ok;
    });
  });

  describe('siteNames', () => {
    it('combines and dedupes the site list with sites mentioned in rules', () => {
      const rules = [{ path: '/c/ + **' }, { path: 'CONFIG' }];
      expect(siteNames(['b', 'a'], rules)).to.deep.equal(['a', 'b', 'c']);
    });
  });

  describe('filterSlots', () => {
    const slots = buildSlots([
      { path: 'CONFIG', groups: 'org@x.com', actions: 'write' },
      { path: '/s/CONFIG', groups: 'me@x.com', actions: 'write' },
      { path: '/s/blog/ + **', groups: 'blog-ed@x.com', actions: 'write' },
      { path: '/ + **', groups: 'org@x.com', actions: 'write' },
    ], 's');

    it('matches by label', () => {
      const filtered = filterSlots(slots, 'BLOG');
      expect(filtered.map((s) => s.path)).to.deep.equal(['/s/blog/ + **']);
    });

    it('matches a slot whose only hit is an inherited member', () => {
      const filtered = filterSlots(slots, 'org@');
      expect(filtered.some((s) => s.path === '/s/ + **')).to.be.true;
    });

    it('returns everything for an empty or whitespace query', () => {
      expect(filterSlots(slots, '')).to.deep.equal(slots);
      expect(filterSlots(slots, '   ')).to.deep.equal(slots);
    });
  });
});
