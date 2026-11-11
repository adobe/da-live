import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import init from '../../../../../blocks/shared/da-greeting/da-greeting.js';

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('da-greeting', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
  });

  afterEach(() => container.remove());

  async function fixture(markup, profile, variant) {
    container.innerHTML = `<div class="greeting">${markup}</div>`;
    const greeting = init(container.firstElementChild, { profile, variant });
    await greeting.updateComplete;
    await nextFrame();
    return greeting;
  }

  it('renders plain heading and paragraph text without reading an unused profile', async () => {
    const profile = { then: sinon.spy() };
    const greeting = await fixture(
      `<div><div><h2>Welcome</h2><p>Add a site or <a href="/start">create one</a>.</p></div></div>
       <div><div>other</div><div><p>Hi [firstname]</p></div></div>`,
      profile,
    );
    expect(greeting.querySelector('h2').textContent).to.equal('Welcome');
    expect(greeting.querySelector('p').textContent).to.equal('Add a site or create one.');
    expect(greeting.querySelector('a')).to.equal(null);
    expect(profile.then.called).to.equal(false);
  });

  it('waits for the profile and inserts the resolved first name as text', async () => {
    let resolveProfile;
    const profile = new Promise((resolve) => { resolveProfile = resolve; });
    const greeting = await fixture(
      '<div><div><h1>Hi <strong>[firstname]</strong></h1><p>Ready, [firstname]?</p></div></div>',
      profile,
    );
    expect(greeting.textContent).to.equal('');
    resolveProfile({ first_name: '  <Ada> $&  ' });
    await nextFrame();
    expect(greeting.querySelector('h1').textContent).to.equal('Hi <Ada> $&');
    expect(greeting.querySelector('p').textContent).to.equal('Ready, <Ada> $&?');
    expect(greeting.querySelector('strong, ada')).to.equal(null);
  });

  it('uses User when signed out or the first name is unavailable', async () => {
    for (const profile of [
      undefined,
      Promise.resolve(undefined),
      { anonymous: true, first_name: 'Ada' },
      { first_name: '  ' },
    ]) {
      const greeting = await fixture(
        '<div><div><h1>Hi [firstname], how can I help?</h1></div></div>',
        profile,
      );
      expect(greeting.querySelector('h1').textContent).to.equal('Hi User, how can I help?');
    }
  });

  it('keeps the generic greeting when the profile cannot be loaded', async () => {
    const greeting = await fixture(
      '<div><div><h1>Welcome, [firstname]</h1></div></div>',
      Promise.reject(new Error('Profile unavailable')),
    );
    expect(greeting.querySelector('h1').textContent).to.equal('Welcome, User');
  });

  it('renders unconditional rows and matching variants in authored order', async () => {
    const greeting = await fixture(`
      <div><div><h1>Welcome</h1></div></div>
      <div><div> first </div><div><p>First <a href="/start">choice</a>.</p></div></div>
      <div><div><p>Always here.</p></div></div>
      <div><div>second</div><div><p>Second choice.</p></div></div>
    `);
    const content = () => [...greeting.children].map((el) => el.textContent);
    expect(content()).to.deep.equal(['Welcome', 'Always here.']);

    greeting.variant = 'first';
    await greeting.updateComplete;
    expect(content()).to.deep.equal(['Welcome', 'First choice.', 'Always here.']);

    greeting.variant = 'second';
    await greeting.updateComplete;
    expect(content()).to.deep.equal(['Welcome', 'Always here.', 'Second choice.']);

    greeting.variant = 'unknown';
    await greeting.updateComplete;
    expect(content()).to.deep.equal(['Welcome', 'Always here.']);
  });

  it('personalizes the current variant when a profile resolves after switching variants', async () => {
    let resolveProfile;
    const profile = new Promise((resolve) => { resolveProfile = resolve; });
    const greeting = await fixture(
      `<div><div>first</div><div><h1>Hi [firstname]</h1></div></div>
       <div><div>second</div><div><h1>Welcome, [firstname]</h1></div></div>`,
      profile,
      'first',
    );
    expect(greeting.textContent).to.equal('');

    greeting.variant = 'second';
    await greeting.updateComplete;
    expect(greeting.textContent).to.equal('');

    resolveProfile({ first_name: 'Ada' });
    await nextFrame();
    expect(greeting.textContent).to.equal('Welcome, Ada');
  });
});
