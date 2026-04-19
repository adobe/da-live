import { expect } from '@esm-bundle/chai';
import { buildDeepLinkUrl, parseDeepLink } from '../../../../../../blocks/edit/da-comments/helpers/deep-link.js';

describe('deep-link', () => {
  it('encodes comment id as a URL search param and leaves the hash untouched', () => {
    const url = new URL('https://da.live/edit#/foo/bar');
    const out = buildDeepLinkUrl(url, 't-123');
    expect(out.searchParams.get('comment')).to.equal('t-123');
    expect(out.hash).to.equal('#/foo/bar');
  });

  it('preserves other search params when encoding', () => {
    const url = new URL('https://da.live/edit?foo=1#/foo/bar');
    const out = buildDeepLinkUrl(url, 't-123');
    expect(out.searchParams.get('foo')).to.equal('1');
    expect(out.searchParams.get('comment')).to.equal('t-123');
  });

  it('parses and strips the comment search param, preserving the hash', () => {
    const url = new URL('https://da.live/edit?comment=t-123#/foo/bar');
    const { commentId, cleaned } = parseDeepLink(url);
    expect(commentId).to.equal('t-123');
    expect(cleaned.searchParams.has('comment')).to.be.false;
    expect(cleaned.hash).to.equal('#/foo/bar');
  });

  it('preserves other search params when parsing', () => {
    const url = new URL('https://da.live/edit?foo=1&comment=t-123#/foo/bar');
    const { cleaned } = parseDeepLink(url);
    expect(cleaned.searchParams.get('foo')).to.equal('1');
    expect(cleaned.searchParams.has('comment')).to.be.false;
  });

  it('returns null commentId when absent', () => {
    const url = new URL('https://da.live/edit#/foo/bar');
    expect(parseDeepLink(url).commentId).to.be.null;
  });
});
