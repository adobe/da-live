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
