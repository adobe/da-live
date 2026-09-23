/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { setDaConfigs } = await import('../../../../fixtures/nx/utils/daConfig.js');
const {
  default: createStatusRegistry,
  kindForExt,
  STATES,
  STATUS_TIMEOUT_MS,
} = await import('../../../../../blocks/browse/da-list/status-registry/status-registry.js');

const PAGE = { path: '/org/site/tea.html', previewPath: '/org/site/tea', sitePath: '/tea', ext: 'html', name: 'tea' };

function libraryConfig(rows) {
  return { library: { data: rows } };
}

function statusRow(overrides = {}) {
  return {
    title: 'Request Publish',
    surface: 'status',
    label: 'Workflow',
    module: '/tools/plugins/rfp/plugin.js',
    ...overrides,
  };
}

/** Builds a registry whose modules resolve to the handles given by URL. */
function registryWith(rows, handles, opts = {}) {
  setDaConfigs([null, libraryConfig(rows)]);
  const loaded = [];
  const registry = createStatusRegistry({
    org: 'org',
    site: 'site',
    path: '/org/site',
    permissions: ['read', 'write'],
    getToken: async () => 'tok',
    loadModule: async (url) => {
      loaded.push(url);
      const entry = handles[url] ?? Object.values(handles)[0];
      if (typeof entry === 'function') return entry();
      return entry;
    },
    ...opts,
  });
  return { registry, loaded };
}

/** A module whose default export returns the given handle. */
function moduleOf(handle, onInit) {
  return {
    default: async (args) => {
      onInit?.(args);
      return handle;
    },
  };
}

