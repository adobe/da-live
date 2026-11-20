import { expect } from '@esm-bundle/chai';
import {
  partOf, editorContext, editState, mutationFor, needsSetup, inheritanceText, panelKey,
} from '../../../../blocks/config/da-config/model.js';
import { config, file, library } from '../../../../blocks/config/stores.js';

const multi = (sheets) => ({
  ...Object.fromEntries(Object.entries(sheets).map(([name, data]) => [name, { data }])),
  ':names': Object.keys(sheets),
  ':type': 'multi-sheet',
});

const settingsPanel = { kind: 'settings', fields: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }] };
const rowsPanel = { kind: 'rows', idKey: 'title', columns: [{ key: 'title', label: 'Title' }] };
const partsPanel = {
  parts: [
    { id: 'settings', name: 'Settings', ...settingsPanel },
    { id: 'list', name: 'List', ...rowsPanel },
  ],
};

const section = (store, panel) => ({ id: 's', label: 'S', store, panel });
const ctxFor = (store, panel, opts = {}) => editorContext({
  section: section(store, panel),
  partId: null,
  atSite: false,
  configs: { org: null, site: null },
  file: null,
  ...opts,
});

describe('config editor model', () => {
  describe('partOf', () => {
    it('picks the selected part, the first part, or none', () => {
      expect(partOf(partsPanel, 'list').id).to.equal('list');
      expect(partOf(partsPanel, 'unknown').id).to.equal('settings');
      expect(partOf(partsPanel, null).id).to.equal('settings');
      expect(partOf(settingsPanel, 'list')).to.equal(null);
    });
  });

  it('keys a panel by section and part', () => {
    expect(panelKey({ section: { id: 's' }, part: null })).to.equal('s/');
    expect(panelKey({ section: { id: 's' }, part: { id: 'p' } })).to.equal('s/p');
  });

  describe('editorContext', () => {
    const org = multi({ data: [{ key: 'a', value: 'org' }] });
    const site = multi({ data: [{ key: 'a', value: 'site' }] });
    const configs = { org, site };

    it('edits the org config at org scope', () => {
      const ctx = ctxFor(config('data'), settingsPanel, { configs });
      expect([ctx.own, ctx.inherited, ctx.sheet, ctx.ready]).to.deep.equal([org, null, 'data', true]);
    });

    it('layers the site config over the org at site scope', () => {
      const ctx = ctxFor(config('data'), settingsPanel, { configs, atSite: true });
      expect([ctx.own, ctx.inherited]).to.deep.equal([site, org]);
    });

    it('does not layer sheets read from the site only', () => {
      const ctx = ctxFor(config('apps', { inherit: false }), rowsPanel, { configs, atSite: true });
      expect([ctx.own, ctx.inherited]).to.deep.equal([site, null]);
    });

    it('edits a file once read, with the part tab as sheet', () => {
      const json = multi({ list: [] });
      const store = file('/f.json', { settings: 'config', list: 'list' });
      const loading = ctxFor(store, partsPanel, { atSite: true, configs, file: { status: 'loading' } });
      expect([loading.ready, loading.own, loading.inherited]).to.deep.equal([false, null, null]);
      const ctx = ctxFor(store, partsPanel, { atSite: true, configs, partId: 'list', file: { status: 'ok', json } });
      expect([ctx.ready, ctx.own, ctx.sheet, ctx.part.id, ctx.panel.kind]).to.deep.equal([true, json, 'list', 'list', 'rows']);
    });

    it('edits a library list in its first sheet', () => {
      const json = multi({ blocks: [], options: [] });
      const ctx = ctxFor(library('Blocks'), rowsPanel, { atSite: true, file: { status: 'ok', json } });
      expect(ctx.sheet).to.equal('blocks');
    });
  });

  describe('editState', () => {
    it('counts settings edits and flags invalid values', () => {
      const panel = { kind: 'settings', fields: [{ key: 'a', label: 'A', validate: (v) => (v === 'x' ? 'bad' : null) }] };
      const ctx = ctxFor(config('data'), panel);
      const clean = editState(ctx, { edits: {}, rows: null });
      expect([clean.dirty, clean.invalid]).to.deep.equal([false, false]);
      const one = editState(ctx, { edits: { a: 'ok' }, rows: null });
      expect([one.dirty, one.label]).to.deep.equal([true, '1 unsaved change']);
      expect(editState(ctx, { edits: { a: 'x' }, rows: null }).invalid).to.equal(true);
    });

    it('compares pending rows with the saved list', () => {
      const own = multi({ apps: [{ title: 'A' }] });
      const ctx = ctxFor(config('apps'), rowsPanel, { configs: { org: own, site: null } });
      expect(editState(ctx, { edits: {}, rows: null }).list.rows).to.deep.equal([{ title: 'A' }]);
      const edit = editState(ctx, { edits: {}, rows: [] });
      expect([edit.dirty, edit.label, edit.invalid]).to.deep.equal([true, 'Unsaved changes', false]);
    });
  });

  describe('mutationFor', () => {
    it('writes a field stored in another sheet there, keeping that sheet\'s other rows', () => {
      const fields = [{ key: 'a', label: 'A' }, { key: 'f', label: 'F', sheet: 'flags' }];
      const panel = { kind: 'settings', fields };
      const ctx = ctxFor(config('data'), panel);
      const mutate = mutationFor(ctx, editState(ctx, { edits: { a: '1', f: 'true' }, rows: null }));
      const current = multi({ data: [], flags: [{ key: 'ew.enabled', value: 'true' }] });
      const { config: json, changed } = mutate(current);
      expect([changed, json.data.data, json.flags.data]).to.deep.equal([
        true,
        [{ key: 'a', value: '1' }],
        [{ key: 'ew.enabled', value: 'true' }, { key: 'f', value: 'true' }],
      ]);
      const unchanged = mutationFor(ctx, editState(ctx, { edits: {}, rows: null }));
      expect(unchanged(current).changed).to.equal(false);
    });

    it('applies settings to the config sheet', () => {
      const ctx = ctxFor(config('flags'), settingsPanel);
      const mutate = mutationFor(ctx, editState(ctx, { edits: { a: '1' }, rows: null }));
      const { config: json, changed } = mutate(null);
      expect([changed, json.flags.data]).to.deep.equal([true, [{ key: 'a', value: '1' }]]);
    });

    it('writes rows to the first sheet of the library list as re-read', () => {
      const ctx = ctxFor(library('Blocks'), rowsPanel, { atSite: true, file: { status: 'ok', json: null } });
      const mutate = mutationFor(ctx, editState(ctx, { edits: {}, rows: [{ title: 'Cards' }] }));
      const { config: json } = mutate(multi({ blocks: [], options: [{ k: 1 }] }));
      expect(json.blocks.data).to.deep.equal([{ title: 'Cards' }]);
      expect(json.options.data).to.deep.equal([{ k: 1 }]);
    });

    it('writes a part to its tab of the file', () => {
      const store = file('/f.json', { settings: 'config', list: 'list' });
      const ctx = ctxFor(store, partsPanel, { atSite: true, partId: 'list', file: { status: 'ok', json: null } });
      const mutate = mutationFor(ctx, editState(ctx, { edits: {}, rows: [{ title: 'X' }] }));
      expect(mutate(null).config.list.data).to.deep.equal([{ title: 'X' }]);
    });

    describe('when someone else saved the list after it was opened', () => {
      const A = { title: 'A' };
      const B = { title: 'B' };
      const C = { title: 'C' };
      const opened = (rows) => ctxFor(config('apps'), rowsPanel, { configs: { org: multi({ apps: rows }), site: null } });
      const write = (loaded, mine, current) => {
        const ctx = opened(loaded);
        return mutationFor(ctx, editState(ctx, { edits: {}, rows: mine }))(current);
      };

      it('keeps their rows and adds this edit', () => {
        const { config: json, changed } = write([A], [A, C], multi({ apps: [A, B], flags: [{ key: 'k', value: 'v' }] }));
        expect([changed, json.apps.data, json.flags.data]).to.deep.equal([true, [A, B, C], [{ key: 'k', value: 'v' }]]);
      });

      it('writes nothing and reports a conflict when both sides changed the same row', () => {
        const current = multi({ apps: [{ title: 'A', path: '/theirs' }] });
        expect(write([A], [{ title: 'A', path: '/mine' }], current))
          .to.deep.equal({ config: current, changed: false, conflict: true });
      });

      it('reports no change when they already saved the same edit', () => {
        const current = multi({ apps: [A, B] });
        expect(write([A], [A, B], current)).to.deep.equal({ config: current, changed: false });
      });

      it('keeps rows owned by another panel of the same sheet', () => {
        const owned = { ...rowsPanel, owns: (row) => row.title !== 'Lib' };
        const lib = { title: 'Lib' };
        const ctx = ctxFor(config('apps'), owned, { configs: { org: multi({ apps: [lib, A] }), site: null } });
        const mutate = mutationFor(ctx, editState(ctx, { edits: {}, rows: [A, C] }));
        expect(mutate(multi({ apps: [lib, A, B] })).config.apps.data).to.deep.equal([lib, A, B, C]);
      });
    });
  });

  describe('needsSetup', () => {
    const panel = { ...settingsPanel, setup: { key: 'ew.enabled' } };
    const flags = (value) => multi({ flags: [{ key: 'ew.enabled', value }] });

    it('asks for setup at site scope until the flag is set on the site or the org', () => {
      const ctx = ctxFor(config('flags'), panel);
      const empty = { org: null, site: null };
      expect(needsSetup(ctx, { configs: empty, atSite: true })).to.equal(true);
      expect(needsSetup(ctx, { configs: empty, atSite: false })).to.equal(false);
      expect(needsSetup(ctx, { configs: { org: flags('false'), site: null }, atSite: true })).to.equal(false);
      expect(needsSetup(ctx, { configs: { org: null, site: flags('true') }, atSite: true })).to.equal(false);
    });

    it('never asks for panels without a setup step', () => {
      expect(needsSetup(ctxFor(config('data'), settingsPanel), { configs: {}, atSite: true })).to.equal(false);
    });
  });

  describe('inheritanceText', () => {
    it('explains layering for inherited settings and rows only', () => {
      expect(inheritanceText(ctxFor(config('data'), settingsPanel), true)).to.include('override');
      expect(inheritanceText(ctxFor(config('data'), settingsPanel), false)).to.include('inherit');
      expect(inheritanceText(ctxFor(config('prepare'), rowsPanel), true)).to.include('replaces');
      expect(inheritanceText(ctxFor(config('prepare'), rowsPanel), false)).to.include('inherit');
      expect(inheritanceText(ctxFor(config('apps', { inherit: false }), rowsPanel), true)).to.equal('');
      expect(inheritanceText(ctxFor(library('Icons'), rowsPanel), true)).to.equal('');
    });
  });
});
