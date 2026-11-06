import { expect } from '@esm-bundle/chai';
import '../../setup-nx.js';
import { getBrowseHref, getFileHref, getTileTarget } from '../../../../blocks/landing/utils.js';

const HREF = 'https://tilesv2--da-live--adobe.aem.live/?landing=true&nx=main&nxver=2&theme=light#/org/site';

describe('landing tile destinations', () => {
  it('resolves encoded Browse placeholders and requires a site', () => {
    const entry = { href: '/#/%7Borg%7D/%7Bsite%7D' };
    expect(getTileTarget({ entry, href: HREF })).to.deep.equal({ disabled: true });
    const target = getTileTarget({ entry, scope: 'org/other', href: HREF });
    expect(new URL(target.href).hash).to.equal('#/org/other');
  });

  it('recognizes only supported action instructions, not arbitrary commands or unsafe destinations', () => {
    const entry = { href: '/%7Baction%3Acreate-page%7D' };
    expect(getTileTarget({ entry, scope: 'org/site', href: HREF }))
      .to.deep.equal({ action: 'create-page', disabled: false });
    expect(getTileTarget({ entry, href: HREF }))
      .to.deep.equal({ action: 'create-page', disabled: true });
    // eslint-disable-next-line no-script-url
    for (const target of ['/{action:unknown}', '/{unknown}', 'javascript:alert(1)', 'data:text/html,test', '/%7Bbad%XY%7D']) {
      expect(getTileTarget({ entry: { href: target }, scope: 'org/site', href: HREF }).disabled).to.equal(true);
    }
  });

  it('respects authored destinations without overriding external links or encoded path characters', () => {
    const external = 'https://example.com/a%2Fb?q=%7Borg%7D';
    expect(getTileTarget({ entry: { href: external }, scope: 'org/site', href: HREF }).href)
      .to.equal('https://example.com/a%2Fb?q=org');
    expect(getTileTarget({ entry: { href: '/guide?theme=dark' }, href: HREF }).href)
      .to.equal('https://tilesv2--da-live--adobe.aem.live/guide?theme=dark&nx=main&nxver=2');
    const relative = getTileTarget({
      entry: { href: './guide', baseHref: 'https://tilesv2--da-live--adobe.aem.live/drafts/landing-copy' },
      href: HREF,
    });
    expect(new URL(relative.href).pathname).to.equal('/drafts/guide');
  });

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
