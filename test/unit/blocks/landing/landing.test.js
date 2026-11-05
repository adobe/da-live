import { expect } from '@esm-bundle/chai';
import { setNx, getNx, getNxEWFlags } from '../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
const { default: init } = await import('../../../../blocks/landing/landing.js');
const { hashChange } = await import(`${getNx()}/utils/utils.js`);
const { CHAT_EVENT, setAoChat } = await import(`${getNx()}/utils/chat.js`);
const { PANEL_EVENT, setPanelMocks } = await import(`${getNx()}/utils/panel.js`);
const { setImsProfile } = await import(`${getNx()}/utils/ims.js`);
const { setChatAvailability } = await getNxEWFlags();
const css = await fetch('/blocks/landing/landing.css').then((response) => response.text());
const styles = new CSSStyleSheet();
styles.replaceSync(css);

describe('landing background', () => {
  let el;
  let container;
  let originalStyles;
  let originalHref;

  beforeEach(() => {
    originalHref = window.location.href;
    originalStyles = document.adoptedStyleSheets;
    document.adoptedStyleSheets = [...originalStyles, styles];
    el = document.createElement('div');
    el.className = 'browse';
    container = document.createElement('div');
    container.style.height = '400px';
    container.innerHTML = '<div class="section"><div class="block-content"></div></div>';
    container.querySelector('.block-content').append(el);
    el.style.setProperty('--s2-red-100', '#fff6f5');
    el.style.setProperty('--s2-pink-200', '#ffe8f7');
    el.style.setProperty('--s2-indigo-200', '#ebeeff');
    el.style.setProperty('--s2-blue-100', '#f5f9ff');
    el.style.setProperty('--s2-gray-25', '#fff');
    el.innerHTML = '<picture><img alt="Old background"></picture>';
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
    document.adoptedStyleSheets = originalStyles;
    document.body.classList.remove('dark-scheme');
    history.replaceState(null, '', originalHref);
  });

  it('replaces old content with only an empty background surface', () => {
    init(el);
    expect(el.children.length).to.equal(1);
    expect(el.firstElementChild.className).to.equal('landing');
    expect(el.firstElementChild.childNodes.length).to.equal(0);
    expect(el.querySelector('img, picture')).to.equal(null);
  });

  it('fills its container with a wider warm left and narrow pink, fading to white at 85% height', () => {
    init(el);
    const surface = el.firstElementChild;
    const computed = getComputedStyle(surface);
    expect(surface.getBoundingClientRect().height).to.equal(400);
    expect(computed.opacity).to.equal('1');
    expect(computed.backgroundImage).to.match(
      /^linear-gradient\(.*25%, rgb\(255, 255, 255\) 85%\), linear-gradient\(to right,/,
    );
    ['rgb(255, 246, 245) 0%', 'rgb(255, 246, 245) 20%', 'rgb(255, 232, 247) 40%',
      'rgb(235, 238, 255) 50%', 'rgb(245, 249, 255) 100%']
      .forEach((color) => expect(computed.backgroundImage).to.include(color));
  });

  it('keeps the dark scheme scoped to the mounted landing surface', () => {
    document.body.classList.add('dark-scheme');
    const before = getComputedStyle(document.body).colorScheme;
    init(el);
    expect(getComputedStyle(document.body).colorScheme).to.equal('dark');
    el.replaceChildren();
    expect(getComputedStyle(document.body).colorScheme).to.equal(before);
  });

  it('previews light mode without changing the saved theme or other pages', () => {
    const savedTheme = localStorage.getItem('color-scheme');
    document.body.classList.add('dark-scheme');
    history.replaceState(null, '', '?theme=light');
    init(el);
    expect(getComputedStyle(document.body).colorScheme).to.equal('light');
    expect(localStorage.getItem('color-scheme')).to.equal(savedTheme);
    el.replaceChildren();
    expect(getComputedStyle(document.body).colorScheme).not.to.equal('light');
  });

  it('previews dark mode without changing the saved theme or other pages', () => {
    const savedTheme = localStorage.getItem('color-scheme');
    const before = getComputedStyle(document.body).colorScheme;
    history.replaceState(null, '', '?theme=dark');
    init(el);
    expect(getComputedStyle(document.body).colorScheme).to.equal('dark');
    expect(localStorage.getItem('color-scheme')).to.equal(savedTheme);
    el.replaceChildren();
    expect(getComputedStyle(document.body).colorScheme).to.equal(before);
  });

  it('mirrors light and dark positions with the original middle colors', () => {
    init(el);
    const lightPositions = getComputedStyle(el.firstElementChild).backgroundImage.match(/[\d.]+%/g);
    history.replaceState(null, '', '?theme=dark');
    el.style.setProperty('--s2-red-100', 'light-dark(#fff6f5, #360a03)');
    el.style.setProperty('--s2-pink-200', 'light-dark(#ffe8f7, #47002c)');
    el.style.setProperty('--s2-indigo-200', 'light-dark(#ebeeff, #23006e)');
    el.style.setProperty('--s2-blue-100', 'light-dark(#f5f9ff, #0e173f)');
    el.style.setProperty('--s2-gray-25', 'light-dark(#fff, #111)');
    init(el);
    const background = getComputedStyle(el.firstElementChild).backgroundImage;
    expect(background.match(/[\d.]+%/g)).to.deep.equal(lightPositions);
    expect(background).to.include('rgb(71, 0, 44) 40%');
    expect(background).to.include('rgb(35, 0, 110) 50%');
    expect(background).not.to.match(/color\(srgb [^)]+\) 50%/);
    expect(background).to.include('rgb(17, 17, 17) 85%');
  });
});

