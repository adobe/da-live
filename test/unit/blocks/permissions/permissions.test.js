import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { userAdminUrl, handleRoute } = await import('../../../../blocks/permissions/permissions.js');

describe('permissions userAdminUrl', () => {
  it('builds the Helix 6 user-admin URL with encoded org and site', () => {
    const url = userAdminUrl('my org', 's/1');
    expect(url).to.equal('https://tools.aem.live/tools/user-admin/index.html?org=my%20org&site=s%2F1');
  });
});

describe('permissions handleRoute', () => {
  let el;

  beforeEach(() => {
    el = document.createElement('div');
  });

  it('redirects to the Helix 6 user-admin URL and does not mount the component', async () => {
    let replacedUrl;
    const replace = (url) => { replacedUrl = url; };
    await handleRoute(el, { org: 'o', site: 's' }, { isHlx6: async () => true, replace });

    expect(replacedUrl).to.equal(userAdminUrl('o', 's'));
    expect(el.querySelector('da-permissions')).to.equal(null);
  });

  it('mounts da-permissions with org/site when not Helix 6', async () => {
    const replace = () => { throw new Error('should not redirect'); };
    await handleRoute(el, { org: 'o', site: 's' }, { isHlx6: async () => false, replace });

    const cmp = el.querySelector('da-permissions');
    expect(cmp).to.not.equal(null);
    expect(cmp.org).to.equal('o');
    expect(cmp.site).to.equal('s');
  });

  it('does not call isHlx6 when site is null, and mounts with site null', async () => {
    let called = false;
    const isHlx6 = async () => {
      called = true;
      return true;
    };
    const replace = () => { throw new Error('should not redirect'); };
    await handleRoute(el, { org: 'o', site: null }, { isHlx6, replace });

    expect(called).to.be.false;
    const cmp = el.querySelector('da-permissions');
    expect(cmp).to.not.equal(null);
    expect(cmp.org).to.equal('o');
    expect(cmp.site).to.equal(null);
  });

  it('mounts with org null and site null when details is null', async () => {
    const isHlx6 = async () => { throw new Error('should not be called'); };
    const replace = () => { throw new Error('should not redirect'); };
    await handleRoute(el, null, { isHlx6, replace });

    const cmp = el.querySelector('da-permissions');
    expect(cmp).to.not.equal(null);
    expect(cmp.org).to.equal(null);
    expect(cmp.site).to.equal(null);
  });

  it('reuses the same element across route changes', async () => {
    const replace = () => { throw new Error('should not redirect'); };
    await handleRoute(el, { org: 'o', site: null }, { isHlx6: async () => false, replace });
    const first = el.querySelector('da-permissions');

    await handleRoute(el, { org: 'o2', site: null }, { isHlx6: async () => false, replace });
    const second = el.querySelector('da-permissions');

    expect(second).to.equal(first);
    expect(second.org).to.equal('o2');
  });
});
