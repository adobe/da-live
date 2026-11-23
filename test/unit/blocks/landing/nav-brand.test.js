import { expect } from '@esm-bundle/chai';

const css = await fetch('/blocks/landing/landing.css').then((response) => response.text());
const styles = new CSSStyleSheet();
styles.replaceSync(css);

describe('landing nav brand', () => {
  let nav;
  let browse;
  let originalStyles;

  beforeEach(() => {
    originalStyles = document.adoptedStyleSheets;
    document.adoptedStyleSheets = [...originalStyles, styles];
    nav = document.createElement('nx-nav');
    browse = document.createElement('div');
    browse.className = 'browse';
    document.body.append(nav, browse);
  });

  afterEach(() => {
    nav.remove();
    browse.remove();
    document.adoptedStyleSheets = originalStyles;
  });

  it('shows the nav brand label only on the landing and sites home', () => {
    const labelDisplay = () => getComputedStyle(nav).getPropertyValue('--nx-nav-brand-label-display').trim();
    const landing = document.createElement('div');
    landing.className = 'landing';
    browse.append(landing);
    expect(labelDisplay()).to.equal('inline');
    browse.replaceChildren(document.createElement('da-sites'));
    expect(labelDisplay()).to.equal('inline');
    browse.replaceChildren(document.createElement('da-browse'));
    expect(labelDisplay()).to.equal('');
  });
});
