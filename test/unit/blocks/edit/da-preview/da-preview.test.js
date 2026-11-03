import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

await import('../../../../../blocks/edit/da-preview/da-preview.js');

const nextTick = () => new Promise((resolve) => { setTimeout(resolve, 10); });

async function waitFor(check, tries = 50) {
  if (check() || tries <= 0) return;
  await nextTick();
  await waitFor(check, tries - 1);
}

describe('da-preview rendering version', () => {
  let savedFetch;
  let savedHash;
  let el;
  let configs;

  const json = (data) => new Response(JSON.stringify({ data }), { status: 200 });

  const navigate = (org) => {
    window.location.hash = `#/${org}/site/page`;
    if (el) el.path = `https://main--site--${org}.aem.page/page`;
  };

  const mount = (org) => {
    navigate(org);
    el = document.createElement('da-preview');
    el.path = `https://main--site--${org}.aem.page/page`;
    document.body.append(el);
  };

  beforeEach(() => {
    savedFetch = window.fetch;
    savedHash = window.location.hash;
    window.localStorage.removeItem('nx-ims');
    configs = {};
    window.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/ping/')) return new Response('', { status: 200 });
      const key = Object.keys(configs).find((p) => u.endsWith(p));
      return key ? configs[key]() : json([]);
    };
  });

  afterEach(() => {
    el?.remove();
    el = undefined;
    window.fetch = savedFetch;
    window.location.hash = savedHash;
  });

  it('defaults to rendering version 2 without config', async () => {
    mount('rvpnone');
    await waitFor(() => el._renderingVersion !== undefined);
    expect(el._renderingVersion).to.equal(2);
  });

  it('uses rendering version 1 when configured', async () => {
    configs['/rvpone/'] = () => json([{ key: 'editor.renderingVersion', value: '1' }]);
    mount('rvpone');
    await waitFor(() => el._renderingVersion !== undefined);
    expect(el._renderingVersion).to.equal(1);
  });

  it('reloads the rendering version when navigating to another site', async () => {
    configs['/rvpnava/'] = () => json([{ key: 'editor.renderingVersion', value: '1' }]);
    mount('rvpnava');
    await waitFor(() => el._renderingVersion === 1);
    expect(el._renderingVersion).to.equal(1);

    navigate('rvpnavb');
    await waitFor(() => el._renderingVersion === 2);
    expect(el._renderingVersion).to.equal(2);
  });

  it('ignores a late response for the previous site', async () => {
    let releaseFirst;
    const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
    configs['/rvpslowa/'] = async () => {
      await firstGate;
      return json([{ key: 'editor.renderingVersion', value: '2' }]);
    };
    configs['/rvpslowb/'] = () => json([{ key: 'editor.renderingVersion', value: '1' }]);

    mount('rvpslowa');
    await nextTick();
    navigate('rvpslowb');
    await waitFor(() => el._renderingVersion === 1);

    releaseFirst();
    await nextTick();
    await nextTick();
    expect(el._renderingVersion).to.equal(1);
  });
});
