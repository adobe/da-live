import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { findUniversalEditorSetting, pagePathFromSourceUrl, buildUniversalEditorUrl } = await import('../../../../../blocks/canvas/editor-utils/universal-editor.js');

const EDITOR_ROWS = [
  { block: 'cards', property: 'multi' },
  { block: 'Form', property: 'universal-editor', value: ' formsinternal01 ' },
];

describe('findUniversalEditorSetting', () => {
  it('returns the configured value for a universal-editor block', () => {
    expect(findUniversalEditorSetting(EDITOR_ROWS, 'form')).to.equal('formsinternal01');
  });

  it('is null for other or unknown blocks', () => {
    expect(findUniversalEditorSetting(EDITOR_ROWS, 'cards')).to.be.null;
    expect(findUniversalEditorSetting(EDITOR_ROWS, 'columns')).to.be.null;
    expect(findUniversalEditorSetting([{ block: 'form', property: 'universal-editor' }], 'form')).to.be.null;
    expect(findUniversalEditorSetting(undefined, 'form')).to.be.null;
  });
});

describe('pagePathFromSourceUrl', () => {
  it('returns the page path of a DA source URL', () => {
    expect(pagePathFromSourceUrl('https://admin.da.live/source/org/site/folder/page.html')).to.equal('/folder/page');
    expect(pagePathFromSourceUrl('https://admin.da.live/source/org/site/index.html')).to.equal('/');
  });

  it('is null for anything else', () => {
    expect(pagePathFromSourceUrl('https://admin.da.live/source/org/site')).to.be.null;
    expect(pagePathFromSourceUrl('not a url')).to.be.null;
    expect(pagePathFromSourceUrl(null)).to.be.null;
  });
});

describe('buildUniversalEditorUrl', () => {
  const ctx = { org: 'sakshi-arora1', site: 'datest-ue', branch: 'main', path: '/test' };

  it('builds the Universal Editor URL of an IMS org', () => {
    expect(buildUniversalEditorUrl('formsinternal01', ctx)).to.equal(
      'https://experience.adobe.com/#/@formsinternal01/aem/editor/canvas/main--datest-ue--sakshi-arora1.ue.da.live/test',
    );
  });

  it('fills a URL template', () => {
    const template = 'https://experience.adobe.com/#/@x/aem/editor/canvas/host.example/{org}/{site}{path}?ref={branch}';
    expect(buildUniversalEditorUrl(template, ctx)).to.equal(
      'https://experience.adobe.com/#/@x/aem/editor/canvas/host.example/sakshi-arora1/datest-ue/test?ref=main',
    );
  });

  it('is null without a setting or page', () => {
    expect(buildUniversalEditorUrl(null, ctx)).to.be.null;
    expect(buildUniversalEditorUrl('formsinternal01', { ...ctx, path: null })).to.be.null;
  });
});
