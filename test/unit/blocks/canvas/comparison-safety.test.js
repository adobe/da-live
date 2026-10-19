/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
let normalizeComparisonHtml;
let EwEditorDoc;
before(async () => {
  ({ normalizeComparisonHtml } = await import('../../../../blocks/canvas/ew-comparison/comparison.js'));
  ({ EwEditorDoc } = await import('../../../../blocks/canvas/ew-editor-doc/ew-editor-doc.js'));
});

describe('comparison input safety', () => {
  it('does not connect registered custom elements from comparison content', () => {
    let connections = 0;
    if (!customElements.get('comparison-unsafe-test')) {
      customElements.define('comparison-unsafe-test', class extends HTMLElement {
        connectedCallback() { connections += 1; }
      });
    }
    const container = document.createElement('div');
    container.innerHTML = normalizeComparisonHtml('<comparison-unsafe-test><p>Safe text</p></comparison-unsafe-test>', { org: 'example', site: 'site', path: 'page' });
    document.body.append(container);
    container.remove();
    expect(connections).to.equal(0);
    expect(container.textContent).to.equal('Safe text');
  });

  it('keeps content links from navigating the EW host away', () => {
    const html = normalizeComparisonHtml('<p><a href="/page">Page</a></p>', { org: 'example', site: 'site', path: 'page' });
    const link = new DOMParser().parseFromString(html, 'text/html').querySelector('a');
    expect(link.target).to.equal('_blank');
    expect(link.rel).to.include('noopener');
  });
});

describe('comparison editor identity', () => {
  let editor;
  let context;
  let session;
  beforeEach(() => {
    editor = new EwEditorDoc();
    context = { org: 'example', repo: 'site', path: 'example/site/old' };
    editor.ctx = context;
    session = { context, view: { editable: true } };
    editor._proseContext = session;
    expect(editor.getComparisonSession).to.be.a('function');
  });

  it('rejects the old editor while the route is already on a new page', () => {
    expect(editor.getComparisonSession({ org: 'example', site: 'site', path: 'new' })).to.equal(null);
    expect(editor.getComparisonSession({ org: 'example', site: 'site', path: 'old' }) === session).to.equal(true);
  });

  it('rejects a stale asynchronous editor session even if the path matches', () => {
    editor.ctx = { ...context };
    expect(editor.getComparisonSession({ org: 'example', site: 'site', path: 'old' })).to.equal(null);
  });

  it('does not flush a missing or read-only editor', async () => {
    expect(await editor.saveForComparison({ org: 'example', site: 'site', path: 'new' })).to.deep.equal({ ok: false, error: 'no-document' });
    session.view.editable = false;
    expect(await editor.saveForComparison({ org: 'example', site: 'site', path: 'old' })).to.deep.equal({ ok: false, error: 'not-writable' });
  });
});
