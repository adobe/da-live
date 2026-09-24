import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { createAssetListing, repositoryOrigin } from '../../../../../blocks/canvas/ew-panel-extensions/asset-list.js';

const origin = 'https://author-p1-e1.adobeaemcloud.com';
const search = `${origin}/adobe/repository/;api=search?path=%2Fcontent%2Fdam&assetType=file&limit=24`;
const rendition = 'http://ns.adobe.com/adobecloud/rel/rendition';
const metadata = 'http://ns.adobe.com/adobecloud/rel/metadata/asset';
const config = {
  repositoryId: 'author-p1-e1.adobeaemcloud.com',
  tierType: 'author',
  assetOrigin: 'publish-p1-e1.adobeaemcloud.com',
  isDmEnabled: false,
  insertAsLink: false,
};

function image(name = 'Example.jpg', extras = {}) {
  return {
    'repo:path': `/content/dam/${name}`,
    'repo:name': name,
    'repo:id': `urn:aaid:aem:${name}`,
    'dc:format': 'image/jpeg',
    'aem:formatName': 'jpeg',
    _links: { [rendition]: [{ name: '140x100', href: `${origin}/adobe/repository/thumb/${name}` }] },
    ...extras,
  };
}

function json(data) {
  return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('trusted AEM asset listing', () => {
  let previousFetch;

  beforeEach(() => { previousFetch = window.fetch; });
  afterEach(() => { window.fetch = previousFetch; });

  it('validates the repository before any authenticated fetch', () => {
    [
      'author-p1-e1.adobeaemcloud.com.evil.org',
      'author-p1-e1.adobeaemcloud.com:443',
      'author-p1-e1.adobeaemcloud.com@evil.org',
      'publish-p1-e1.adobeaemcloud.com',
    ].forEach((repositoryId) => {
      expect(() => repositoryOrigin({ ...config, repositoryId })).to.throw();
    });
    expect(() => createAssetListing({ ...config, repositoryId: 'delivery-p1-e1.adobeaemcloud.com', tierType: 'delivery' })).to.throw('not supported');
  });

  it('normalizes, filters and fetches thumbnails with host authentication', async () => {
    const fetchStub = sinon.stub().callsFake(async (url, opts) => {
      expect(opts.headers.Authorization).to.equal('Bearer live-token');
      expect(opts.redirect).to.equal('error');
      if (url === search) {
        return json({
          children: [
            image('a" onerror="evil.jpg', { 'dc:title': '<b>alt</b>' }),
            image('pending.jpg', { 'repo:scene7FileStatus': 'Publishing' }),
            image('pdf.pdf', { 'dc:format': 'application/pdf' }),
            image('no-mime.jpg', { 'dc:format': null }),
            image('missing.jpg', { 'aem:formatName': null }),
          ],
        });
      }
      return new Response(new Blob(['thumbnail'], { type: 'image/jpeg' }));
    });
    window.fetch = fetchStub;
    const listing = createAssetListing(config);
    const { assets, hasMore } = await listing.load({ token: 'live-token' });
    expect(hasMore).to.be.false;
    expect(assets).to.have.length(1);
    expect(assets[0].asset).to.include({
      path: '/content/dam/a" onerror="evil.jpg',
      name: 'a" onerror="evil.jpg',
      mimetype: 'image/jpeg',
    });
    expect(assets[0].thumbnail).to.be.instanceOf(Blob);
    expect(assets[0]).not.to.have.property('html');
    expect(fetchStub.callCount).to.equal(2);
  });

  it('uses the host-owned cursor and a fresh token on subsequent pages', async () => {
    const next = `${origin}/adobe/repository/content/dam;t=1790;api=search?start=2&limit=2&assetType=file`;
    const fetchStub = sinon.stub().callsFake(async (url) => {
      if (url === search) return json({ children: [image('first.jpg')], _links: { next: { href: next } } });
      if (url === next) return json({ children: [image('second.jpg')] });
      return new Response(new Blob(['thumbnail']));
    });
    window.fetch = fetchStub;
    const listing = createAssetListing(config);
    expect((await listing.load({ token: 'old-token' })).hasMore).to.be.true;
    const result = await listing.load({ more: true, token: 'new-token', url: 'https://evil.org/' });
    expect(result.assets[0].name).to.equal('second.jpg');
    expect(result.hasMore).to.be.false;
    const nextRequest = fetchStub.getCalls().find((call) => call.args[0] === next);
    expect(nextRequest.args[1].headers.Authorization).to.equal('Bearer new-token');
  });

  it('fetches the authenticated original once and prepares an image File for native drops', async () => {
    const fetchStub = sinon.stub().callsFake(async (url, options) => {
      expect(options.headers.Authorization).to.equal(['Bearer', 'live-token'].join(' '));
      if (url === search) return json({ children: [image('a photo.jpg')] });
      if (url.includes('/adobe/repository/thumb/')) return new Response(new Blob(['thumb'], { type: 'image/jpeg' }));
      if (url === `${origin}/content/dam/a%20photo.jpg`) {
        return new Response(new Blob(['original bytes'], { type: 'image/jpeg' }));
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    window.fetch = fetchStub;
    const listing = createAssetListing(config);
    await listing.load({ token: 'live-token' });
    const id = 'urn:aaid:aem:a photo.jpg';
    expect(listing.getFile(id)).to.be.undefined;
    const [first, second] = await Promise.all([
      listing.prepareFile(id, 'live-token'), listing.prepareFile(id, 'live-token'),
    ]);
    expect(first).to.equal(second);
    expect(first).to.be.instanceOf(File);
    expect(first.name).to.equal('a photo.jpg');
    expect(first.type).to.equal('image/jpeg');
    expect(await first.text()).to.equal('original bytes');
    expect(listing.getFile(id)).to.equal(first);
    expect(fetchStub.callCount).to.equal(3);
    try {
      await listing.prepareFile('https://evil.org/image.jpg', 'token');
      throw new Error('Expected an unknown image to fail');
    } catch (error) {
      expect(error.message).to.include('not in the asset list');
    }
  });

  it('rejects unexpected file responses and retries after a failed download', async () => {
    let attempts = 0;
    window.fetch = async (url) => {
      if (url === search) return json({ children: [image('photo.jpg', { _links: {} })] });
      attempts += 1;
      return attempts === 1
        ? new Response('Not an image', { headers: { 'content-type': 'text/html' } })
        : new Response(new Blob(['photo'], { type: 'image/jpeg' }));
    };
    const listing = createAssetListing(config);
    await listing.load({ token: 'token' });
    const id = 'urn:aaid:aem:photo.jpg';
    try {
      await listing.prepareFile(id, 'token');
      throw new Error('Expected invalid file response to fail');
    } catch (error) {
      expect(error.message).to.equal('AEM Assets did not return an image file.');
    }
    expect(listing.getFile(id)).to.be.undefined;
    expect((await listing.prepareFile(id, 'token')).type).to.equal('image/jpeg');
    expect(attempts).to.equal(2);
  });

  it('rejects cross-origin or non-search pagination URLs', async () => {
    for (const href of [
      'https://evil.org/steal',
      `${origin}/content/dam/other`,
      `${origin}/adobe/repository/;api=search/other`,
      `${origin}/adobe/repository/other;t=1790;api=search`,
    ]) {
      window.fetch = async () => json({ children: [], _links: { next: { href } } });
      const listing = createAssetListing(config);
      try {
        await listing.load({ token: 'token' });
        throw new Error('Expected invalid pagination to fail');
      } catch (error) {
        expect(error.message).to.equal('Invalid AEM Assets pagination URL.');
      }
    }
  });

  it('surfaces AEM response-body errors without exposing the access token', async () => {
    window.fetch = async () => new Response(JSON.stringify({ message: 'Access to this repository was denied for live-token' }), { status: 403 });
    try {
      await createAssetListing(config).load({ token: 'live-token' });
      throw new Error('Expected a search error');
    } catch (error) {
      expect(error.message).to.include('AEM Assets request failed (403)');
      expect(error.message).to.include('Access to this repository was denied');
      expect(error.message).not.to.include('live-token');
    }
    window.fetch = async () => new Response('Service unavailable', { status: 503 });
    try {
      await createAssetListing(config).load({ token: 'token' });
      throw new Error('Expected a search error');
    } catch (error) {
      expect(error.message).to.equal('AEM Assets request failed (503): Service unavailable.');
    }
  });

  it('requires verified DM approval and delivery activation, fetching missing metadata', async () => {
    const metaUrl = `${origin}/adobe/repository/meta/approved`;
    window.fetch = async (url) => {
      if (url === search) {
        return json({
          children: [
            image('approved.jpg', { _links: { [metadata]: { href: metaUrl } } }),
            image('unapproved.jpg', { _embedded: { [metadata]: { 'dam:assetStatus': 'pending', 'dam:activationTarget': 'delivery' } } }),
            image('wrong-target.jpg', { _embedded: { [metadata]: { 'dam:assetStatus': 'approved', 'dam:activationTarget': 'author' } } }),
          ],
        });
      }
      if (url === metaUrl) return json({ 'dam:assetStatus': 'approved', 'dam:activationTarget': 'delivery' });
      return new Response(new Blob(['thumb']));
    };
    const { assets } = await createAssetListing({ ...config, isDmEnabled: true, assetOrigin: 'delivery-p1-e1.adobeaemcloud.com' }).load({ token: 'token' });
    expect(assets.map(({ name }) => name)).to.deep.equal(['approved.jpg']);
    expect(assets[0]).not.to.have.property('html');
  });

  it('reports missing DM metadata rather than silently returning an empty page', async () => {
    window.fetch = async () => json({ children: [image('missing-metadata.jpg')] });
    try {
      await createAssetListing({ ...config, isDmEnabled: true }).load({ token: 'token' });
      throw new Error('Expected a missing-metadata error');
    } catch (error) {
      expect(error.message).to.include('Cannot verify AEM asset approval');
    }
  });

  it('keeps an asset when its thumbnail fails', async () => {
    window.fetch = async (url) => {
      if (url === search) return json({ children: [image('linked.jpg')] });
      return new Response('', { status: 403 });
    };
    const warning = sinon.stub(console, 'warn');
    try {
      const { assets } = await createAssetListing(config).load({ token: 'token' });
      expect(assets[0].thumbnail).to.be.null;
      expect(assets[0]).not.to.have.property('html');
      expect(warning.calledOnce).to.be.true;
    } finally {
      warning.restore();
    }
  });
});
