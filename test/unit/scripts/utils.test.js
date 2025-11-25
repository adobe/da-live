import { expect } from '@esm-bundle/chai';
import { setNx, sanitizePath } from '../../../scripts/utils.js';

describe('Libs', () => {
  it('Default Libs', () => {
    const libs = setNx('/nx');
    expect(libs).to.equal('https://main--da-nx--adobe.aem.live/nx');
  });

  it('Does not support NX query param on prod', () => {
    const location = {
      hostname: 'business.adobe.com',
      search: '?nx=foo',
    };
    const libs = setNx('/nx', location);
    expect(libs).to.equal('/nx');
  });

  it('Supports NX query param', () => {
    const location = {
      hostname: 'localhost',
      search: '?nx=foo',
    };
    const libs = setNx('/nx', location);
    expect(libs).to.equal('https://foo--da-nx--adobe.aem.live/nx');
  });

  it('Supports local NX query param', () => {
    const location = {
      hostname: 'localhost',
      search: '?nx=local',
    };
    const libs = setNx('/nx', location);
    expect(libs).to.equal('http://localhost:6456/nx');
  });

  it('Returns sanitize file path', async () => {
    const path = '/new folder/geo_metrixx.jpg';
    const item = sanitizePath(path);
    expect(item).to.equal('/new-folder/geo-metrixx.jpg');
  });
});
