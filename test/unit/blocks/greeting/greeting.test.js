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

describe('greeting page block', () => {
  let container;
  let sheets;

  beforeEach(() => {
    sheets = [...document.adoptedStyleSheets];
    container = document.createElement('main');
    container.innerHTML = `<div class="greeting">
      <div><div><h1>Welcome</h1></div></div>
      <div><div>user</div><div><h1>Welcome, [firstname]</h1></div></div>
    </div>`;
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
    document.adoptedStyleSheets = sheets;
    setImsResult(undefined);
  });

  it('shows the default greeting without a name to signed-out visitors', async () => {
    setProfile({ anonymous: true, accessToken: { token: 'anonymous-token' } });
    const greeting = await init(container.firstElementChild);
    await greeting.updateComplete;
    expect(greeting.querySelector('h1').textContent).to.equal('Welcome');
  });

  it('shows the user greeting with the first name when signed in', async () => {
    setProfile({ accessToken: { token: 'test-token' }, first_name: 'Ada' });
    const greeting = await init(container.firstElementChild);
    await greeting.updateComplete;
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(greeting.querySelector('h1').textContent).to.equal('Welcome, Ada');
  });

  it('adds its styles to the page once', async () => {
    setProfile({});
    const first = container.firstElementChild;
    const second = first.cloneNode(true);
    container.append(second);
    await init(first);
    await init(second);
    expect(document.adoptedStyleSheets.length).to.equal(sheets.length + 1);
  });
});
