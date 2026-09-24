import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { makeView } from '../test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { insertSelectedAsset } = await import(
  '../../../../../blocks/canvas/ew-panel-extensions/aem-assets.js'
);

const repoConfig = {
  repositoryId: 'author-example.adobeaemcloud.com',
  tierType: 'author',
  assetOrigin: 'publish-example.adobeaemcloud.com',
  isDmEnabled: false,
  isSmartCrop: false,
  insertAsLink: false,
};

describe('sidebar asset picker insertion', () => {
  it('uses the same host insertion path for image assets', async () => {
    const view = makeView({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Start' }] }],
    });
    await insertSelectedAsset({
      asset: {
        'aem:formatName': 'jpeg',
        mimetype: 'image/jpeg',
        path: '/content/dam/example.jpg',
        name: 'Example',
      },
      repoConfig,
      org: 'org',
      site: 'site',
      getView: () => view,
    });
    const images = [];
    view.state.doc.descendants((node) => {
      if (node.type.name === 'image') images.push(node);
    });
    expect(images).to.have.length(1);
    expect(images[0].attrs.src).to.equal('https://publish-example.adobeaemcloud.com/content/dam/example.jpg');
    expect(document.querySelector('.da-dialog-asset')).to.equal(null);
  });

  it('keeps the shared approval error visible until dismissed', async () => {
    const view = makeView({ type: 'doc', content: [] });
    const pending = insertSelectedAsset({
      asset: {
        'aem:formatName': 'jpeg',
        mimetype: 'image/jpeg',
        path: '/content/dam/example.jpg',
      },
      repoConfig: { ...repoConfig, isDmEnabled: true },
      org: 'org',
      site: 'site',
      getView: () => view,
    });
    const dialog = document.querySelector('.da-dialog-asset');
    expect(dialog.open).to.be.true;
    expect(dialog.textContent).to.include('not approved for delivery');
    dialog.querySelector('.cancel').click();
    await pending;
    expect(document.querySelector('.da-dialog-asset')).to.equal(null);
    expect(view.state.doc.content.size).to.equal(0);
  });

  it('rejects an invalid selection or disconnected editor without opening a dialog', async () => {
    try {
      await insertSelectedAsset({ asset: {}, repoConfig, org: 'org', site: 'site', getView: () => null });
      throw new Error('Expected an invalid selection error');
    } catch (error) {
      expect(error.message).to.equal('The selected asset is invalid.');
    }
    try {
      await insertSelectedAsset({
        asset: { 'aem:formatName': 'jpeg' },
        repoConfig,
        org: 'org',
        site: 'site',
        getView: () => null,
      });
      throw new Error('Expected a disconnected editor error');
    } catch (error) {
      expect(error.message).to.equal('The editor is not connected.');
    }
    expect(document.querySelector('.da-dialog-asset')).to.equal(null);
  });
});
