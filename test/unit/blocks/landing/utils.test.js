import { expect } from '@esm-bundle/chai';
import '../../setup-nx.js';
import { getBrowseHref, getFileHref } from '../../../../blocks/landing/utils.js';

const HREF = 'https://tilesv2--da-live--adobe.aem.live/?landing=true&nx=main&nxver=2&theme=light#/org/site';

describe('landing tile destinations', () => {
  it('leaves landing for Browse at the selected site while preserving preview and theme', () => {
    const url = new URL(getBrowseHref({ path: '/org/other', href: HREF }));
    expect(url.origin).to.equal(new URL(HREF).origin);
    expect(url.hash).to.equal('#/org/other');
    expect(url.searchParams.get('landing')).to.equal('home');
    expect(url.searchParams.get('browse')).to.equal('2');
    expect(url.searchParams.get('nx')).to.equal('main');
    expect(url.searchParams.get('nxver')).to.equal('2');
    expect(url.searchParams.get('theme')).to.equal('light');
  });

  it('opens a created page in the selected editor without reentering landing', () => {
    for (const editor of ['/canvas#', '/edit#']) {
      const url = new URL(getFileHref({ item: { path: '/org/site/page.html', ext: 'html' }, editor, href: HREF }));
      expect(url.pathname).to.equal(editor.slice(0, -1));
      expect(url.hash).to.equal('#/org/site/page');
      expect(url.searchParams.get('nx')).to.equal('main');
      expect(url.searchParams.get('nxver')).to.equal('2');
      expect(url.searchParams.get('theme')).to.equal('light');
      expect(url.searchParams.get('landing')).to.equal('home');
    }
  });
});
