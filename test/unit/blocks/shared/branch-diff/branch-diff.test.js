import { expect } from '@esm-bundle/chai';
import { buildRevisionDiff } from '../../../../../blocks/shared/branch-diff/revision-diff.js';
import '../../../../../blocks/shared/branch-diff/branch-diff.js';

const present = (text) => ({ state: 'present', text });
const absent = { state: 'absent' };

describe('branch visual diff', () => {
  it('uses the revision diff markup and keeps document styles and resources inert', () => {
    const before = present('<body><header>chrome</header><main><p>The old text.</p></main></body>');
    const after = present(`<main><p style="position:fixed" onclick="alert(1)">The new text.</p>
      <img src="https://example.com/image.png" onerror="alert(1)" alt="Photo">
      <a href="javascript:alert(1)">Link</a><script>do not render</script>
      <iframe src="https://example.com/"></iframe></main>`);
    const { dom } = buildRevisionDiff(before, after, 'html');
    expect(dom.querySelector('del.diffmod, del.diffdel').textContent).to.include('old');
    expect(dom.querySelector('ins.diffmod, ins.diffins').textContent).to.include('new');
    expect(dom.textContent).to.include('Photo');
    expect(dom.textContent).not.to.include('chrome');
    expect(dom.textContent).not.to.include('do not render');
    expect(dom.querySelector('[style], [onclick], [href], [src], script, iframe, img')).to.equal(null);
  });

  it('highlights JSON as text and treats a missing side as empty', () => {
    const { dom } = buildRevisionDiff(absent, present('{"name":"<img>"}'), 'json');
    expect(dom.querySelector('ins').textContent).to.include('"name": "<img>"');
    expect(dom.querySelector('img')).to.equal(null);
    expect(dom.querySelector('del')).to.equal(null);
  });

  it('offers source when a comparison would be too large', () => {
    const { dom, message } = buildRevisionDiff(absent, present('x '.repeat(30_000)), 'html');
    expect(dom).to.equal(undefined);
    expect(message).to.include('Use Source');
  });

  it('switches between both comparisons against Base while keeping source available', async () => {
    const diff = document.createElement('da-branch-diff');
    diff.itemKind = 'html';
    diff.base = present('<p>Before</p>');
    diff.branch = present('<p>Local</p>');
    diff.defaultSide = present('<p>Upstream</p>');
    document.body.append(diff);
    const button = (label) => [...diff.shadowRoot.querySelectorAll('button')]
      .find((item) => item.textContent.trim() === label);
    const added = () => diff.shadowRoot.querySelector('.diff-body ins').textContent;
    try {
      await diff.updateComplete;
      expect(added()).to.include('Local');
      button('Base → Default').click();
      await diff.updateComplete;
      expect(added()).to.include('Upstream');
      button('Source').click();
      await diff.updateComplete;
      expect([...diff.shadowRoot.querySelectorAll('pre')].map((pre) => pre.textContent))
        .to.deep.equal(['<p>Before</p>', '<p>Upstream</p>']);
    } finally {
      diff.remove();
    }
  });
});
