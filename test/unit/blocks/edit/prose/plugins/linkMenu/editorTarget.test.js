import { expect } from '@esm-bundle/chai';
import { resolveEditorTarget, buildEditorUrl } from '../../../../../../../blocks/edit/prose/plugins/linkMenu/editorTarget.js';

const context = { org: 'myorg', repo: 'myrepo', ref: 'main' };

describe('resolveEditorTarget', () => {
  it('resolves a root-relative href within the current project', () => {
    const result = resolveEditorTarget('/products/foo', context);
    expect(result).to.deep.equal({
      org: 'myorg', repo: 'myrepo', path: '/products/foo', branch: 'main',
    });
  });

  it('strips a .html extension and a trailing slash', () => {
    expect(resolveEditorTarget('/products/foo.html', context).path).to.equal('/products/foo');
    expect(resolveEditorTarget('/products/foo/', context).path).to.equal('/products/foo');
  });

  it('uses the current ref for a root-relative href when the ref is not main', () => {
    const result = resolveEditorTarget('/products/foo', { ...context, ref: 'feature' });
    expect(result.branch).to.equal('feature');
  });

  it('resolves an aem.page URL matching the current org/repo, using the hostname branch', () => {
    const result = resolveEditorTarget('https://feature--myrepo--myorg.aem.page/products/foo', context);
    expect(result).to.deep.equal({
      org: 'myorg', repo: 'myrepo', path: '/products/foo', branch: 'feature',
    });
  });

  it('resolves aem.live/hlx.page/hlx.live URLs the same way', () => {
    expect(resolveEditorTarget('https://main--myrepo--myorg.aem.live/x', context).branch).to.equal('main');
    expect(resolveEditorTarget('https://main--myrepo--myorg.hlx.page/x', context).branch).to.equal('main');
    expect(resolveEditorTarget('https://main--myrepo--myorg.hlx.live/x', context).branch).to.equal('main');
  });

  it('returns null for an aem.page URL from a different org or repo', () => {
    expect(resolveEditorTarget('https://main--otherrepo--myorg.aem.page/x', context)).to.equal(null);
    expect(resolveEditorTarget('https://main--myrepo--otherorg.aem.page/x', context)).to.equal(null);
  });

  it('returns null for an external URL', () => {
    expect(resolveEditorTarget('https://example.com/products/foo', context)).to.equal(null);
  });

  it('returns null for mailto: and tel: links', () => {
    expect(resolveEditorTarget('mailto:person@example.com', context)).to.equal(null);
    expect(resolveEditorTarget('tel:+15551234567', context)).to.equal(null);
  });

  it('returns null for a relative link that is not root-relative', () => {
    expect(resolveEditorTarget('products/foo', context)).to.equal(null);
  });

  it('returns null for an empty or missing href', () => {
    expect(resolveEditorTarget('', context)).to.equal(null);
    expect(resolveEditorTarget(undefined, context)).to.equal(null);
  });

  it('returns null when the current org/repo context is missing', () => {
    expect(resolveEditorTarget('/products/foo', {})).to.equal(null);
    expect(resolveEditorTarget('/products/foo')).to.equal(null);
  });
});

describe('buildEditorUrl', () => {
  it('omits the ref param for the main branch', () => {
    const url = buildEditorUrl({
      org: 'myorg', repo: 'myrepo', path: '/products/foo', branch: 'main',
    });
    expect(url).to.equal('/edit#/myorg/myrepo/products/foo');
  });

  it('includes a ref param for a non-main branch', () => {
    const url = buildEditorUrl({
      org: 'myorg', repo: 'myrepo', path: '/products/foo', branch: 'feature',
    });
    expect(url).to.equal('/edit?ref=feature#/myorg/myrepo/products/foo');
  });

  it('handles the root path', () => {
    const url = buildEditorUrl({
      org: 'myorg', repo: 'myrepo', path: '/', branch: 'main',
    });
    expect(url).to.equal('/edit#/myorg/myrepo/');
  });
});