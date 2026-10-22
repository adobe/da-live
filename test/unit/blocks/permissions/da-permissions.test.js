import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

await import('../../../../blocks/permissions/da-permissions/da-permissions.js');

const INFO_KEY = 'da-permissions-info-dismissed';

const CONFIG_BODY = {
  ':names': ['permissions'],
  ':version': 3,
  permissions: {
    total: 1,
    limit: 1,
    data: [{ path: 'CONFIG', groups: 'admin@example.com', actions: 'write' }],
  },
};

const NO_SHEET_BODY = {
  ':names': ['data'],
  data: { total: 0, limit: 0, data: [] },
};

async function mount(org, site = null) {
  const el = document.createElement('da-permissions');
  el.org = org;
  el.site = site;
  document.body.append(el);
  await el.updateComplete;
  // _load() is async (fetch-backed); poll until it settles past 'loading'.
  for (let i = 0; i < 50 && el._status === 'loading'; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 10); });
    // eslint-disable-next-line no-await-in-loop
    await el.updateComplete;
  }
  return el;
}

describe('da-permissions', () => {
  let savedFetch;

  beforeEach(() => {
    savedFetch = window.fetch;
    localStorage.removeItem(INFO_KEY);
  });

  afterEach(() => {
    window.fetch = savedFetch;
    document.querySelectorAll('da-permissions').forEach((el) => el.remove());
    localStorage.removeItem(INFO_KEY);
  });

  it('403 -> "You don\'t have admin access to this org."', async () => {
    window.fetch = async () => new Response('', { status: 403 });
    const el = await mount('myorg');
    expect(el.shadowRoot.textContent).to.contain("You don't have admin access to this org.");
  });

  it('no permissions sheet -> the no-sheet copy, a link to /config#/myorg/, and no table "+" buttons', async () => {
    window.fetch = async () => new Response(JSON.stringify(NO_SHEET_BODY), { status: 200 });
    const el = await mount('myorg');
    expect(el.shadowRoot.textContent).to.contain('This org has no permissions sheet yet');
    const link = el.shadowRoot.querySelector('a[href="/config#/myorg/"]');
    expect(link).to.not.equal(null);
    expect(el.shadowRoot.querySelector('da-permissions-table')).to.equal(null);
  });

  it('ok -> renders a table with slots from buildSlots, and the picker items include site names', async () => {
    window.fetch = async (url) => {
      const href = String(url);
      if (href.includes('/list/')) {
        return new Response(JSON.stringify([{ name: 'site1' }, { name: 'site2' }]), { status: 200 });
      }
      return new Response(JSON.stringify(CONFIG_BODY), { status: 200 });
    };
    const el = await mount('myorg');

    const table = el.shadowRoot.querySelector('da-permissions-table');
    expect(table).to.not.equal(null);
    expect(table.slots.some((s) => s.path === 'CONFIG')).to.be.true;

    const picker = el.shadowRoot.querySelector('nx-picker');
    const labels = picker.items.filter((i) => !i.divider).map((i) => i.label);
    expect(labels).to.include('site1');
    expect(labels).to.include('site2');
  });

  it('dismissing the info note sets localStorage, and the note stays hidden on remount', async () => {
    window.fetch = async () => new Response('', { status: 403 });
    let el = await mount('myorg');

    expect(el.shadowRoot.querySelector('.permissions-info-note')).to.not.equal(null);
    el.shadowRoot.querySelector('.permissions-info-note button').click();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.permissions-info-note')).to.equal(null);
    expect(localStorage.getItem(INFO_KEY)).to.equal('true');
    el.remove();

    el = await mount('myorg');
    expect(el.shadowRoot.querySelector('.permissions-info-note')).to.equal(null);
  });

  it('org === null -> renders an org form; submitting "myorg" sets location.hash', async () => {
    const el = await mount(null);
    const form = el.shadowRoot.querySelector('form');
    expect(form).to.not.equal(null);

    window.location.hash = '';
    const input = el.shadowRoot.querySelector('input[name="org"]');
    input.value = 'myorg';
    form.requestSubmit();
    await el.updateComplete;
    expect(window.location.hash).to.equal('#/myorg');
  });
});
