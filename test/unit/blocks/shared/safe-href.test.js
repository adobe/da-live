/* eslint-disable no-script-url */
import { expect } from '@esm-bundle/chai';
import { safeHref } from '../../../../blocks/shared/safe-href.js';

describe('safeHref', () => {
  it('accepts relative, http(s), mailto and tel links', () => {
    ['/a', 'a/b', '#x', '?q=1', 'https://x.y', 'HTTP://x.y', 'mailto:a@b.c', 'tel:+1'].forEach((href) => {
      expect(safeHref(href)).to.equal(href);
    });
    expect(safeHref('  /a  ')).to.equal('/a');
  });

  it('rejects other schemes and empty values', () => {
    ['javascript:x()', 'JAVASCRIPT:x()', 'data:text/html,x', 'vbscript:x', 'ftp://x', 'ms-msdt:x', '', '  ', undefined, 1].forEach((href) => {
      expect(safeHref(href)).to.equal(null);
    });
  });

  it('rejects schemes hidden by characters browsers ignore', () => {
    [' java\tscript:x()', 'javascript\t:x()', '\u0001javascript:x()', ' \u001fJaVaScRiPt:x()'].forEach((href) => {
      expect(safeHref(href)).to.equal(null);
    });
  });

  it('keeps a link whose scheme has a space as a relative link, like the SDK', () => {
    expect(safeHref('javascript :x()')).to.equal('javascript :x()');
  });
});
