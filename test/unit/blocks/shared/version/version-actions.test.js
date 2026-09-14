import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let fetchVersions;
let createVersion;
let fetchVersionHtml;
let getVersionId;

before(async () => {
  const mod = await import('../../../../../blocks/shared/version/version-actions.js');
  ({ fetchVersions, createVersion, fetchVersionHtml, getVersionId } = mod);
});

const PATH = '/testorg/testsite/doc.html';
const PING_URL = 'https://admin.hlx.page/ping/testorg/testsite';
const LIST_URL = 'https://admin.da.live/versionlist/testorg/testsite/doc.html';
const CREATE_URL = 'https://admin.da.live/versionsource/testorg/testsite/doc.html';
const GET_URL = 'https://admin.da.live/versionsource/testorg/testsite/v1';

// Routes the fixture nx2 api.js's real fetch calls: the hlx6 upgrade-probe
// ping (always answered as "not upgraded", routing to the legacy endpoints
// below) plus whichever of list/create/get the test under-test needs.
function mockFetch({ list, create, get } = {}) {
  window.fetch = (url, opts) => {
    if (url === PING_URL) return Promise.resolve(new Response('', { status: 200 }));
    if (url === LIST_URL && list) return list(opts);
    if (url === CREATE_URL && opts?.method === 'POST' && create) return create(opts);
    if (url === GET_URL && get) return get(opts);
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  };
}

describe('getVersionId', () => {
  it('strips the /versionsource/{org}/{site}/ prefix from a legacy url', () => {
    const id = getVersionId(PATH, { url: '/versionsource/testorg/testsite/abc123.html' });
    expect(id).to.equal('abc123.html');
  });

  it('falls back to versionId when there is no legacy url (hlx6)', () => {
    const id = getVersionId(PATH, { versionId: '01ABCDEF' });
    expect(id).to.equal('01ABCDEF');
  });
});

describe('fetchVersions', () => {
  let savedFetch;
  beforeEach(() => { savedFetch = window.fetch; });
  afterEach(() => { window.fetch = savedFetch; });

  it('returns null when the list request is not ok', async () => {
    mockFetch({ list: () => Promise.resolve(new Response('', { status: 404 })) });
    expect(await fetchVersions(PATH)).to.be.null;
  });

  it('returns null (not an uncaught rejection) when the underlying fetch throws', async () => {
    mockFetch({ list: () => Promise.reject(new Error('network down')) });
    expect(await fetchVersions(PATH)).to.be.null;
  });

  it('formats the list on success', async () => {
    const raw = [{
      url: '/versionsource/testorg/testsite/v1.html',
      users: [{ email: 'a@b.com' }],
      timestamp: 1715594886177,
      path: 'doc.html',
    }];
    mockFetch({ list: () => Promise.resolve(new Response(JSON.stringify(raw), { status: 200 })) });
    const result = await fetchVersions(PATH);
    expect(result).to.have.lengthOf(1);
    expect(result[0].isVersion).to.be.true;
  });
});

describe('createVersion', () => {
  let savedFetch;
  beforeEach(() => { savedFetch = window.fetch; });
  afterEach(() => { window.fetch = savedFetch; });

  it('returns true on 201', async () => {
    mockFetch({ create: () => Promise.resolve(new Response('', { status: 201 })) });
    expect(await createVersion(PATH, 'label')).to.be.true;
  });

  it('returns false on a non-201 status', async () => {
    mockFetch({ create: () => Promise.resolve(new Response('', { status: 500 })) });
    expect(await createVersion(PATH, 'label')).to.be.false;
  });

  it('returns false (not an uncaught rejection) when the underlying fetch throws', async () => {
    mockFetch({ create: () => Promise.reject(new Error('network down')) });
    expect(await createVersion(PATH, 'label')).to.be.false;
  });
});

describe('fetchVersionHtml', () => {
  let savedFetch;
  beforeEach(() => { savedFetch = window.fetch; });
  afterEach(() => { window.fetch = savedFetch; });

  it('returns null when the get request is not ok', async () => {
    mockFetch({ get: () => Promise.resolve(new Response('', { status: 404 })) });
    expect(await fetchVersionHtml(PATH, { versionId: 'v1' })).to.be.null;
  });

  it('returns null (not an uncaught rejection) when the underlying fetch throws', async () => {
    mockFetch({ get: () => Promise.reject(new Error('network down')) });
    expect(await fetchVersionHtml(PATH, { versionId: 'v1' })).to.be.null;
  });
});
