import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { parseSubdomain, hasOrgAdminGrant, getCreateSiteHref, checkSiteChoices, addExistingSite } from '../../../../blocks/shared/site-access.js';

describe('shared site access', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('accepts only complete supported site URLs without credentials', () => {
    ['aem.page', 'aem.live', 'hlx.page', 'hlx.live'].forEach((domain) => {
      expect(parseSubdomain(`https://main--my-site--my-org.${domain}/page`)).to.equal('#/my-org/my-site');
    });
    [
      'not a URL', 'https://example.com', 'https://main--site.aem.live',
      'https://main--site--org.fakeaem.live', 'https://main--site--org.aem.live.evil.com',
      'https://user:password@main--site--org.aem.live', 'ftp://main--site--org.aem.live',
      'https://main--site--org--extra.aem.live',
    ].forEach((href) => expect(parseSubdomain(href), href).to.equal(null));
  });

  it('does not infer org administration from child or fallback permissions', () => {
    const response = new Response(null, { headers: { 'x-da-actions': '/=read', 'x-da-child-actions': '/**=write' } });
    response.permissions = ['read', 'write'];
    expect(hasOrgAdminGrant(response)).to.equal(false);
    expect(hasOrgAdminGrant(new Response(null, { status: 403, headers: { 'x-da-actions': '/=read,write' } }))).to.equal(false);
  });

  it('preserves preview parameters but removes the old site and Browse route from creation', () => {
    const url = new URL(getCreateSiteHref({ org: 'org', href: 'https://sitepick--da-live--adobe.aem.live/?browse=2&nx=pickmenu&site=old#/org/site' }));
    expect(url.pathname).to.equal('/start');
    expect(url.searchParams.get('nx')).to.equal('pickmenu');
    expect(url.searchParams.get('org')).to.equal('org');
    expect(url.searchParams.has('site')).to.equal(false);
    expect(url.searchParams.has('browse')).to.equal(false);
    expect(url.hash).to.equal('');
  });

  it('hides confirmed denials without mutating choices or hiding uncertain failures', async () => {
    const sites = ['allowed', 'denied', 'offline'].map((site) => ({ value: `org/${site}` }));
    const source = {
      list: async (path) => {
        if (path.endsWith('offline')) throw new Error('Offline');
        return { ok: path.endsWith('allowed') };
      },
      getMetadata: async () => new Response(null, { status: 403 }),
    };
    const result = await checkSiteChoices({ sites, source, signal: new AbortController().signal });
    expect(result.sites).to.deep.equal([sites[0], sites[2]]);
    expect(sites).to.have.length(3);
    expect(result.inaccessibleSites.has('org/denied')).to.equal(true);
    expect(result.error).to.equal('Offline');
  });

  it('retains denied history without clearing denials or permitting unauthorized additions', async () => {
    const sites = ['current', 'denied', 'allowed'].map((site) => ({ value: `org/${site}` }));
    const source = {
      list: async (path) => ({ ok: path.endsWith('allowed') }),
      getMetadata: async () => new Response(null, { status: 403 }),
    };
    const { signal } = new AbortController();
    const result = await checkSiteChoices({ sites, source, signal });
    expect(result.sites).to.deep.equal([sites[2]]);
    expect([...result.inaccessibleSites]).to.deep.equal(['org/current', 'org/denied']);
    const next = await checkSiteChoices(
      { sites, source, signal, inaccessibleSites: result.inaccessibleSites },
    );
    expect(next.sites).to.deep.equal([sites[2]]);
    expect(next.inaccessibleSites.has('org/current')).to.equal(true);
    const save = sinon.stub(Storage.prototype, 'setItem');
    try {
      await addExistingSite({ value: 'org/current', source, signal });
      expect.fail('Expected access denial');
    } catch (error) {
      expect(error.message).to.include('You do not have access');
    }
    expect(save.called).to.equal(false);
  });

  it('keeps cached denials during uncertainty and restores choices after access is granted', async () => {
    const sites = ['denied', 'unknown'].map((site) => ({ value: `org/${site}` }));
    const inaccessibleSites = new Set(['org/denied']);
    const list = sinon.stub().rejects(new Error('Offline'));
    const source = { list };
    const { signal } = new AbortController();
    const result = await checkSiteChoices({ sites, source, signal, inaccessibleSites });
    expect(result.sites).to.deep.equal([sites[1]]);
    expect(result.error).to.include('Offline');
    expect([...inaccessibleSites]).to.deep.equal(['org/denied']);
    list.resolves({ ok: true });
    const restored = await checkSiteChoices({
      sites,
      source,
      signal,
      inaccessibleSites: result.inaccessibleSites,
    });
    expect(restored.sites).to.deep.equal(sites);
    expect(restored.inaccessibleSites.size).to.equal(0);
    expect(restored.error).to.equal(undefined);
  });

  it('does not classify authentication, missing resources or server errors as confirmed denials', async () => {
    const sites = [{ value: 'org/site' }];
    const { signal } = new AbortController();
    for (const status of [401, 404, 429, 500]) {
      const source = {
        list: async () => ({ ok: false }),
        getMetadata: async () => new Response(null, { status }),
      };
      const result = await checkSiteChoices({ sites, source, signal });
      expect(result.sites).to.deep.equal(sites);
      expect(result.inaccessibleSites.size).to.equal(0);
      expect(result.error).to.be.a('string').and.not.equal('');
    }
  });

  it('reports unstructured SDK failures without hiding unchecked choices', async () => {
    const sites = [{ value: 'org/site' }];
    const { signal } = new AbortController();
    for (const error of ['http', '', undefined, null, {}]) {
      const source = { list: () => Promise.reject(error) };
      const result = await checkSiteChoices({ sites, source, signal });
      expect(result.sites).to.deep.equal(sites);
      expect(result.inaccessibleSites.size).to.equal(0);
      expect(result.error).to.include('org/site');
      if (error === 'http') expect(result.error).to.include('http');
    }
  });

  it('rejects cancelled checks instead of publishing stale choices', async () => {
    const request = new AbortController();
    const source = {
      list: async () => {
        request.abort();
        return { ok: true };
      },
    };
    try {
      await checkSiteChoices({ sites: [{ value: 'org/site' }], source, signal: request.signal });
      expect.fail('Expected cancellation');
    } catch (error) {
      expect(error.name).to.equal('AbortError');
    }
  });

  it('finds an existing site on a later organization-list page', async () => {
    const storage = sinon.stub(Storage.prototype, 'getItem').returns('["aemsites/devlive"]');
    const save = sinon.stub(Storage.prototype, 'setItem');
    const source = { list: sinon.stub() };
    source.list.onCall(0).resolves({ ok: true });
    source.list.onCall(1).resolves({ ok: true, items: [], continuationToken: 'next' });
    source.list.onCall(2).resolves({ ok: true, items: [{ name: 'site' }] });
    await addExistingSite({ value: 'org/site', source, signal: new AbortController().signal });
    expect(source.list.thirdCall.args[1].continuationToken).to.equal('next');
    expect(storage.calledWith('da-sites')).to.equal(true);
    expect(save.calledOnceWithExactly('da-sites', '["org/site","aemsites/devlive"]')).to.equal(true);
  });

  it('rejects repeated pagination tokens without saving or claiming success', async () => {
    const save = sinon.stub(Storage.prototype, 'setItem');
    const source = { list: sinon.stub().resolves({ ok: true, items: [], continuationToken: 'again' }) };
    try {
      await addExistingSite({ value: 'org/site', source, signal: new AbortController().signal });
      expect.fail('Expected incomplete listing');
    } catch (error) {
      expect(error.message).to.include('listing did not complete');
    }
    expect(save.called).to.equal(false);
  });
});
