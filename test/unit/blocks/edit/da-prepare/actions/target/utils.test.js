import { expect } from '@esm-bundle/chai';
import { setNx, getNx2Api } from '../../../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { savePreview } = await import('../../../../../../../blocks/edit/da-prepare/actions/target/utils.js');

describe('target/utils savePreview', () => {
  it('Strips the .html extension before previewing', async () => {
    const { aem } = await getNx2Api();
    const origPreview = aem.preview;
    const previewed = [];
    aem.preview = (path) => {
      previewed.push(path);
      return { ok: true, json: () => ({ preview: { url: 'https://main--site--org.aem.page/testpage' } }) };
    };

    try {
      const result = await savePreview('org', 'site', '/testpage.html');

      expect(previewed).to.deep.equal(['/org/site/testpage']);
      expect(result.preview.url).to.equal('https://main--site--org.aem.page/testpage');
    } finally {
      aem.preview = origPreview;
    }
  });

  it('Leaves extensionless paths untouched', async () => {
    const { aem } = await getNx2Api();
    const origPreview = aem.preview;
    const previewed = [];
    aem.preview = (path) => {
      previewed.push(path);
      return { ok: true, json: () => ({ preview: { url: 'https://main--site--org.aem.page/folder' } }) };
    };

    try {
      await savePreview('org', 'site', '/folder');

      expect(previewed).to.deep.equal(['/org/site/folder']);
    } finally {
      aem.preview = origPreview;
    }
  });

  it('Returns an error when the preview fails', async () => {
    const { aem } = await getNx2Api();
    const origPreview = aem.preview;
    aem.preview = () => ({ ok: false });

    try {
      const result = await savePreview('org', 'site', '/testpage.html');
      expect(result).to.deep.equal({ error: 'Couldn\'t preview.' });
    } finally {
      aem.preview = origPreview;
    }
  });
});
