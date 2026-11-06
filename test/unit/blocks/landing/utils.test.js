import { expect } from '@esm-bundle/chai';
import '../../setup-nx.js';
import { getTileTarget } from '../../../../blocks/landing/utils.js';

const HREF = 'https://tilesv2--da-live--adobe.aem.live/?landing=true&nx=main&nxver=2&theme=light#/org/site';

describe('landing tile destinations', () => {
  it('resolves encoded Browse placeholders and requires a site', () => {
    const entry = { href: '/#/%7Borg%7D/%7Bsite%7D' };
    expect(getTileTarget({ entry, href: HREF })).to.deep.equal({ disabled: true });
    const target = getTileTarget({ entry, scope: 'org/other', href: HREF });
    expect(new URL(target.href).hash).to.equal('#/org/other');
  });

  it('resolves Create a page as an action that requires a site', () => {
    const entry = { href: '/%7Baction%3Acreate-page%7D' };
    expect(getTileTarget({ entry, href: HREF })).to.deep.equal({ action: 'create-page', disabled: true });
    expect(getTileTarget({ entry, scope: 'org/site', href: HREF })).to.deep.equal({ action: 'create-page', disabled: false });
  });

  it('disables unknown actions, unknown placeholders and unsafe destinations', () => {
    // eslint-disable-next-line no-script-url
    for (const target of ['/%7Baction%3Aunknown%7D', '/{unknown}', 'javascript:alert(1)', 'data:text/html,test', '/%7Bbad%XY%7D']) {
      expect(getTileTarget({ entry: { href: target }, scope: 'org/site', href: HREF })).to.deep.equal({ disabled: true });
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
});
