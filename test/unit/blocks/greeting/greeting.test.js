import { expect } from '@esm-bundle/chai';
import '../../setup-nx.js';
import init from '../../../../blocks/greeting/greeting.js';
import { getNx } from '../../../../scripts/utils.js';

const { setImsResult } = await import(`${getNx()}/utils/ims.js`);
const ims = {};

function setProfile(profile) {
  Object.keys(ims).forEach((key) => { delete ims[key]; });
  Object.assign(ims, profile);
  setImsResult(ims);
}

describe('Greeting block', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    container.innerHTML = `<div class="greeting">
      <div><div><h1>Welcome</h1></div></div>
      <div><div>user</div><div><h1>Hi [firstname]</h1></div></div>
    </div>`;
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
    setImsResult(undefined);
  });

  it('uses the default greeting when sign-in initialization fails', async () => {
    setImsResult(Promise.reject(new Error('Profile unavailable')));
    const greeting = await init(container.firstElementChild);
    await greeting.updateComplete;
    expect(greeting.querySelector('h1').textContent).to.equal('Welcome');
  });

  it('waits for sign-in and mounts the user variant once without flashing the default', async () => {
    setProfile({ accessToken: { token: 'test-token' }, first_name: 'Ada' });
    let resolveProfile;
    setImsResult(new Promise((resolve) => { resolveProfile = resolve; }));
    const authored = container.firstElementChild;
    const rendered = [];
    const observer = new MutationObserver(() => {
      const text = container.querySelector('da-greeting')?.textContent;
      if (text) rendered.push(text);
    });
    observer.observe(container, { childList: true, subtree: true });
    try {
      const pending = init(authored);
      expect(init(authored)).to.equal(pending);
      expect(authored.hidden).to.equal(true);
      expect(container.querySelector('da-greeting')).to.equal(null);
      resolveProfile(ims);
      const greeting = await pending;
      await greeting.updateComplete;
      await new Promise((resolve) => { setTimeout(resolve, 0); });
      expect(greeting.querySelector('h1').textContent).to.equal('Hi Ada');
      expect(rendered).to.include('Hi Ada');
      expect(rendered).not.to.include('Welcome');
      expect(await init(authored)).to.equal(greeting);
      expect(container.querySelectorAll('da-greeting')).to.have.length(1);
    } finally {
      observer.disconnect();
    }
  });

  [
    { profile: { anonymous: true, accessToken: { token: 'anonymous-token' } }, userRow: true, label: 'anonymous' },
    { profile: { first_name: 'Ada' }, userRow: true, label: 'missing an access token' },
    { profile: { accessToken: { token: 'test-token' }, first_name: 'Ada' }, userRow: false, label: 'without a user row' },
  ].forEach(({ profile, userRow, label }) => {
    it(`uses the default greeting for a visitor ${label}`, async () => {
      setProfile(profile);
      const authored = container.firstElementChild;
      if (!userRow) authored.lastElementChild.remove();
      const greeting = await init(authored);
      await greeting.updateComplete;
      expect(greeting.querySelector('h1').textContent).to.equal('Welcome');
    });
  });
});
