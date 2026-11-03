import { expect } from '@esm-bundle/chai';

import {
  folderRulePath,
  scopeLabel,
  buildSlots,
  siteNames,
  filterSlots,
  parseMembers,
  hasPermissionsSheet,
  addMembers,
  removeMember,
  parseFolderPath,
  pageRulePath,
  mediaRulePath,
  parsePagePath,
  scopePaths,
  updateScope,
} from '../../../../blocks/permissions/utils.js';

describe('permissions utils', () => {
  describe('folderRulePath', () => {
    it('builds a normalized folder rule path', () => {
      expect(folderRulePath('s', 'blog/drafts')).to.equal('/s/blog/drafts/ + **');
    });
  });

  describe('pageRulePath', () => {
    it('builds a page rule path without a wildcard', () => {
      expect(pageRulePath('s', 'blog/post')).to.equal('/s/blog/post');
      expect(pageRulePath('s', 'redirects.json')).to.equal('/s/redirects.json');
    });
  });

  describe('mediaRulePath', () => {
    it('builds the rule path of the page media folder', () => {
      expect(mediaRulePath('/s/promotions')).to.equal('/s/.promotions/ + **');
      expect(mediaRulePath('/s/blog/post')).to.equal('/s/blog/.post/ + **');
    });

    it('returns null for files with an extension, which have no media folder', () => {
      expect(mediaRulePath('/s/redirects.json')).to.equal(null);
    });
  });

  describe('scopeLabel', () => {
    it('labels org scopes', () => {
      expect(scopeLabel('CONFIG', null)).to.equal('DA configurations');
      expect(scopeLabel('/ + **', null)).to.equal('All sites');
    });

    it('labels site scopes', () => {
      expect(scopeLabel('/s/CONFIG', 's')).to.equal('Site configurations');
      expect(scopeLabel('/s/ + **', 's')).to.equal('All site content');
      expect(scopeLabel('/s/blog/ + **', 's')).to.equal('blog/');
      expect(scopeLabel('/s/doc.html', 's')).to.equal('doc.html');
    });

    it('labels page scopes relative to the site', () => {
      expect(scopeLabel('/s/promotions', 's')).to.equal('promotions');
      expect(scopeLabel('/s/blog/post', 's')).to.equal('blog/post');
      expect(scopeLabel('/s/redirects.json', 's')).to.equal('redirects.json');
    });

    it('keeps the raw path for wildcard rules that are not folders', () => {
      expect(scopeLabel('/s/blog/**', 's')).to.equal('/s/blog/**');
    });

    it('handles regex characters in site', () => {
      expect(scopeLabel('/my.site/blog/ + **', 'my.site')).to.equal('blog/');
      expect(scopeLabel('/myXsite/blog/ + **', 'my.site')).to.equal('/myXsite/blog/ + **');
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
        { path: '/s/blog/ + **', groups: 'g@x.com', actions: 'garbage' },
        { path: '/other/ + **', groups: 'z@x.com', actions: 'read' },
      ];
      const slots = buildSlots(rules, 's');

      expect(slots.map((s) => s.path)).to.deep.equal(['/s/CONFIG', '/s/ + **', '/s/blog/ + **']);

      const configSlot = slots.find((s) => s.path === '/s/CONFIG');
      expect(configSlot.write).to.deep.equal(['me@x.com', 'org@x.com']);
      expect(configSlot.inheritedWrite).to.deep.equal([]);

      const blogSlot = slots.find((s) => s.path === '/s/blog/ + **');
      expect(blogSlot.none).to.deep.equal(['b@x.com', 'g@x.com']);

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
      const pendingSlots = buildSlots([], 's', '/s/blog/ + **');
      const pendingSlot = pendingSlots.find((s) => s.path === '/s/blog/ + **');
      expect(pendingSlot).to.exist;
      expect(pendingSlot.pending).to.be.true;

      const rules = [{ path: '/s/blog/ + **', groups: 'a@x.com', actions: 'read' }];
      const existingSlots = buildSlots(rules, 's', '/s/blog/ + **');
      const existingSlot = existingSlots.find((s) => s.path === '/s/blog/ + **');
      expect(existingSlot.pending).to.not.be.ok;
    });

    it('marks a pending page slot as a page', () => {
      const slot = buildSlots([], 's', '/s/promotions').find((s) => s.path === '/s/promotions');
      expect(slot).to.deep.include({ kind: 'page', label: 'promotions', pending: true });
    });

    it('groups page rules as pages and their media folder rules as folders', () => {
      const rules = [
        { path: '/s/promotions', groups: 'legal@x.com', actions: 'write' },
        { path: '/s/.promotions/+**', groups: 'legal@x.com', actions: 'write' },
      ];
      const slots = buildSlots(rules, 's');
      const page = slots.find((s) => s.path === '/s/promotions');
      expect(page).to.deep.include({ kind: 'page', label: 'promotions' });
      expect(page.write).to.deep.equal(['legal@x.com']);
      const media = slots.find((s) => s.path === '/s/.promotions/ + **');
      expect(media).to.deep.include({ kind: 'folder', label: '.promotions/' });
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

    it('returns everything for an empty, whitespace, or one-character query', () => {
      expect(filterSlots(slots, '')).to.deep.equal(slots);
      expect(filterSlots(slots, '   ')).to.deep.equal(slots);
      expect(filterSlots(slots, ' b ')).to.deep.equal(slots);
    });

    it('keeps every member of a scope whose label or path matches', () => {
      const [blog] = filterSlots(slots, 'blog/');
      expect(blog.write).to.deep.equal(['blog-ed@x.com']);
      expect(blog.hidden).to.equal(undefined);
    });

    it('keeps only matching members otherwise, and counts the hidden ones per level', () => {
      const [slot] = filterSlots(buildSlots([
        { path: '/ + **', groups: 'org@x.com, other@x.com', actions: 'write' },
        { path: '/s/ + **', groups: 'me@x.com, orgfan@x.com', actions: 'read' },
      ], 's'), 'org');
      expect(slot.path).to.equal('/s/ + **');
      expect(slot.read).to.deep.equal(['orgfan@x.com']);
      expect(slot.inheritedWrite).to.deep.equal(['org@x.com']);
      expect(slot.hidden).to.deep.equal({ read: 1, write: 1, none: 0 });
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

    it('adds a none member as a rule with empty actions', () => {
      const { config } = addMembers(makeMultiConfig(), '/s/CONFIG', 'none', ['n@x.com']);
      const rule = config.permissions.data.find((r) => r.path === '/s/CONFIG');
      expect(rule).to.deep.equal({ path: '/s/CONFIG', groups: 'n@x.com', actions: '' });
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
        expect(rule.groups.split(', ')).to.not.include('a@x.com');
      });
    });

    it('is a no-op when the member is absent', () => {
      const { changed } = removeMember(makeMultiConfig(), '/s/+**', 'write', 'nobody@x.com');
      expect(changed).to.be.false;
    });
  });

  describe('scopePaths / updateScope', () => {
    function makeConfig(data = []) {
      return { ':names': ['permissions'], permissions: { total: data.length, limit: data.length, data } };
    }
    const page = { path: '/s/promotions', kind: 'page' };

    it('pairs a page with its media folder, and leaves other scopes alone', () => {
      expect(scopePaths(page)).to.deep.equal(['/s/promotions', '/s/.promotions/ + **']);
      expect(scopePaths({ path: '/s/redirects.json', kind: 'page' })).to.deep.equal(['/s/redirects.json']);
      expect(scopePaths({ path: '/s/blog/ + **', kind: 'folder' })).to.deep.equal(['/s/blog/ + **']);
    });

    it('adds a member to the page row and its media folder row', () => {
      const { config, changed } = updateScope(makeConfig(), scopePaths(page), (c, p) => addMembers(c, p, 'write', ['legal@x.com']));
      expect(changed).to.be.true;
      expect(config.permissions.data).to.deep.equal([
        { path: '/s/promotions', groups: 'legal@x.com', actions: 'write' },
        { path: '/s/.promotions/ + **', groups: 'legal@x.com', actions: 'write' },
      ]);
      expect(config.permissions.total).to.equal(2);
    });

    it('fills in a missing media folder row when the page row already has the member', () => {
      const cfg = makeConfig([{ path: '/s/promotions', groups: 'legal@x.com', actions: 'write' }]);
      const { config, changed } = updateScope(cfg, scopePaths(page), (c, p) => addMembers(c, p, 'write', ['legal@x.com']));
      expect(changed).to.be.true;
      expect(config.permissions.data.map((r) => r.path)).to.deep.equal(['/s/promotions', '/s/.promotions/ + **']);
    });

    it('removing the last member deletes both rows', () => {
      const cfg = makeConfig([
        { path: '/s/promotions', groups: 'legal@x.com', actions: 'write' },
        { path: '/s/.promotions/+**', groups: 'legal@x.com, img@x.com', actions: 'write' },
        { path: '/s/ + **', groups: 'a@x.com', actions: 'write' },
      ]);
      const { config, changed } = updateScope(cfg, scopePaths(page), (c, p) => removeMember(c, p, 'write', 'legal@x.com'));
      expect(changed).to.be.true;
      expect(config.permissions.data).to.deep.equal([
        { path: '/s/.promotions/+**', groups: 'img@x.com', actions: 'write' },
        { path: '/s/ + **', groups: 'a@x.com', actions: 'write' },
      ]);
      expect(config.permissions.total).to.equal(2);
    });

    it('is unchanged when no row changes', () => {
      const { changed } = updateScope(makeConfig(), scopePaths(page), (c, p) => removeMember(c, p, 'write', 'x@x.com'));
      expect(changed).to.be.false;
    });
  });

  describe('parsePagePath', () => {
    it('returns the page below the site, without .html', () => {
      expect(parsePagePath('/promotions')).to.deep.equal({ page: 'promotions' });
      expect(parsePagePath('  /blog/post.html ')).to.deep.equal({ page: 'blog/post' });
      expect(parsePagePath('//blog//post')).to.deep.equal({ page: 'blog/post' });
    });

    it('keeps extensions other than .html', () => {
      expect(parsePagePath('/redirects.json')).to.deep.equal({ page: 'redirects.json' });
    });

    it('rejects a path that does not start with /', () => {
      expect(parsePagePath('about')).to.deep.equal({ error: 'Page paths start with /, e.g. /about.' });
    });

    it('rejects an empty value and the site root', () => {
      expect(parsePagePath('  ')).to.deep.equal({ error: 'Enter a page path, e.g. /about.' });
      expect(parsePagePath('/')).to.deep.equal({ error: 'Enter a page below the site root, e.g. /about.' });
      expect(parsePagePath('/.html')).to.deep.equal({ error: 'Enter a page below the site root, e.g. /about.' });
    });

    it('rejects a trailing slash', () => {
      expect(parsePagePath('/blog/')).to.deep.equal({ error: 'Page paths cannot end with /. Use Add folder for folders.' });
    });

    it('rejects traversal and wildcard segments', () => {
      const error = 'Page paths cannot contain traversal or wildcard segments.';
      expect(parsePagePath('/blog/../about')).to.deep.equal({ error });
      expect(parsePagePath('/./about')).to.deep.equal({ error });
      expect(parsePagePath('/blog/*')).to.deep.equal({ error });
      expect(parsePagePath('/blog/post*')).to.deep.equal({ error });
    });
  });

  describe('parseFolderPath', () => {
    it('accepts a path starting with / and returns the folder without outer slashes', () => {
      expect(parseFolderPath('/blog')).to.deep.equal({ folder: 'blog' });
      expect(parseFolderPath('  /blog/drafts/  ')).to.deep.equal({ folder: 'blog/drafts' });
      expect(parseFolderPath('//blog//drafts')).to.deep.equal({ folder: 'blog/drafts' });
    });

    it('rejects a path that does not start with /', () => {
      expect(parseFolderPath('blog')).to.deep.equal({ error: 'Folder paths start with /, e.g. /blog.' });
    });

    it('rejects an empty value and the site root', () => {
      expect(parseFolderPath('   ')).to.deep.equal({ error: 'Enter a folder path, e.g. /blog.' });
      expect(parseFolderPath('/')).to.deep.equal({ error: 'Enter a folder below the site root, e.g. /blog.' });
      expect(parseFolderPath('///')).to.deep.equal({ error: 'Enter a folder below the site root, e.g. /blog.' });
    });

    it('rejects traversal segments', () => {
      expect(parseFolderPath('/blog/../private')).to.deep.equal({ error: 'Folder paths cannot contain traversal or wildcard segments.' });
      expect(parseFolderPath('/blog/./drafts')).to.deep.equal({ error: 'Folder paths cannot contain traversal or wildcard segments.' });
    });

    it('rejects wildcard syntax in folder names', () => {
      expect(parseFolderPath('/blog/+**/drafts')).to.deep.equal({ error: 'Folder paths cannot contain traversal or wildcard segments.' });
      expect(parseFolderPath('/blog/*')).to.deep.equal({ error: 'Folder paths cannot contain traversal or wildcard segments.' });
    });
  });
});
