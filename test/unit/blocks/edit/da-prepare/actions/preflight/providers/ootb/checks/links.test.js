import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../../../../../../scripts/utils.js';

const parse = (html) => new DOMParser().parseFromString(html, 'text/html');
const wait = (ms = 10) => new Promise((resolve) => { setTimeout(resolve, ms); });

let linksCheck;
let buildLinkCheck;

before(async () => {
  setNx('/test/fixtures/nx', { hostname: 'example.com' });
  const mod = await import(
    '../../../../../../../../../../blocks/edit/da-prepare/actions/preflight/providers/ootb/checks/links.js'
  );
  linksCheck = mod.default;
  buildLinkCheck = mod.buildLinkCheck;
});

describe('buildLinkCheck / linksCheck', () => {
  it('returns a single NA item when no matching links are found', () => {
    const doc = parse('<html><body><p>No links here</p></body></html>');
    const { title, items, done } = buildLinkCheck({ title: 'Links', selector: 'a', details: {}, doc });

    expect(title).to.equal('Links');
    expect(done).to.be.true;
    expect(items).to.have.length(1);
    expect(items[0].result).to.equal('na');
  });

  it('creates one pf-link item per matching link, with href/text/details set', () => {
    const PreflightLink = customElements.get('pf-link');
    const savedRunCheck = PreflightLink.prototype.runCheck;
    PreflightLink.prototype.runCheck = async function stubRunCheck() { /* no-op */ };

    try {
      const doc = parse(`<html><body>
        <a href="/foo">Foo</a>
        <a href="/bar">Bar</a>
      </body></html>`);
      const details = { org: 'org', site: 'site' };

      const { items, done } = buildLinkCheck({ title: 'Links', selector: 'a', details, doc });

      expect(done).to.be.true;
      expect(items).to.have.length(2);
      expect(items[0].href).to.equal('/foo');
      expect(items[0].text).to.equal('Foo');
      expect(items[0].details).to.equal(details);
    } finally {
      PreflightLink.prototype.runCheck = savedRunCheck;
    }
  });

  it('never runs more than the configured concurrency limit at once', async () => {
    const PreflightLink = customElements.get('pf-link');
    const savedRunCheck = PreflightLink.prototype.runCheck;

    let active = 0;
    let maxActive = 0;
    PreflightLink.prototype.runCheck = async function stubRunCheck() {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await wait(15);
      active -= 1;
      this.settle('success', 'stubbed');
    };

    try {
      const links = Array.from({ length: 8 }, (_, i) => `<a href="/page-${i}">Page ${i}</a>`).join('');
      const doc = parse(`<html><body>${links}</body></html>`);

      let updateCount = 0;
      const onUpdate = () => { updateCount += 1; };
      const { items } = buildLinkCheck({ title: 'Links', selector: 'a', details: {}, doc, onUpdate });

      expect(items).to.have.length(8);
      await wait(100);

      expect(maxActive).to.equal(5);
      expect(updateCount).to.equal(8);
      items.forEach((item) => expect(item.status).to.equal('done'));
    } finally {
      PreflightLink.prototype.runCheck = savedRunCheck;
    }
  });

  it('linksCheck excludes fragment links via its selector', () => {
    const PreflightLink = customElements.get('pf-link');
    const savedRunCheck = PreflightLink.prototype.runCheck;
    PreflightLink.prototype.runCheck = async function stubRunCheck() { /* no-op */ };

    try {
      const doc = parse(`<html><body>
        <a href="/page">Page</a>
        <a href="/fragments/my-frag">Fragment</a>
      </body></html>`);

      const { title, items } = linksCheck({ details: {}, doc });

      expect(title).to.equal('Links');
      expect(items).to.have.length(1);
      expect(items[0].href).to.equal('/page');
    } finally {
      PreflightLink.prototype.runCheck = savedRunCheck;
    }
  });
});
