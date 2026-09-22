import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../../../../../scripts/utils.js';

const DOC_HTML = `<html><body>
  <div class="metadata">
    <div><div>Title</div><div>My Page</div></div>
    <div><div>Description</div><div>A description.</div></div>
  </div>
  <h1>My Page</h1>
  <p>Some real content.</p>
  <a href="https://example.org/elsewhere">External</a>
  <a href="/fragments/my-frag">Fragment</a>
</body></html>`;

let ootb;
let savedFetch;

before(async () => {
  savedFetch = window.fetch;
  setNx('/test/fixtures/nx', { hostname: 'example.com' });

  const mod = await import(
    '../../../../../../../../../blocks/edit/da-prepare/actions/preflight/providers/ootb/ootb-checks.js'
  );
  ootb = mod.default;

  const PreflightLink = customElements.get('pf-link');
  PreflightLink.prototype.runCheck = async function stubRunCheck() { /* no-op, kept pending */ };
});

after(() => {
  window.fetch = savedFetch;
});

describe('ootb provider', () => {
  it('exposes id and getResults', () => {
    expect(ootb.id).to.equal('ootb');
    expect(ootb.getResults).to.be.a('function');
  });

  it('groups checks into References, Content and SEO categories', async () => {
    window.fetch = async (url) => {
      if (String(url).includes('/source/')) return new Response(DOC_HTML, { status: 200 });
      return new Response('', { status: 200 });
    };

    const categories = await ootb.getResults({ details: { fullpath: '/org/site/page' } });

    expect(categories.map((c) => c.title)).to.deep.equal(['References', 'Content', 'SEO']);

    const [references, content, seo] = categories;
    expect(references.checks.map((c) => c.title)).to.deep.equal(['Links', 'Fragments']);
    expect(content.checks.map((c) => c.title)).to.deep.equal(['H1 count', 'Lorem ipsum']);
    expect(seo.checks.map((c) => c.title)).to.deep.equal(['Title', 'Description']);

    expect(content.checks[0].items[0].result).to.equal('info');
    expect(seo.checks[0].items[0].reason).to.equal('Title found in metadata.');
    expect(references.checks[0].items).to.have.length(1);
    expect(references.checks[1].items).to.have.length(1);
  });

  it('rejects when the document fails to load', async () => {
    window.fetch = async (url) => {
      if (String(url).includes('/source/')) return new Response('', { status: 404 });
      return new Response('', { status: 200 });
    };

    let error;
    try {
      await ootb.getResults({ details: { fullpath: '/org/site/missing' } });
    } catch (e) {
      error = e;
    }

    expect(error).to.be.an('error');
    expect(error.message).to.include('404');
  });
});
