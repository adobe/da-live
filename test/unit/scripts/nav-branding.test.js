import { expect } from '@esm-bundle/chai';

describe('navigation branding visibility', () => {
  let styles;
  let frame;
  let doc;

  before(async () => {
    const resp = await fetch('/head.html');
    const head = new DOMParser().parseFromString(await resp.text(), 'text/html');
    styles = [...head.querySelectorAll('style')].map((style) => style.outerHTML).join('');
  });

  beforeEach(async () => {
    frame = document.createElement('iframe');
    frame.srcdoc = `<!doctype html>
      <html>
        <head>${styles}</head>
        <body>
          <header><nx-nav></nx-nav></header>
          <main><div class="browse"></div></main>
        </body>
      </html>`;
    const loaded = new Promise((resolve) => { frame.onload = resolve; });
    document.body.append(frame);
    await loaded;
    doc = frame.contentDocument;
  });

  afterEach(() => {
    frame.remove();
  });

  function labelDisplay() {
    return frame.contentWindow.getComputedStyle(doc.querySelector('nx-nav'))
      .getPropertyValue('--nx-nav-brand-label-display').trim();
  }

  it('uses logo-only branding by default', () => {
    expect(labelDisplay()).to.equal('none');
  });

  it('follows landing view changes without reloading the nav', () => {
    const browse = doc.querySelector('.browse');
    const landing = doc.createElement('div');
    landing.className = 'landing';
    browse.append(landing);
    expect(labelDisplay()).to.equal('inline');

    landing.remove();
    browse.append(doc.createElement('da-browse'));
    expect(labelDisplay()).to.equal('none');

    browse.replaceChildren(landing);
    expect(labelDisplay()).to.equal('inline');
  });

  it('does not show the label for landing content outside the browse view', () => {
    const content = doc.createElement('div');
    content.className = 'landing';
    doc.querySelector('main').append(content);
    expect(labelDisplay()).to.equal('none');
  });

  it('applies the active landing state when the nav is added later', () => {
    doc.querySelector('nx-nav').remove();
    doc.querySelector('.browse').innerHTML = '<div class="landing"></div>';
    doc.querySelector('header').append(doc.createElement('nx-nav'));
    expect(labelDisplay()).to.equal('inline');
  });
});
