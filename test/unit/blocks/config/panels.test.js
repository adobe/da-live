import { expect } from '@esm-bundle/chai';
import aemAssets, { validateRepositoryId, validateHost, validateBasePath, validateMimeRenditions } from '../../../../blocks/config/panels/aem-assets.js';
import { validateRow } from '../../../../blocks/config/panels/prepare.js';
import { rowStates, rowErrors, rowsToSave } from '../../../../blocks/config/editors/rows.js';
import plugins, { validateRow as validatePlugin } from '../../../../blocks/config/panels/plugins.js';
import msm, { validateRow as validateMsm } from '../../../../blocks/config/panels/msm.js';
import { validateBlock, validateTemplate, validateIcon, validatePlaceholder } from '../../../../blocks/config/panels/library.js';
import { validateRow as validateApp } from '../../../../blocks/config/panels/apps.js';
import translation, { validateOption, validateLanguage } from '../../../../blocks/config/panels/translation.js';
import experienceWorkspace from '../../../../blocks/config/panels/experience-workspace.js';

const multi = (name, rows) => ({ [name]: { data: rows }, ':names': [name], ':type': 'multi-sheet' });
const ok = (fn, values) => values.forEach((v) => expect(fn(v), v).to.equal(null));
const bad = (fn, values) => values.forEach((v) => expect(fn(v), v).to.be.a('string'));

describe('aem-assets panel', () => {
  it('exposes the documented keys', () => {
    expect(aemAssets.fields.map((f) => f.key)).to.deep.equal([
      'aem.repositoryId', 'aem.assets.prod.origin', 'aem.assets.prod.basepath', 'aem.assets.image.type',
      'aem.asset.dm.delivery', 'aem.asset.smartcrop.select', 'aem.asset.mime.renditions',
    ]);
  });

  it('validates the repository id', () => {
    ok(validateRepositoryId, ['author-p1-e2.adobeaemcloud.com', 'delivery-p123-e456.adobeaemcloud.com']);
    bad(validateRepositoryId, ['https://author-p1-e2.adobeaemcloud.com', 'publish-p1-e2.adobeaemcloud.com', 'author-p1']);
  });

  it('validates hosts without protocol', () => {
    ok(validateHost, ['assets.example.com', 'delivery-p1-e2.adobeaemcloud.com']);
    bad(validateHost, ['https://assets.example.com', 'localhost', 'a b.com']);
  });

  it('validates base paths', () => {
    ok(validateBasePath, ['/adobe/assets', 'customer/assets']);
    bad(validateBasePath, ['https://x.com/adobe/assets', 'adobe assets']);
  });

  it('validates mime rendition pairs', () => {
    ok(validateMimeRenditions, ['image/vnd.adobe.photoshop:avif', 'image/*:original, video/*:play']);
    bad(validateMimeRenditions, ['image/jpeg', 'avif', 'image/jpeg:avif,', 'image/jpeg:aviff']);
  });
});

