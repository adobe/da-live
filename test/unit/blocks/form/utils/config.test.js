import { expect } from '@esm-bundle/chai';
import '../../../setup-nx.js';
import { getNx2 } from '../../../../../scripts/utils.js';
import { JSON_PREVIEW_KEY, isJsonPreviewEnabled } from '../../../../../blocks/form/utils/config.js';

// Same URL as the block's import, so the test drives the instance the block uses.
const { getConfigValue } = await import(`${getNx2()}/utils/daConfig.js`);

describe('isJsonPreviewEnabled', () => {
  afterEach(() => getConfigValue.reset());

  it('reads the JSON preview key for the given org and site', async () => {
    await isJsonPreviewEnabled({ org: 'org', site: 'site' });
    expect(getConfigValue.calledOnceWith({ org: 'org', site: 'site', key: JSON_PREVIEW_KEY }))
      .to.equal(true);
  });

  it('returns false when the key is "false", ignoring case and whitespace', async () => {
    getConfigValue.resolves(' FALSE ');
    expect(await isJsonPreviewEnabled({ org: 'org' })).to.equal(false);
  });

  it('returns true when the key is set to anything else', async () => {
    getConfigValue.resolves('true');
    expect(await isJsonPreviewEnabled({ org: 'org' })).to.equal(true);
  });

  it('returns true when the key is missing or the config fails to load', async () => {
    getConfigValue.resolves(undefined);
    expect(await isJsonPreviewEnabled({ org: 'org' })).to.equal(true);
  });
});
