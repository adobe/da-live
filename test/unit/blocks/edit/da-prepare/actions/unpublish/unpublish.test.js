import { expect } from '@esm-bundle/chai';
import { setNx, getNx2Api } from '../../../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: renderUnpublish } = await import('../../../../../../../blocks/edit/da-prepare/actions/unpublish/unpublish.js');

function makeUnpublish(details) {
  const el = renderUnpublish(details);
  // Avoid needing a real dialog ancestor for the close dispatch.
  el.dispatchEvent = () => {};
  return el;
}

describe('da-unpublish', () => {
  it('Unpublishes HTML pages by their extensionless path', async () => {
    const { aem } = await getNx2Api();
    const origUnPreview = aem.unPreview;
    const origUnPublish = aem.unPublish;
    const unpublished = [];
    aem.unPreview = (path) => {
      unpublished.push(path);
      return { ok: true };
    };
    aem.unPublish = (path) => {
      unpublished.push(path);
      return { ok: true };
    };

    try {
      const el = makeUnpublish({ org: 'org', site: 'site', path: '/testpublishing.html', fullpath: '/org/site/testpublishing.html' });
      await el.handleUnpublish();

      expect(unpublished).to.deep.equal(['/org/site/testpublishing', '/org/site/testpublishing']);
      expect(el._results).to.deep.equal([]);
    } finally {
      aem.unPreview = origUnPreview;
      aem.unPublish = origUnPublish;
    }
  });

  it('Records an error when unpublish fails', async () => {
    const { aem } = await getNx2Api();
    const origUnPreview = aem.unPreview;
    const origUnPublish = aem.unPublish;
    aem.unPreview = () => ({ ok: true });
    aem.unPublish = () => ({ ok: false, status: 404 });

    try {
      const el = makeUnpublish({ org: 'org', site: 'site', path: '/testpublishing.html', fullpath: '/org/site/testpublishing.html' });
      await el.handleUnpublish();

      expect(el._results).to.deep.equal(['Couldn\'t unpublish from production.']);
      expect(el._statusText).to.equal('There was an error');
    } finally {
      aem.unPreview = origUnPreview;
      aem.unPublish = origUnPublish;
    }
  });
});