describe('experience-workspace panel', () => {
  it('edits the ew.* flags in the flags sheet', () => {
    expect(experienceWorkspace.fields.map((f) => f.key)).to.deep.equal([
      'ew.enabled', 'ew.disableChat', 'ew.canvasDefaultView', 'ew.canvasDefaultPanel',
    ]);
  });

  it('links to the setup app for the site', () => {
    expect(experienceWorkspace.setup.url('o', 's')).to.match(/\/ew-setup\/ew-setup#\/o\/s$/);
  });
});

describe('prepare panel', () => {
  it('requires a title and a URL path, unless the title is a built-in action', () => {
    expect(validateRow({})).to.have.keys('title', 'path');
    expect(validateRow({ title: 'Schedule Publish' })).to.deep.equal({});
    expect(validateRow({ title: 'Mine', path: 'https://x.com/p.html' })).to.deep.equal({});
    expect(validateRow({ title: 'Mine', path: '/tools/p.html' })).to.deep.equal({});
    expect(validateRow({ title: 'Mine', path: 'tools/p.html' })).to.have.keys('path');
  });

  it('checks icon URLs and single-word refs', () => {
    const base = { title: 'Mine', path: 'https://x.com/p.html' };
    expect(validateRow({ ...base, icon: 'icon.svg' })).to.have.keys('icon');
    ['/img/i.svg#i', '#i', 'http://content.da.live/o/s/i.svg#i'].forEach((icon) => {
      expect(validateRow({ ...base, icon }), icon).to.deep.equal({});
    });
    expect(validateRow({ ...base, ref: 'u a t' })).to.have.keys('ref');
    expect(validateRow({ ...base, icon: 'https://x.com/i.svg', ref: 'uat' })).to.deep.equal({});
  });
});

describe('apps panel', () => {
  it('requires a title and a URL or path, and checks image and ref', () => {
    expect(validateApp({})).to.have.keys('title', 'path');
    expect(validateApp({ title: 'A', path: 'https://da.live/app/o/s/tools/a' })).to.deep.equal({});
    expect(validateApp({ title: 'A', path: '/app/o/s/tools/a', image: '/img/a.jpg', ref: 'dev' })).to.deep.equal({});
    expect(validateApp({ title: 'A', path: 'tools/a' })).to.have.keys('path');
    expect(validateApp({ title: 'A', path: '/a', image: 'a.jpg', ref: 'a b' })).to.have.keys('image', 'ref');
  });
});

describe('plugins panel', () => {
  const BLOCKS = { title: 'Blocks', path: 'https://x.com/blocks.json' };
  const TOOL = { title: 'My Tool', path: '/tools/my-tool.html' };

  it('validates title, comma-separated paths, icon and ref, and reserves library names', () => {
    expect(validatePlugin({})).to.have.keys('title', 'path');
    expect(validatePlugin({ title: 'Templates', path: '/t' })).to.have.keys('title');
    expect(validatePlugin({ title: 'A', path: '/a.html, https://b.com/b.html' })).to.deep.equal({});
    expect(validatePlugin({ title: 'A', path: '/a, b' })).to.have.keys('path');
    expect(validatePlugin({ title: 'A', path: '/a', icon: 'i.svg', ref: 'u a' })).to.have.keys('icon', 'ref');
  });

  it('only lists plugin rows of the library sheet', () => {
    const scoped = { own: multi('library', [BLOCKS, TOOL]), inherited: null, pending: null };
    const { items } = rowStates(plugins, { ...scoped, sheet: 'library' });
    expect(items.map((i) => i.row)).to.deep.equal([TOOL]);
  });

  it('matches org and site plugins by name, ignoring case and spaces', () => {
    const site = { ...TOOL, title: 'my tool', ref: 'uat' };
    const scoped = { own: multi('library', [site]), inherited: multi('library', [TOOL]), pending: null };
    const { items } = rowStates(plugins, { ...scoped, sheet: 'library' });
    expect(items).to.deep.equal([{ row: site, index: 0, overrides: true }]);
    expect(rowErrors(plugins, [TOOL, site], { index: 1, row: site })).to.have.keys('title');
  });

  it('keeps the library entries it does not own when saving', () => {
    const json = multi('library', [BLOCKS, TOOL]);
    expect(rowsToSave(plugins, json, [], 'library')).to.deep.equal([BLOCKS]);
    expect(rowsToSave(plugins, json, [TOOL], 'library')).to.deep.equal([BLOCKS, TOOL]);
  });
});

describe('library panels', () => {
  it('validates blocks and templates', () => {
    expect(validateBlock({})).to.have.keys('name', 'path');
    expect(validateBlock({ name: 'Cards', path: 'cards' })).to.have.keys('path');
    expect(validateBlock({ name: 'Cards', path: 'https://content.da.live/o/s/library/blocks/cards' })).to.deep.equal({});
    expect(validateTemplate({})).to.have.keys('key', 'value');
    expect(validateTemplate({ key: 'Article', value: '/library/templates/article' })).to.deep.equal({});
  });

  it('keeps icon keys insertable as :key:', () => {
    expect(validateIcon({})).to.have.keys('key');
    expect(validateIcon({ key: 'my icon' })).to.have.keys('key');
    expect(validateIcon({ key: 'adobe-logo', icon: 'logo.svg' })).to.have.keys('icon');
    expect(validateIcon({ key: 'adobe_logo', icon: '/icons/adobe.svg' })).to.deep.equal({});
  });

  it('requires a placeholder key', () => {
    expect(validatePlaceholder({ Text: 'x' })).to.have.keys('Key');
    expect(validatePlaceholder({ Key: 'read more' })).to.deep.equal({});
  });
});

describe('msm panel', () => {
  const BASE = { base: 'my-base', title: 'Base Site' };
  const SAT = { base: 'my-base', satellite: 'satellite-1', title: 'Satellite Site 1' };

  it('validates base and satellite site names', () => {
    expect(validateMsm({})).to.have.keys('base');
    expect(validateMsm({ base: 'my base' })).to.have.keys('base');
    expect(validateMsm({ base: 'a', satellite: 'a' })).to.have.keys('satellite');
    expect(validateMsm(SAT, [BASE])).to.deep.equal({});
  });

  it('lets a satellite resolve from one base only, while allowing multi-level chains', () => {
    const other = { base: 'other-base', satellite: 'satellite-1' };
    expect(validateMsm(other, [SAT])).to.have.keys('satellite');
    const chain = { base: 'satellite-1', satellite: 'satellite-2' };
    expect(validateMsm(chain, [BASE, SAT])).to.deep.equal({});
  });

  it('flags a repeated base/satellite pair, but not a base row next to its satellites', () => {
    expect(rowErrors(msm, [BASE, SAT], { index: null, row: { ...SAT, title: 'x' } })).to.have.keys('base');
    expect(rowErrors(msm, [SAT], { index: null, row: BASE })).to.deep.equal({});
  });

  it('describes base and satellite rows', () => {
    expect([msm.label(SAT), msm.details(SAT)]).to.deep.equal(['Satellite Site 1', 'satellite-1 · satellite of my-base']);
    expect([msm.label({ base: 'my-base' }), msm.details(BASE)]).to.deep.equal(['my-base', 'my-base · base site']);
  });
});

describe('translation panel', () => {
  const part = (id) => translation.parts.find((p) => p.id === id);

  it('describes every part without docs or storage, which live in the registry', () => {
    expect(translation.parts.map((p) => p.id)).to.deep.equal([
      'settings', 'options', 'languages', 'custom-doc-rules', 'dnt-content-rules', 'dnt-sheet-rules', 'dnt',
    ]);
    expect(translation.parts.every((p) => !p.docs && !p.sheet)).to.equal(true);
    expect(translation.parts.map((p) => p.name)).to.deep.equal([
      'Settings', 'Service options', 'Languages', 'Document block rules', 'Do-not-translate text',
      'Sheet value rules', 'Excluded sheets and columns',
    ]);
  });

  it('splits the config tab between settings and service options', () => {
    const options = part('options');
    expect(options.owns({ key: 'translation.service.prod.origin' })).to.equal(true);
    expect(options.owns({ key: 'translation.service.name' })).to.equal(false);
    const json = { config: { data: [{ key: 'translation.service.name', value: 'Smartling' }] }, ':names': ['config'], ':type': 'multi-sheet' };
    const saved = rowsToSave(options, json, [{ key: 'a', value: 'b' }], 'config');
    expect(saved).to.deep.equal([{ key: 'translation.service.name', value: 'Smartling' }, { key: 'a', value: 'b' }]);
    expect(validateOption({ key: 'translation.service.name', value: 'x' }).key).to.include('Settings');
    const url = (key, value) => validateOption({ key, value }).value ?? null;
    expect(url('translation.service.prod.origin', 'https://translate.da.live/google')).to.equal(null);
    // eslint-disable-next-line no-script-url
    expect(url('translation.service.prod.link', 'javascript:alert(1)')).to.include('https://');
    expect(url('translation.service.stage.authEndpoint', 'http://api.example.com')).to.include('https://');
    expect(url('translation.service.prod.clientId', 'anything')).to.equal(null);
    expect(options.details({ key: 'translation.service.prod.clientSecret', value: 'shh' })).to.not.include('shh');
  });

  it('validates languages', () => {
    const en = { name: 'English', code: 'en', location: '/en' };
    expect(validateLanguage({ ...en, actions: 'Translate, rollout' }, [])).to.deep.equal({});
    expect(validateLanguage({ name: 'German', code: 'de', location: 'de' }, []).location).to.include('/de');
    expect(validateLanguage({ ...en, actions: 'publish' }, []).actions).to.include('Translate');
    expect(validateLanguage({ ...en, 'source language': 'English' }, [])['source language']).to.include('itself');
    const de = { name: 'German', code: 'de', location: '/de' };
    expect(validateLanguage({ ...de, 'source language': 'French' }, [en])['source language']).to.include('another');
    expect(validateLanguage({ ...de, 'source language': 'English' }, [en])).to.deep.equal({});
  });

  it('identifies do-not-translate rows by all their columns', () => {
    const rules = part('custom-doc-rules');
    const rows = [{ block: 'metadata', rule: 'dnt col 1' }];
    expect(rowErrors(rules, rows, { index: null, row: { block: 'metadata', rule: 'dnt col 2' } })).to.deep.equal({});
    expect(rowErrors(rules, rows, { index: null, row: { block: 'metadata', rule: 'dnt col 1' } }).block).to.include('already listed');
    expect(rowErrors(rules, rows, { index: null, row: { block: 'metadata' } }).rule).to.include('rule');
  });
});
