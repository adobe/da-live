import { expect } from '@esm-bundle/chai';
import { createConfig } from '../../../scripts/config.js';
import {
  getAppUrl, getSiteUrl, parseSiteUrl, toSiteUrl, getPreviewUrl, parsePreviewUrl,
  parseDaUrl, getStoredContentOrigin, isAuthoringOrigin, isStageLocation,
  getCanvasPreviewUrl, getNxUrl, resolveUrlTemplate,
} from '../../../scripts/urls.js';

describe('Deployment URL routing', () => {
  const settings = createConfig({
    da: {
      domain: 'author.customer.example',
      owner: 'Customer-Org',
      services: {
        admin: { prod: 'https://bus.example:9443' },
        content: { prod: 'http://media.example:8788' },
        preview: {
          prod: 'https://proxy.example/author/{org}/{site}/{branch}',
          stage: 'https://test-proxy.example/{org}/{site}/{branch}',
        },
      },
    },
    aem: {
      liveUrl: 'https://publish.example/sites/{org}/{site}/{branch}',
      previewUrl: 'https://preview.example/render/{org}/{site}/{branch}',
      reviewUrl: 'https://review.example/{org}/{site}/{snapshot}/{branch}',
    },
    nx: {
      url: 'https://assets.example/{branch}/legacy-runtime',
      urlV2: 'https://other-assets.example/runtime-v2/{branch}',
    },
  });
  const values = { org: 'org', site: 'site', branch: 'feature' };

  it('builds arbitrary DA, site and review URLs without losing a mount path', () => {
    expect(getAppUrl('/apps/schema', false, settings)).to.equal('https://author.customer.example/apps/schema');
    expect(getSiteUrl('live', { ...values, path: '/folder/page', search: '?a=1', hash: '#part' }, settings))
      .to.equal('https://publish.example/sites/org/site/feature/folder/page?a=1#part');
    expect(getSiteUrl('review', { ...values, snapshot: 'release', path: '/page' }, settings))
      .to.equal('https://review.example/org/site/release/feature/page');
  });

  it('parses and converts path-based URLs while preserving the document path and query', () => {
    const url = getSiteUrl('live', { ...values, path: '/nested/page', search: '?a=1', hash: '#part' }, settings);
    expect(parseSiteUrl(url, {}, settings)).to.deep.equal({ ...values, pathname: '/nested/page', search: '?a=1', hash: '#part', tier: 'live' });
    expect(toSiteUrl(url, 'preview', settings))
      .to.equal('https://preview.example/render/org/site/feature/nested/page?a=1#part');
    expect(parseSiteUrl('https://publish.example/elsewhere/org/site/feature/page', {}, settings)).to.equal(null);
    expect(parseSiteUrl('https://publish.example.attacker.test/sites/org/site/feature/page', {}, settings)).to.equal(null);
  });

  it('supports custom hostname patterns and repeated placeholders without broad matching', () => {
    const custom = createConfig({ aem: { liveUrl: 'https://{site}-{org}.example/{site}/{branch}' } });
    const url = getSiteUrl('live', values, custom);
    expect(url).to.equal('https://site-org.example/site/feature');
    expect(parseSiteUrl(url, {}, custom)?.site).to.equal('site');
    expect(parseSiteUrl('https://site-org.example/other/feature', {}, custom)).to.equal(null);
  });

  it('preserves HTTP legacy recognition without relaxing explicit template origins', () => {
    expect(parseSiteUrl('http://main--site--org.aem.live/page')?.pathname).to.equal('/page');
    expect(parsePreviewUrl('http://main--site--org.preview.da.live/page')?.pathname).to.equal('/page');
    expect(parseSiteUrl('http://publish.example/sites/org/site/feature/page', {}, settings)).to.equal(null);
  });

  it('resolves proxy routes and selects the configured stage route for canvas', () => {
    const url = getPreviewUrl(settings.da.services.preview.prod, { ...values, path: '/page' });
    expect(url).to.equal('https://proxy.example/author/org/site/feature/page');
    expect(parsePreviewUrl(url, {}, settings)).to.deep.equal({ ...values, pathname: '/page', search: '', hash: '' });
    const location = new URL(getSiteUrl('preview', values, settings));
    expect(isStageLocation(location, settings)).to.equal(true);
    expect(getCanvasPreviewUrl(values, location, settings)).to.equal('https://test-proxy.example/org/site/feature');
    expect(getCanvasPreviewUrl(values, new URL(getAppUrl('', false, settings)), settings))
      .to.equal('https://proxy.example/author/org/site/feature');
  });

  it('requires context when a static site URL cannot identify its org and site', () => {
    const custom = createConfig({ aem: { liveUrl: 'https://single-site.example' } });
    expect(parseSiteUrl('https://single-site.example/page', {}, custom)).to.equal(null);
    expect(parseSiteUrl('https://single-site.example/page', values, custom))
      .to.include({ ...values, pathname: '/page' });
  });

  it('distinguishes content, admin and unrelated localhost ports', () => {
    expect(parseDaUrl('http://localhost:3000/img/logo.png')).to.equal(null);
    expect(parseDaUrl('http://localhost:8787/source/org/site/media.png'))
      .to.include({ service: 'admin', org: 'org', site: 'site', pathname: '/media.png' });
    expect(parseDaUrl('http://localhost:8788/org/site/media.png'))
      .to.include({ service: 'content', org: 'org', site: 'site', pathname: '/media.png' });
    const shared = createConfig({ da: { services: { admin: { prod: 'https://bus.example:9443' }, content: { prod: 'https://bus.example:8443' } } } });
    expect(parseDaUrl('https://bus.example:9443/source/org/site/image.png', shared)?.service).to.equal('admin');
    expect(parseDaUrl('https://bus.example:8443/org/site/image.png', shared)?.service).to.equal('content');
    expect(parseDaUrl('https://bus.example:7443/org/site/image.png', shared)).to.equal(null);
  });

  it('preserves the configured scheme and port for stored image metadata', () => {
    expect(getStoredContentOrigin('media.example', 'http://media.example:8788/org/site/page', settings))
      .to.equal('http://media.example:8788');
    expect(getStoredContentOrigin('stage-content.da.live', 'https://content.da.live/org/site/page'))
      .to.equal('https://stage-content.da.live');
    expect(getStoredContentOrigin('media.example.attacker.test', 'http://media.example:8788/page', settings))
      .to.equal(null);
  });

  it('normalizes GitHub DNS labels and requires explicit trust for path-based authoring previews', () => {
    const defaults = createConfig({ da: { owner: 'Customer-Org' } });
    expect(isAuthoringOrigin('https://main--da-live--Customer-Org.aem.page', defaults)).to.equal(true);
    expect(isAuthoringOrigin('https://main--da-live--Customer-Org.aem.page.attacker.test', defaults)).to.equal(false);
    expect(isAuthoringOrigin('https://preview.example', settings)).to.equal(false);
    const explicit = createConfig({
      da: { previewOrigins: ['https://preview.example:8443'] },
      aem: settings.aem,
    });
    expect(isAuthoringOrigin('https://preview.example:8443', explicit)).to.equal(true);
    expect(isAuthoringOrigin('https://preview.example', explicit)).to.equal(false);
    expect(isAuthoringOrigin('null', explicit)).to.equal(false);
  });

  it('resolves independently hosted NX versions and branch routes', () => {
    expect(getNxUrl('/nx', 'feature', false, settings)).to.equal('https://assets.example/feature/legacy-runtime');
    expect(getNxUrl('/nx', 'feature', true, settings)).to.equal('https://other-assets.example/runtime-v2/feature');
  });

  it('rejects unsafe identifier values and non-HTTP base templates', () => {
    expect(() => resolveUrlTemplate('https://example.com/{branch}', { branch: '../evil' })).to.throw();
    expect(() => resolveUrlTemplate('file:///tmp/test', {})).to.throw();
    expect(() => resolveUrlTemplate('https://user:password@example.com', {})).to.throw();
    expect(() => resolveUrlTemplate('https://example.com?url=x', {})).to.throw();
  });
});
