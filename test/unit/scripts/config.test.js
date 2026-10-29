import { expect } from '@esm-bundle/chai';
import config, { createConfig, getServiceEnvs } from '../../../scripts/config.js';
import {
  getServiceOrigins, parseSiteUrl, parsePreviewUrl, isStageLocation, toSiteUrl, isAuthoringOrigin,
} from '../../../scripts/urls.js';
import { setNx } from '../../../scripts/utils.js';
import { getDaAdmin } from '../../../blocks/shared/constants.js';
import getPathDetails from '../../../blocks/shared/pathDetails.js';

describe('Deployment configuration', () => {
  const custom = createConfig({
    da: {
      domain: 'author.example.com',
      pageDomain: 'author-test.example.com',
      owner: 'customer',
      repo: 'author',
      services: { admin: { prod: 'https://api.example.net' } },
      pageServices: { content: { stage: 'https://test-content.example.net' } },
    },
    aem: {
      previewHost: 'customer.page',
      liveHost: 'customer.live',
      reviewHost: 'customer.reviews',
      adminOrigin: 'https://admin.example.net',
    },
    nx: { owner: 'customer', repo: 'customer-nx' },
    ims: { clientId: 'customer-author' },
  });

  it('keeps upstream overrides empty and Adobe service defaults intact', () => {
    expect(config).to.deep.equal(createConfig());
    expect(getServiceEnvs('admin', 'https://da.live').prod).to.equal('https://admin.da.live');
    expect(getServiceEnvs('admin', 'https://da.page').prod).to.equal('https://admin.da.page');
    expect(getServiceEnvs('collab', 'https://da.page').stage).to.equal('wss://stage-collab.da.page');
    expect(config.aem.adminOrigin).to.equal('https://admin.hlx.page');
    expect(config.aem.previewHost).to.equal('aem.page');
  });

  it('derives services from domains while merging individual environment overrides', () => {
    const admin = getServiceEnvs('admin', 'https://author.example.com', custom);
    expect(admin).to.deep.equal({
      local: 'http://localhost:8787',
      stage: 'https://stage-admin.author.example.com',
      prod: 'https://api.example.net',
    });
    expect(custom.da.services.content.prod).to.equal('https://content.author.example.com');
    expect(custom.da.pageServices.content.stage).to.equal('https://test-content.example.net');
    expect(custom.da.pageServices.content.prod).to.equal('https://content.author-test.example.com');
    expect(custom.aem.apiOrigin).to.equal(config.aem.apiOrigin);
    expect(custom.nx).to.deep.equal({ owner: 'customer', repo: 'customer-nx' });
    expect(custom.ims.clientId).to.equal('customer-author');
  });

  it('selects the alternate endpoints only for the exact configured app origin', () => {
    expect(getServiceEnvs('admin', 'https://author-test.example.com', custom).prod)
      .to.equal('https://admin.author-test.example.com');
    expect(getServiceEnvs('admin', 'https://author-test.example.com.attacker.test', custom).prod)
      .to.equal('https://api.example.net');
  });

  it('recognizes configured content suffixes and preserves legacy hosts', () => {
    expect(parseSiteUrl('https://main--site--org.customer.page', {}, custom)).to.exist;
    expect(parseSiteUrl('https://main--site--org.hlx.live', {}, custom)).to.exist;
    expect(parseSiteUrl('https://main--site--org.customer.live.attacker.test', {}, custom)).to.equal(null);
    expect(parseSiteUrl('https://main--site--org.notcustomer.page', {}, custom)).to.equal(null);
    expect(parseSiteUrl('https://main--site--org.hlx.live', {}, createConfig({ aem: { legacyHosts: [] } }))).to.equal(null);
    expect(isStageLocation({ hostname: 'main--site--org.customer.page' }, custom)).to.equal(true);
    expect(isStageLocation({ hostname: 'main--site--org.customer.live' }, custom)).to.equal(false);
    expect(isStageLocation({ hostname: 'localhost' }, custom)).to.equal(true);
  });

  it('rewrites only a recognized trailing content suffix', () => {
    expect(toSiteUrl('https://main--site--org.customer.live/page', 'preview', custom))
      .to.equal('https://main--site--org.customer.page/page');
    expect(toSiteUrl('https://main--site--org.hlx.page/page', 'live', custom))
      .to.equal('https://main--site--org.customer.live/page');
    expect(toSiteUrl('https://main--site--org.customer.live.attacker.test/page', 'preview', custom))
      .to.equal('https://main--site--org.customer.live.attacker.test/page');
  });

  it('recognizes configured preview services and independent service origins', () => {
    expect(parsePreviewUrl('https://main--site--org.preview.author.example.com', {}, custom)).to.exist;
    expect(parsePreviewUrl('https://main--site--org.stage-preview.author-test.example.com', {}, custom)).to.exist;
    expect(parsePreviewUrl('https://main--site--org.preview.author.example.com.attacker.test', {}, custom)).to.equal(null);
    expect(getServiceOrigins('admin', custom)).to.include('https://api.example.net');
    expect(getServiceOrigins('content', custom)).to.include('https://test-content.example.net');
  });

  it('trusts only configured app origins and branch previews of the configured repository', () => {
    ['https://author.example.com', 'https://author-test.example.com',
      'https://feature--author--customer.customer.page', 'http://localhost:3000',
      'https://localhost'].forEach((origin) => {
      expect(isAuthoringOrigin(origin, custom), origin).to.equal(true);
    });
    ['null', 'not a URL', 'http://author.example.com', 'https://author.example.com:8443',
      'https://author.example.com.attacker.test',
      'https://main--other--customer.customer.page',
      'https://main--author--other.customer.page',
      'https://evil.main--author--customer.customer.page',
      'https://main--author--customer.customer.page.attacker.test',
      'https://main--author--customer.customer.page:8443'].forEach((origin) => {
      expect(isAuthoringOrigin(origin, custom), origin).to.equal(false);
    });
  });

  it('uses custom settings in endpoint selection, NX loading and generated content links', () => {
    const original = { ...config };
    const previousEnv = localStorage.getItem('da-admin');
    try {
      Object.assign(config, custom);
      expect(getDaAdmin(new URL('https://author.example.com/?da-admin=reset')))
        .to.equal('https://api.example.net');
      expect(getDaAdmin(new URL('https://author.example.com/?da-admin=stage')))
        .to.equal('https://stage-admin.author.example.com');
      expect(getDaAdmin(new URL('https://author.example.com/?da-admin=local')))
        .to.equal('http://localhost:8787');
      expect(getDaAdmin(new URL('https://author-test.example.com/?da-admin=reset')))
        .to.equal('https://admin.author-test.example.com');
      expect(setNx('/nx', { hostname: 'main--author--customer.customer.page' }))
        .to.equal('https://main--customer-nx--customer.customer.live/nx');
      expect(setNx('/nx', { hostname: 'author.example.com' })).to.equal('/nx');
      const details = getPathDetails({ pathname: '/edit', hash: '#/org/site/custom-config-test' });
      expect(details.previewUrl).to.equal('https://main--site--org.customer.live/custom-config-test');
    } finally {
      Object.assign(config, original);
      getDaAdmin(new URL('https://da.live/?da-admin=reset'));
      if (previousEnv) localStorage.setItem('da-admin', previousEnv);
      setNx('/nx');
    }
  });
});