describe('landing chat', () => {
  let el;
  let registered;
  let panelEvents;
  const onPanel = ({ type, detail }) => panelEvents.push([type, detail.section]);

  const waitFor = async (check) => {
    for (let i = 0; i < 50; i += 1) {
      if (check()) return;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => { setTimeout(resolve, 10); });
    }
    throw new Error('Timed out waiting for the landing');
  };

  const mount = async () => {
    init(el);
    const landing = el.querySelector('da-landing');
    await landing.updateComplete;
    return landing;
  };

  beforeEach(() => {
    registered = [];
    panelEvents = [];
    setPanelMocks({ register: (...args) => registered.push(args) });
    document.addEventListener(PANEL_EVENT.OPEN, onPanel);
    document.addEventListener(PANEL_EVENT.CLOSE, onPanel);
    el = document.createElement('div');
    document.body.append(el);
  });

  afterEach(() => {
    el.remove();
    document.removeEventListener(PANEL_EVENT.OPEN, onPanel);
    document.removeEventListener(PANEL_EVENT.CLOSE, onPanel);
    setPanelMocks();
    setAoChat(async () => false);
    setImsProfile(undefined);
    setChatAvailability(async () => false);
    hashChange._set({});
  });

  it('greets the signed-in user by first name', async () => {
    setImsProfile({ first_name: 'Ada', displayName: 'Ada Lovelace' });
    const landing = await mount();
    await waitFor(() => landing.shadowRoot.querySelector('h1').textContent.includes('Ada'));
    expect(landing.shadowRoot.querySelector('h1').textContent).to.equal('Hi Ada, how can I help?');
  });

  it('keeps a generic greeting and no chat without a site', async () => {
    hashChange._set({ org: 'org' });
    const landing = await mount();
    await waitFor(() => panelEvents.length);
    expect(landing.shadowRoot.querySelector('h1').textContent).to.equal('Hi, how can I help?');
    expect(landing.shadowRoot.querySelector('nx-ao-input')).to.equal(null);
    expect(registered).to.deep.equal([]);
    expect(panelEvents).to.deep.equal([[PANEL_EVENT.CLOSE, 'chat']]);
  });

  it('registers the chat panel and renders the shared compact input when AO chat is enabled', async () => {
    setChatAvailability(async () => true);
    setAoChat(async () => true);
    hashChange._set({ org: 'org', site: 'enabled' });
    const landing = await mount();
    await waitFor(() => landing.shadowRoot.querySelector('nx-ao-input'));
    const input = landing.shadowRoot.querySelector('nx-ao-input');
    expect(input.hasAttribute('org')).to.equal(false);
    expect(input.onSubmit).to.equal(undefined);
    expect(input.getAttribute('placeholder')).to.equal('Ask a question, share an idea, or add a task.');
    expect(registered).to.have.length(1);
    expect(registered[0][0]).to.equal('chat');
    expect(registered[0][1]).to.include({ position: 'before', width: '400px' });

    input.dispatchEvent(new CustomEvent(CHAT_EVENT.MESSAGE_SENT, { bubbles: true, composed: true, detail: { org: 'org', site: 'enabled' } }));
    expect(panelEvents).to.deep.equal([[PANEL_EVENT.OPEN, 'chat']]);
  });

  it('keeps the sidebar chat but no compact input for the legacy chat', async () => {
    setChatAvailability(async () => true);
    hashChange._set({ org: 'org', site: 'legacy' });
    const landing = await mount();
    await waitFor(() => registered.length);
    await landing.updateComplete;
    expect(landing.shadowRoot.querySelector('nx-ao-input')).to.equal(null);
  });

  it('removes the input when chat becomes unavailable and stops listening on disconnect', async () => {
    setChatAvailability(async ({ site }) => site === 'enabled');
    setAoChat(async () => true);
    hashChange._set({ org: 'org', site: 'enabled' });
    const landing = await mount();
    await waitFor(() => landing.shadowRoot.querySelector('nx-ao-input'));
    hashChange._set({ org: 'org', site: 'disabled' });
    await waitFor(() => !landing.shadowRoot.querySelector('nx-ao-input') && panelEvents.length);
    expect(panelEvents).to.deep.equal([[PANEL_EVENT.CLOSE, 'chat']]);

    el.replaceChildren();
    landing.dispatchEvent(new CustomEvent(CHAT_EVENT.MESSAGE_SENT));
    expect(panelEvents).to.deep.equal([[PANEL_EVENT.CLOSE, 'chat']]);
  });
});
