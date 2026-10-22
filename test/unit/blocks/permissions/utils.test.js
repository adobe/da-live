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
  parseMembers,
  hasPermissionsSheet,
  addMembers,
  removeMember,
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

  describe('parseMembers', () => {
    it('splits on commas and newlines, trims, and dedupes', () => {
      expect(parseMembers(' a@x.com, b@x.com\nb@x.com ')).to.deep.equal(['a@x.com', 'b@x.com']);
    });

    it('returns an empty array for a blank input', () => {
      expect(parseMembers('  ')).to.deep.equal([]);
    });
  });

  describe('hasPermissionsSheet', () => {
    function makeMultiConfig() {
      return {
        ':names': ['data', 'permissions'],
        ':type': 'multi-sheet',
        ':version': 3,
        data: { total: 1, limit: 1, offset: 0, data: [{ key: 'k', value: 'v' }] },
        permissions: {
          total: 1,
          limit: 1,
          offset: 0,
          data: [{ path: '/s/ + **', groups: 'a@x.com', actions: 'write' }],
        },
      };
    }

    it('is true for a config with a permissions sheet', () => {
      expect(hasPermissionsSheet(makeMultiConfig())).to.be.true;
    });

    it('is false when there is no permissions sheet', () => {
      expect(hasPermissionsSheet({ data: {} })).to.be.false;
    });

    it('is false for null', () => {
      expect(hasPermissionsSheet(null)).to.be.false;
    });
  });

  describe('addMembers / removeMember', () => {
    function makeMultiConfig() {
      return {
        ':names': ['data', 'permissions'],
        ':type': 'multi-sheet',
        ':version': 3,
        data: { total: 1, limit: 1, offset: 0, data: [{ key: 'k', value: 'v' }] },
        permissions: {
          total: 1,
          limit: 1,
          offset: 0,
          data: [{ path: '/s/ + **', groups: 'a@x.com', actions: 'write' }],
        },
      };
    }

    it('appends a member to an existing rule without mutating the input', () => {
      const original = makeMultiConfig();
      const originalData = structuredClone(original.data);
      const { config, changed } = addMembers(original, '/s/+**', 'write', ['c@x.com']);

      expect(changed).to.be.true;
      const rule = config.permissions.data.find((r) => r.path === '/s/ + **' && r.actions === 'write');
      expect(rule.groups).to.equal('a@x.com, c@x.com');
      expect(original.permissions.data[0].groups).to.equal('a@x.com');
      expect(original.data).to.deep.equal(originalData);
      expect(config.data).to.deep.equal(originalData);
    });

    it('skips a duplicate member compared case-insensitively', () => {
      const { changed } = addMembers(makeMultiConfig(), '/s/+**', 'write', ['A@x.com']);
      expect(changed).to.be.false;
    });

    it('creates a new rule for a new path/level and updates total/limit', () => {
      const cfg = makeMultiConfig();
      const { config, changed } = addMembers(cfg, '/s/CONFIG', 'read', ['d@x.com']);

      expect(changed).to.be.true;
      expect(config.permissions.data).to.have.lengthOf(2);
      const rule = config.permissions.data.find((r) => r.path === '/s/CONFIG' && r.actions === 'read');
      expect(rule).to.deep.include({ path: '/s/CONFIG', groups: 'd@x.com', actions: 'read' });
      expect(config.permissions.total).to.equal(2);
      expect(config.permissions.limit).to.equal(2);
    });

    it('addMembers splits pasted lists into one rule, not one rule per member', () => {
      const cfg = makeMultiConfig();
      const who = parseMembers('x@x.com, y@x.com');
      const { config } = addMembers(cfg, '/s/CONFIG', 'read', who);

      const rules = config.permissions.data.filter((r) => r.path === '/s/CONFIG' && r.actions === 'read');
      expect(rules).to.have.lengthOf(1);
      expect(rules[0].groups).to.equal('x@x.com, y@x.com');
      rules[0].groups.split(', ').forEach((g) => expect(g).to.not.include(','));
    });

    it('addMembers with an empty who list is a no-op', () => {
      const { changed } = addMembers(makeMultiConfig(), '/s/CONFIG', 'read', []);
      expect(changed).to.be.false;
    });

    it('removes one member from a rule with several', () => {
      const cfg = makeMultiConfig();
      const { config, changed } = addMembers(cfg, '/s/+**', 'write', ['c@x.com']);
      const { config: after, changed: removedChanged } = removeMember(config, '/s/+**', 'write', 'a@x.com');

      expect(removedChanged).to.be.true;
      expect(changed).to.be.true;
      const rule = after.permissions.data.find((r) => r.path === '/s/ + **' && r.actions === 'write');
      expect(rule.groups).to.equal('c@x.com');
    });

    it('deletes the rule and updates total/limit when removing the last member', () => {
      const cfg = makeMultiConfig();
      const { config, changed } = removeMember(cfg, '/s/+**', 'write', 'a@x.com');

      expect(changed).to.be.true;
      expect(config.permissions.data).to.have.lengthOf(0);
      expect(config.permissions.total).to.equal(0);
      expect(config.permissions.limit).to.equal(0);
    });

    it('removes a member from every path-variant rule at once', () => {
      const cfg = makeMultiConfig();
      cfg.permissions.data = [
        { path: '/s/+**', groups: 'a@x.com, b@x.com', actions: 'write' },
        { path: '/s/ + **', groups: 'a@x.com', actions: 'write' },
      ];
      const { config, changed } = removeMember(cfg, '/s/+**', 'write', 'a@x.com');

      expect(changed).to.be.true;
      config.permissions.data.forEach((rule) => {
        expect(splitGroups(rule.groups)).to.not.include('a@x.com');
      });
    });

    it('is a no-op when the member is absent', () => {
      const { changed } = removeMember(makeMultiConfig(), '/s/+**', 'write', 'nobody@x.com');
      expect(changed).to.be.false;
    });
  });
});
