import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
await import('../../../../../blocks/edit/da-title/da-title.js');
const { staleCheck, handleSave } = await import('../../../../../blocks/sheet/utils/utils.js');

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

  it('uses the conditional Sheet session for manual Save', async () => {
    const previousUrl = window.location.href;
    window.history.replaceState(null, '', '/sheet#/org/site~work/data');
    const sheet = {
      name: 'data',
      getData: () => [['key'], ['value']],
      getConfig: () => ({ columns: [{ width: '300' }] }),
    };
    const editor = document.createElement('div');
    editor.className = 'da-sheet';
    editor.jexcel = [sheet];
    document.body.append(editor);
    const title = document.createElement('da-title');
    title.details = { org: 'org', view: 'sheet', site: 'site~work', path: '/data.json', fullpath: '/org/site~work/data.json' };
    title.sheet = [sheet];
    title.permissions = ['read', 'write'];
    let written;
    staleCheck.setConditionalSession({
      save: async (body) => {
        written = JSON.parse(body);
        return new Response('', { status: 201, headers: { ETag: '"next"' } });
      },
    });
    const oldDrift = staleCheck.checkForDrift;
    staleCheck.checkForDrift = async () => false;
    try {
      handleSave([sheet], 'sheet');
      await title.handleAction('save');
      expect(written.data).to.deep.equal([{ key: 'value' }]);
      expect(staleCheck.isDirty).to.equal(false);
    } finally {
      staleCheck.checkForDrift = oldDrift;
      staleCheck.stop();
      editor.remove();
      window.history.replaceState(null, '', previousUrl);
    }
  });
});
