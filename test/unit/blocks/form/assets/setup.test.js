import { expect } from '@esm-bundle/chai';
import '../../../setup-nx.js';
import { getNx2 } from '../../../../../scripts/utils.js';
import { loadAssetSetup } from '../../../../../blocks/form/assets/setup.js';

// Building the URL from getNx2() shares the fixture instance setup.js loads.
const { setRepositoryConfig } = await import(`${getNx2()}/utils/aem-assets/repository-config.js`);

const details = { owner: 'org', repo: 'site', parent: '/org/site', name: 'page' };
const load = () => loadAssetSetup({ details, isCurrent: () => true });

describe('loadAssetSetup', () => {
  afterEach(() => setRepositoryConfig(null));

  it('offers Upload only and writes images as images without AEM Assets', async () => {
    const { sources, writerConfig } = await load();
    expect(sources.map(({ id }) => id)).to.deep.equal(['upload']);
    expect(writerConfig).to.deep.equal({ externalImagesAsLinks: false });
  });

  it('adds AEM Assets and writes its images as links when the site asks for links', async () => {
    setRepositoryConfig({ repositoryId: 'author-p1-e1.adobeaemcloud.com', insertAsLink: true });
    const { sources, writerConfig } = await load();
    expect(sources.map(({ id }) => id)).to.deep.equal(['upload', 'aem-assets']);
    expect(writerConfig).to.deep.equal({ externalImagesAsLinks: true });
  });
});
