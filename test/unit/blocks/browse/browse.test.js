import { expect } from '@esm-bundle/chai';

const css = await fetch('/blocks/browse/browse.css').then((response) => response.text());
const styles = new CSSStyleSheet();
styles.replaceSync(css);

describe('browse styles', () => {
  it('shows the nav brand label only while the sites home is mounted', () => {
    const originalStyles = document.adoptedStyleSheets;
    document.adoptedStyleSheets = [...originalStyles, styles];
    const nav = document.createElement('nx-nav');
    const browse = document.createElement('div');
    browse.className = 'browse';
    document.body.append(nav, browse);
    const labelDisplay = () => getComputedStyle(nav).getPropertyValue('--nx-nav-brand-label-display').trim();

    browse.append(document.createElement('da-sites'));
    expect(labelDisplay()).to.equal('inline');
    browse.replaceChildren(document.createElement('da-browse'));
    expect(labelDisplay()).to.equal('');

    nav.remove();
    browse.remove();
    document.adoptedStyleSheets = originalStyles;
  });
});
