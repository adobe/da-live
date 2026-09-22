import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../../../../../../scripts/utils.js';

const parse = (html) => new DOMParser().parseFromString(html, 'text/html');

let fragmentsCheck;

before(async () => {
  setNx('/test/fixtures/nx', { hostname: 'example.com' });
  const mod = await import(
    '../../../../../../../../../../blocks/edit/da-prepare/actions/preflight/providers/ootb/checks/fragments.js'
  );
  fragmentsCheck = mod.default;
});

describe('fragmentsCheck', () => {
  it('only matches fragment links', () => {
    const PreflightLink = customElements.get('pf-link');
    const savedRunCheck = PreflightLink.prototype.runCheck;
    PreflightLink.prototype.runCheck = async function stubRunCheck() { /* no-op */ };

    try {
      const doc = parse(`<html><body>
        <a href="/page">Page</a>
        <a href="/fragments/my-frag">Fragment</a>
      </body></html>`);

      const { title, items, done } = fragmentsCheck({ details: {}, doc });

      expect(title).to.equal('Fragments');
      expect(done).to.be.true;
      expect(items).to.have.length(1);
      expect(items[0].href).to.equal('/fragments/my-frag');
    } finally {
      PreflightLink.prototype.runCheck = savedRunCheck;
    }
  });

  it('returns a single NA item when no fragment links are found', () => {
    const doc = parse('<html><body><a href="/page">Page</a></body></html>');

    const { items } = fragmentsCheck({ details: {}, doc });

    expect(items).to.have.length(1);
    expect(items[0].result).to.equal('na');
  });
});
