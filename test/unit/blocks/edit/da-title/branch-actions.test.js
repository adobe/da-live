import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
await import('../../../../../blocks/edit/da-title/da-title.js');

describe('content branch editor actions', () => {
  it('hides AEM actions for branch edits while preserving Default actions', () => {
    const title = document.createElement('da-title');
    title.details = { view: 'edit', site: 'site~work', path: '/page', fullpath: '/org/site~work/page.html' };
    expect(title.getAvailableActions()).to.deep.equal([]);
    title.details = { view: 'sheet', site: 'site~work', path: '/data', fullpath: '/org/site~work/data.json' };
    expect(title.getAvailableActions()).to.deep.equal(['save']);
    title.details = { view: 'edit', site: 'site', path: '/page', fullpath: '/org/site/page.html' };
    expect(title.getAvailableActions()).to.deep.equal(['preview', 'publish']);
  });
});
