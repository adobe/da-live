import { expect } from '@esm-bundle/chai';
import '../../../setup-nx.js';
import { installFetch, restoreFetch } from '../../../helpers/fetch.js';
import { JSON_PREVIEW_KEY, isJsonPreviewEnabled } from '../../../../../blocks/form/utils/config.js';

let counter = 0;
const uniqOrg = () => {
  counter += 1;
  return `form-config-org-${counter}`;
};

const sheet = (data) => JSON.stringify({ ':type': 'sheet', data });

describe('isJsonPreviewEnabled', () => {
  afterEach(() => restoreFetch());

  it('returns false when the key is "false", ignoring case and whitespace', async () => {
    installFetch({ body: sheet([{ key: JSON_PREVIEW_KEY, value: ' FALSE ' }]) });
    expect(await isJsonPreviewEnabled({ org: uniqOrg() })).to.equal(false);
  });

  it('returns true when the key is set to anything else', async () => {
    installFetch({ body: sheet([{ key: JSON_PREVIEW_KEY, value: 'true' }]) });
    expect(await isJsonPreviewEnabled({ org: uniqOrg() })).to.equal(true);
  });

  it('returns true when the key is missing', async () => {
    installFetch({ body: sheet([]) });
    expect(await isJsonPreviewEnabled({ org: uniqOrg() })).to.equal(true);
  });

  it('returns true when the config fails to load', async () => {
    installFetch({ status: 404, body: '' });
    expect(await isJsonPreviewEnabled({ org: uniqOrg() })).to.equal(true);
  });
});