describe('status registry', () => {
  afterEach(() => { setDaConfigs([]); });

  describe('kindForExt', () => {
    it('maps html to page, json to sheet, anything else to media', () => {
      expect(kindForExt('html')).to.equal('page');
      expect(kindForExt('json')).to.equal('sheet');
      expect(kindForExt('png')).to.equal('media');
    });

    it('returns null for folders and links, which never reach a plugin', () => {
      expect(kindForExt('')).to.equal(null);
      expect(kindForExt(undefined)).to.equal(null);
      expect(kindForExt('link')).to.equal(null);
    });
  });

  describe('declaration', () => {
    it('reads a status row and contributes its status', async () => {
      const { registry } = registryWith(
        [statusRow()],
        { '/x': moduleOf({ getStatus: async () => ({ state: 'pending', label: 'In Review' }) }) },
      );
      const [contribution] = await registry.getContributions(PAGE);
      expect(contribution.name).to.equal('request-publish');
      expect(contribution.heading).to.equal('Workflow');
      expect(contribution.status.label).to.equal('In Review');
    });

    it('falls back to the title when the row declares no label', async () => {
      const { registry } = registryWith(
        [statusRow({ label: '' })],
        { '/x': moduleOf({ getStatus: async () => ({ state: 'neutral', label: 'Draft' }) }) },
      );
      const [contribution] = await registry.getContributions(PAGE);
      expect(contribution.heading).to.equal('Request Publish');
    });

    it('ignores rows of another surface, rows with no module and rows with no title', async () => {
      const { registry, loaded } = registryWith(
        [
          statusRow({ surface: 'actionbar' }),
          statusRow({ title: 'Other', module: '' }),
          statusRow({ title: '' }),
        ],
        { '/x': moduleOf({ getStatus: async () => ({ state: 'neutral', label: 'Draft' }) }) },
      );
      expect(await registry.getContributions(PAGE)).to.deep.equal([]);
      expect(loaded).to.deep.equal([]);
    });

    it('dedupes by normalized name, site rows winning over org rows', async () => {
      setDaConfigs([
        libraryConfig([statusRow({ label: 'Org Workflow' })]),
        libraryConfig([statusRow({ label: 'Site Workflow' })]),
      ]);
      const registry = createStatusRegistry({
        org: 'org',
        site: 'site',
        getToken: async () => 'tok',
        loadModule: async () => moduleOf({ getStatus: async () => ({ state: 'neutral', label: 'Draft' }) }),
      });
      const contributions = await registry.getContributions(PAGE);
      expect(contributions.length).to.equal(1);
      expect(contributions[0].heading).to.equal('Site Workflow');
    });

    it('resolves a site-relative module against the aem.live host', async () => {
      const { registry, loaded } = registryWith(
        [statusRow()],
        { '/x': moduleOf({ getStatus: async () => null }) },
      );
      await registry.getContributions(PAGE);
      expect(loaded).to.deep.equal(['https://main--site--org.aem.live/tools/plugins/rfp/plugin.js']);
    });

    it('drops a row whose ref does not match the running ref', async () => {
      const { registry, loaded } = registryWith(
        [statusRow({ ref: 'feature' })],
        { '/x': moduleOf({ getStatus: async () => ({ state: 'neutral', label: 'Draft' }) }) },
      );
      expect(await registry.getContributions(PAGE)).to.deep.equal([]);
      expect(loaded).to.deep.equal([]);
    });
  });

  describe('prefilters run before import', () => {
    it('skips a row whose kinds exclude this item', async () => {
      const { registry, loaded } = registryWith(
        [statusRow({ kinds: 'sheet, media' })],
        { '/x': moduleOf({ getStatus: async () => ({ state: 'neutral', label: 'Draft' }) }) },
      );
      expect(await registry.getContributions(PAGE)).to.deep.equal([]);
      expect(loaded).to.deep.equal([]);
    });

    it('asks about pages by default', async () => {
      const { registry } = registryWith(
        [statusRow()],
        { '/x': moduleOf({ getStatus: async () => ({ state: 'neutral', label: 'Draft' }) }) },
      );
      expect((await registry.getContributions(PAGE)).length).to.equal(1);
    });

    it('skips a write-only row for a reader, without importing', async () => {
      const { registry, loaded } = registryWith(
        [statusRow({ requires: 'write' })],
        { '/x': moduleOf({ getStatus: async () => ({ state: 'neutral', label: 'Draft' }) }) },
        { permissions: ['read'] },
      );
      expect(await registry.getContributions(PAGE)).to.deep.equal([]);
      expect(loaded).to.deep.equal([]);
    });

    it('keeps a write-only row for a writer', async () => {
      const { registry } = registryWith(
        [statusRow({ requires: 'write' })],
        { '/x': moduleOf({ getStatus: async () => ({ state: 'neutral', label: 'Draft' }) }) },
      );
      expect((await registry.getContributions(PAGE)).length).to.equal(1);
    });

    it('never reaches a plugin for a folder or a link', async () => {
      const { registry, loaded } = registryWith(
        [statusRow()],
        { '/x': moduleOf({ getStatus: async () => ({ state: 'neutral', label: 'Draft' }) }) },
      );
      expect(await registry.getContributions({ ...PAGE, ext: 'link' })).to.deep.equal([]);
      expect(await registry.getContributions({ ...PAGE, ext: '' })).to.deep.equal([]);
      expect(loaded).to.deep.equal([]);
    });
  });

  describe('module lifecycle', () => {
    it('imports and inits once per module url, however many items ask', async () => {
      let inits = 0;
      const { registry, loaded } = registryWith(
        [statusRow()],
        { '/x': moduleOf({ getStatus: async () => null }, () => { inits += 1; }) },
      );
      await registry.getContributions(PAGE);
      await registry.getContributions({ ...PAGE, path: '/org/site/two.html' });
      expect(loaded.length).to.equal(1);
      expect(inits).to.equal(1);
    });

    it('hands init the context and the raw token', async () => {
      let seen;
      const { registry } = registryWith(
        [statusRow()],
        { '/x': moduleOf({ getStatus: async () => null }, (args) => { seen = args; }) },
      );
      await registry.getContributions(PAGE);
      expect(seen.token).to.equal('tok');
      expect(seen.context).to.deep.equal({ org: 'org', site: 'site', path: '/org/site', ref: 'main' });
    });

    it('hands getStatus the item and a context carrying the token', async () => {
      let seenItem;
      let seenCtx;
      const { registry } = registryWith(
        [statusRow()],
        {
          '/x': moduleOf({
            getStatus: async (item, ctx) => {
              seenItem = item;
              seenCtx = ctx;
              return null;
            },
          }),
        },
      );
      await registry.getContributions(PAGE);
      expect(seenItem.sitePath).to.equal('/tea');
      expect(seenCtx).to.deep.equal({
        org: 'org',
        site: 'site',
        path: '/org/site',
        permissions: ['read', 'write'],
        token: 'tok',
      });
    });

    it('contributes nothing, silently, for an action-bar-only handle', async () => {
      const { registry } = registryWith(
        [statusRow()],
        { '/x': moduleOf({ isEnabled: () => true }) },
      );
      expect(await registry.getContributions(PAGE)).to.deep.equal([]);
    });
  });

  describe('failure table', () => {
    it('renders nothing when the import fails', async () => {
      const { registry } = registryWith([statusRow()], { '/x': () => { throw new Error('404'); } });
      expect(await registry.getContributions(PAGE)).to.deep.equal([]);
    });

    it('renders nothing when init throws', async () => {
      const { registry } = registryWith(
        [statusRow()],
        { '/x': { default: async () => { throw new Error('boom'); } } },
      );
      expect(await registry.getContributions(PAGE)).to.deep.equal([]);
    });

    it('renders nothing when the module has no default export', async () => {
      const { registry } = registryWith([statusRow()], { '/x': { named: () => {} } });
      expect(await registry.getContributions(PAGE)).to.deep.equal([]);
    });

    it('renders nothing when getStatus returns null', async () => {
      const { registry } = registryWith(
        [statusRow()],
        { '/x': moduleOf({ getStatus: async () => null }) },
      );
      expect(await registry.getContributions(PAGE)).to.deep.equal([]);
    });

    it('renders nothing when getStatus returns a non-object', async () => {
      const { registry } = registryWith(
        [statusRow()],
        { '/x': moduleOf({ getStatus: async () => 'In Review' }) },
      );
      expect(await registry.getContributions(PAGE)).to.deep.equal([]);
    });

    it('renders nothing when the status has no usable label', async () => {
      const { registry } = registryWith(
        [statusRow()],
        { '/x': moduleOf({ getStatus: async () => ({ state: 'pending', label: '  ' }) }) },
      );
      expect(await registry.getContributions(PAGE)).to.deep.equal([]);
    });

    it('coerces an unknown state to neutral and keeps the label', async () => {
      const { registry } = registryWith(
        [statusRow()],
        { '/x': moduleOf({ getStatus: async () => ({ state: 'urgent', label: 'In Review' }) }) },
      );
      const [contribution] = await registry.getContributions(PAGE);
      expect(contribution.status.state).to.equal(STATES[0]);
      expect(contribution.status.label).to.equal('In Review');
    });

    it('kills the status surface for the session once getStatus throws', async () => {
      let calls = 0;
      const { registry } = registryWith([statusRow()], {
        '/x': moduleOf({
          getStatus: async () => {
            calls += 1;
            if (calls === 1) throw new Error('boom');
            return { state: 'pending', label: 'In Review' };
          },
        }),
      });
      expect(await registry.getContributions(PAGE)).to.deep.equal([]);
      expect(await registry.getContributions(PAGE)).to.deep.equal([]);
      expect(calls).to.equal(1);
    });

    it('kills the status surface when getStatus rejects', async () => {
      const { registry } = registryWith(
        [statusRow()],
        { '/x': moduleOf({ getStatus: () => Promise.reject(new Error('network')) }) },
      );
      expect(await registry.getContributions(PAGE)).to.deep.equal([]);
    });

    it('leaves the rest of the handle alone when the status surface dies', async () => {
      const handle = {
        isEnabled: () => true,
        getStatus: async () => { throw new Error('boom'); },
      };
      const { registry } = registryWith([statusRow()], { '/x': moduleOf(handle) });
      await registry.getContributions(PAGE);
      expect(handle.isEnabled()).to.equal(true);
    });

    it('lets one failing plugin keep another plugin rendering', async () => {
      setDaConfigs([null, libraryConfig([
        statusRow({ title: 'Bad', module: '/bad.js' }),
        statusRow({ title: 'Good', module: '/good.js', label: 'Review' }),
      ])]);
      const registry = createStatusRegistry({
        org: 'org',
        site: 'site',
        getToken: async () => 'tok',
        loadModule: async (url) => (url.endsWith('/bad.js')
          ? moduleOf({ getStatus: async () => { throw new Error('boom'); } })
          : moduleOf({ getStatus: async () => ({ state: 'positive', label: 'Approved' }) })),
      });
      const contributions = await registry.getContributions(PAGE);
      expect(contributions.length).to.equal(1);
      expect(contributions[0].heading).to.equal('Review');
    });

    it('survives a config read that errors', async () => {
      setDaConfigs([{ error: 'Error loading /org' }, { error: 'Error loading /org/site' }]);
      const registry = createStatusRegistry({ org: 'org', site: 'site', getToken: async () => 'tok' });
      expect(await registry.getContributions(PAGE)).to.deep.equal([]);
    });
  });

  describe('icon fallback chain', () => {
    async function iconFor(statusIcon, rowIcon) {
      const { registry } = registryWith(
        [statusRow({ icon: rowIcon })],
        { '/x': moduleOf({ getStatus: async () => ({ state: 'pending', label: 'In Review', icon: statusIcon }) }) },
      );
      const [contribution] = await registry.getContributions(PAGE);
      return contribution.status.icon;
    }

    it('prefers the status icon', async () => {
      expect(await iconFor('clock', 'comment')).to.equal('clock');
    });

    it('falls through to the row icon when the status names none', async () => {
      expect(await iconFor(undefined, 'comment')).to.equal('comment');
    });

    it('falls through an unknown name to the next level', async () => {
      expect(await iconFor('not-an-icon', 'comment')).to.equal('comment');
    });

    it('ends at the host default', async () => {
      expect(await iconFor(undefined, '')).to.equal('workflow');
      expect(await iconFor('not-an-icon', 'also-not-an-icon')).to.equal('workflow');
    });
  });

  describe('detail and href', () => {
    async function statusFrom(raw) {
      const { registry } = registryWith([statusRow()], { '/x': moduleOf({ getStatus: async () => raw }) });
      const [contribution] = await registry.getContributions(PAGE);
      return contribution.status;
    }

    it('keeps well-formed detail rows', async () => {
      const status = await statusFrom({
        state: 'pending',
        label: 'In Review',
        detail: [{ label: 'Approver', value: 'ana' }],
      });
      expect(status.detail).to.deep.equal([{ label: 'Approver', value: 'ana' }]);
    });

    it('drops detail rows with no label or no value', async () => {
      const status = await statusFrom({
        state: 'pending',
        label: 'In Review',
        detail: [{ label: '', value: 'ana' }, { label: 'Approver' }, 'nope'],
      });
      expect(status.detail).to.equal(undefined);
    });

    it('ignores detail that is not an array', async () => {
      const status = await statusFrom({ state: 'pending', label: 'In Review', detail: { a: 1 } });
      expect(status.detail).to.equal(undefined);
    });

    it('keeps a site-relative or https href', async () => {
      expect((await statusFrom({ state: 'pending', label: 'x', href: '/apps/inbox' })).href).to.equal('/apps/inbox');
      expect((await statusFrom({ state: 'pending', label: 'x', href: 'https://a.com/b' })).href).to.equal('https://a.com/b');
    });

    it('drops an href the host will not render', async () => {
      // eslint-disable-next-line no-script-url
      expect((await statusFrom({ state: 'pending', label: 'x', href: 'javascript:alert(1)' })).href).to.equal(undefined);
    });
  });

  describe('the budget', () => {
    it('is five seconds', () => {
      expect(STATUS_TIMEOUT_MS).to.equal(5000);
    });

    it('kills the status surface when getStatus never settles', async () => {
      const { registry } = registryWith(
        [statusRow()],
        { '/x': moduleOf({ getStatus: () => new Promise(() => {}) }) },
        { },
      );
      const clock = window.setTimeout;
      // Shorten the wait: the budget is the only timer this call arms.
      window.setTimeout = (fn) => clock(fn, 0);
      try {
        expect(await registry.getContributions(PAGE)).to.deep.equal([]);
      } finally {
        window.setTimeout = clock;
      }
    });
  });
});
