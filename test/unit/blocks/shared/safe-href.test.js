/* eslint-disable no-script-url */
import { expect } from '@esm-bundle/chai';
import { safeHref } from '../../../../blocks/shared/safe-href.js';

const expectKept = (hrefs) => hrefs.forEach((href) => expect(safeHref(href), href).to.equal(href));
const expectRejected = (hrefs) => hrefs.forEach((href) => {
  expect(safeHref(href), href).to.equal(null);
});

describe('safeHref', () => {
  it('keeps links to the same page', () => {
    expectKept(['#x', '#section-2', '?q=1', '?q=1#x']);
  });

  it('keeps relative links', () => {
    expectKept(['/a', '/a/b.html', '/a#x', 'a/b', './a', '../a', '//cdn.x.y/a', '/a%20b', '/ä/ö']);
  });

  it('keeps links EDS sites use to load content', () => {
    expectKept([
      '/fragments/footer',
      '/tools/widgets/form',
      '/page#_blank',
      '/page#_dnb',
      '/page?modal=true#_autoplay',
      '/media_1a2b3c.png?width=750',
      '/docs/guide.pdf',
      'https://www.youtube.com/watch?v=x',
      'https://main--site--org.aem.page/fragments/footer',
    ]);
  });

  it('keeps http(s), mailto and tel links', () => {
    expectKept([
      'https://x.y',
      'HTTP://x.y',
      'https://x.y/p?q=1#a',
      'https://x.y:8080/a',
      'https://bücher.de',
      'mailto:a@b.c',
      'mailto:a@b.c?subject=Hi%20there',
      'tel:+1',
      'tel:+49 30 123456',
    ]);
  });

  it('trims the link', () => {
    expect(safeHref('  /a  ')).to.equal('/a');
  });

  it('rejects empty values', () => {
    expectRejected(['', '  ', undefined, null, 1]);
  });

  it('rejects links that run script', () => {
    expectRejected([
      'javascript:x()',
      'JaVaScRiPt:x()',
      'javascript://%0Ax()',
      'vbscript:x',
      'data:text/html,<script>x()</script>',
      'data:image/svg+xml,<svg onload="x()">',
    ]);
  });

  it('rejects script schemes hidden by characters browsers ignore', () => {
    expectRejected([
      ' java\tscript:x()',
      'java\nscript:x()',
      'javascript\t:x()',
      '\u0001javascript:x()',
      ' \u001fJaVaScRiPt:x()',
    ]);
  });

  it('rejects other schemes', () => {
    expectRejected(['ftp://x', 'file:///a.txt', 'blob:https://x.y/1', 'about:blank', 'ms-msdt:x', 'intent://x', 'sms:+1']);
  });

  it('keeps text the browser reads as a relative path, like the SDK', () => {
    expectKept(['javascript :x()', 'javascript%3Ax()', '\u200bjavascript:x()']);
  });
});
