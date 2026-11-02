import { expect } from '@esm-bundle/chai';
import {
  ORG, SITE, TABS, SECTIONS, sectionById, tabsForScope, resolveSelection, tabFromUrl, urlWithTab,
} from '../../../../blocks/config/sections.js';
import { SHEETS } from '../../../../blocks/config/sheets.js';

const ids = (list) => list.map((item) => item.id);

describe('config sections', () => {
  const sheetNames = Object.values(SHEETS);

  it('gives every section a unique id, a label, a panel and a store', () => {
    const all = ids(SECTIONS);
    expect(new Set(all).size).to.equal(all.length);
    SECTIONS.forEach(({ id, label, panel, store, scopes }) => {
      expect([!!label, !!panel, ['config', 'file', 'library'].includes(store.type)], id)
        .to.deep.equal([true, true, true]);
      expect(scopes.length > 0 && scopes.every((s) => [ORG, SITE].includes(s)), id).to.equal(true);
    });
  });

  it('links every section to its aem.live docs page', () => {
    const bad = SECTIONS.filter(({ docs }) => !/^https:\/\/www\.aem\.live\/docs\/\S+$/.test(docs ?? ''));
    expect(ids(bad)).to.deep.equal([]);
    expect(sectionById('placeholders').docs).to.equal('https://www.aem.live/docs/placeholders');
  });

  it('keeps storage and docs out of the panels', () => {
    const storageKeys = ['sheet', 'file', 'library', 'inherit', 'docs'];
    SECTIONS.forEach(({ id, panel }) => {
      [panel, ...(panel.parts ?? [])].forEach((p) => {
        expect(storageKeys.filter((key) => key in p), id).to.deep.equal([]);
      });
    });
  });

  it('stores config sections in a known config sheet', () => {
    SECTIONS.filter(({ store }) => store.type === 'config').forEach(({ id, store }) => {
      expect(sheetNames, id).to.include(store.sheet);
    });
    expect(sectionById('experience-workspace').store).to.deep.equal({ type: 'config', sheet: 'flags', inherit: true });
    expect(sectionById('plugins').store.sheet).to.equal('library');
    expect(sectionById('apps').store.inherit).to.equal(false);
  });

  it('maps every part of a file section to a tab of the file, and nothing else', () => {
    SECTIONS.filter(({ store }) => store.type === 'file').forEach(({ id, store, panel }) => {
      expect(Object.keys(store.sheets), id).to.deep.equal(panel.parts.map((p) => p.id));
    });
    const { store } = sectionById('translation');
    expect([store.path, store.sheets.settings, store.sheets.options]).to.deep.equal(['/.da/translate.json', 'config', 'config']);
  });

  it('registers library sections by title with their candidate paths', () => {
    expect(sectionById('templates').store).to.deep.equal({ type: 'library', title: 'Templates', paths: ['/docs/library/templates.json', '/library/templates.json'] });
    expect(sectionById('placeholders').store.paths).to.deep.equal(['/placeholders.json']);
    expect(sectionById('nope')).to.equal(null);
  });

  it('gives every section an icon sprite that exists', async () => {
    const results = await Promise.all(SECTIONS.map(async ({ id, icon }) => {
      const res = await fetch(`/blocks/config/img/${icon}.svg`);
      return [id, res.ok && (await res.text()).includes('id="icon"')];
    }));
    expect(results.filter(([, ok]) => !ok)).to.deep.equal([]);
  });

  describe('tabsForScope', () => {
    it('shows only org-capable tabs and sections at org scope', () => {
      const tabs = tabsForScope(ORG);
      expect(ids(tabs)).to.deep.equal(['extensions', 'workspace', 'integrations', 'multi-site']);
      expect(ids(tabs[0].sections)).to.deep.equal(['plugins', 'prepare']);
      expect(ids(tabs[2].sections)).to.deep.equal(['aem-assets']);
    });

    it('drops org-only tabs and keeps shared sections at site scope', () => {
      const tabs = tabsForScope(SITE);
      expect(ids(tabs)).to.deep.equal(['library', 'extensions', 'workspace', 'integrations']);
      expect(ids(tabs[3].sections)).to.deep.equal(['aem-assets', 'translation']);
    });

    it('does not mutate the registry', () => {
      tabsForScope(ORG);
      expect(TABS.find((t) => t.id === 'integrations').sections).to.have.length(2);
    });
  });

  describe('resolveSelection', () => {
    it('finds the tab that owns the section', () => {
      const { tab, section } = resolveSelection(tabsForScope(SITE), 'translation');
      expect([tab.id, section.id]).to.deep.equal(['integrations', 'translation']);
    });

    it('falls back to the first section when the id is missing or hidden in this scope', () => {
      expect(resolveSelection(tabsForScope(ORG), 'blocks').section.id).to.equal('plugins');
      expect(resolveSelection(tabsForScope(SITE), null).section.id).to.equal('blocks');
    });
  });

  describe('?tab= param', () => {
    it('reads the tab', () => {
      expect(tabFromUrl('https://da.live/config/edit?tab=icons#/o/s')).to.equal('icons');
      expect(tabFromUrl('https://da.live/config/edit#/o/s')).to.equal(null);
    });

    it('sets the tab, keeping the hash and other params', () => {
      expect(urlWithTab('https://da.live/config/edit?nxver=2#/o/s', 'icons'))
        .to.equal('https://da.live/config/edit?nxver=2&tab=icons#/o/s');
    });
  });
});
