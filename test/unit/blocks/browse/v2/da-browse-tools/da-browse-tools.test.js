import { expect } from '@esm-bundle/chai';
import { spy } from 'sinon';
import { setNx } from '../../../../../../scripts/utils.js';
import { getMatchContext } from '../../../../../../blocks/browse/v2/search/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
await import('../../../../../../blocks/browse/v2/da-browse-tools/da-browse-tools.js');

describe('browse search tools', () => {
  let panel;

  beforeEach(async () => {
    panel = document.createElement('da-browse-tools');
    panel.searchState = {
      request: {},
      scope: '/org/site/products',
      term: 'old',
      matchCase: true,
      count: 2,
      loading: false,
      canWrite: true,
    };
    document.body.append(panel);
    await panel.updateComplete;
  });

  afterEach(() => panel.remove());

  const review = async () => {
    panel.shadowRoot.querySelector('.browse-replace-form')
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await panel.updateComplete;
  };

  function result({ path = '/org/site/products/page.html', text = 'old' } = {}) {
    return {
      path,
      name: path.split('/').pop(),
      matchContext: getMatchContext({
        text,
        filename: path.split('/').pop(),
        term: panel.searchState.term,
        caseSensitive: panel.searchState.matchCase,
      }),
    };
  }

  async function setResults(items) {
    panel.searchState = { ...panel.searchState, items, count: items.length };
    await panel.updateComplete;
  }

  it('shows highlighted source and literal replacement previews without rendering markup', async () => {
    panel.searchState = { ...panel.searchState, matchCase: false };
    const text = '<p>Old old OLD</p>';
    await setResults([result({ text })]);
    const before = panel.shadowRoot.querySelector('[data-preview="match"]');
    expect(before.textContent).to.equal(text);
    expect([...before.querySelectorAll('mark')].map((mark) => mark.textContent))
      .to.deep.equal(['Old', 'old', 'OLD']);
    expect(before.querySelector('p')).to.be.null;
    expect(before.querySelector('del, ins')).to.be.null;
    const replacement = '$& <img src=x> old';
    const input = panel.shadowRoot.querySelector('#replacement');
    input.value = replacement;
    input.dispatchEvent(new Event('input'));
    await panel.updateComplete;
    const after = panel.shadowRoot.querySelector('[data-preview="match"]');
    expect(panel.shadowRoot.querySelectorAll('pre')).to.have.length(1);
    expect(panel.shadowRoot.querySelector('.browse-match-label')).to.be.null;
    expect(after.textContent).to.equal(text.replaceAll(/old/giu, (match) => match + replacement));
    expect([...after.querySelectorAll('del')].map((match) => match.textContent))
      .to.deep.equal(['Old', 'old', 'OLD']);
    expect([...after.querySelectorAll('ins')].map((match) => match.textContent))
      .to.deep.equal([replacement, replacement, replacement]);
    [...after.querySelectorAll('del')].forEach((match) => {
      expect(match.nextElementSibling.tagName).to.equal('INS');
      expect(match.nextElementSibling.textContent).to.equal(replacement);
    });
    expect(after.querySelector('mark')).to.be.null;
    expect(after.getAttribute('aria-label')).to.contain('deleted text followed by inserted text');
    expect(after.querySelector('img, p')).to.be.null;
    await setResults([result({ text: '<script>old</script><img src=x onerror=bad()>' })]);
    expect(panel.shadowRoot.querySelector('[data-preview="match"]').querySelector('script, img'))
      .to.be.null;
  });

  it('previews empty replacements at review without requesting a write', async () => {
    await setResults([result({ text: 'old old' })]);
    const requested = spy();
    panel.addEventListener('replacerequest', requested);
    await review();
    const after = panel.shadowRoot.querySelector('[data-preview="match"]');
    expect(after.textContent).to.equal('old old');
    expect([...after.querySelectorAll('del')].map((match) => match.textContent))
      .to.deep.equal(['old', 'old']);
    expect(after.querySelector('ins, mark')).to.be.null;
    expect(panel.shadowRoot.querySelectorAll('pre')).to.have.length(1);
    expect(requested.called).to.be.false;
    expect(panel.shadowRoot.querySelector('.browse-replace-confirmation')).to.exist;
  });

  it('groups context by filename as results stream without a preview picker', async () => {
    const first = result();
    const filename = result({ path: '/org/site/products/old.html', text: 'unrelated' });
    await setResults([first, filename]);
    expect(panel.shadowRoot.querySelector('select')).to.be.null;
    expect(panel.shadowRoot.querySelectorAll('[data-match-file]')).to.have.length(2);
    expect(panel.shadowRoot.textContent).to.contain('Filename match only.');
    const filenameGroup = panel.shadowRoot.querySelector(`[data-match-file="${filename.path}"]`);
    expect(filenameGroup.querySelector('[data-preview="match"]')).to.be.null;
    const third = result({ path: '/org/site/products/third.html', text: 'old third' });
    panel.searchState = { ...panel.searchState, loading: true };
    await setResults([first, filename, third]);
    expect(panel.shadowRoot.querySelectorAll('[data-match-file]')).to.have.length(3);
    panel.searchState = { ...panel.searchState, request: {}, items: [third, first, filename] };
    await panel.updateComplete;
    expect(panel.shadowRoot.querySelector('h4').textContent).to.equal(third.name);
    expect(panel.shadowRoot.querySelector('[data-preview="match"]').textContent).to.equal('old third');
    panel.searchState = {
      ...panel.searchState,
      request: undefined,
      term: undefined,
      items: undefined,
      count: 0,
    };
    await panel.updateComplete;
    expect(panel.shadowRoot.querySelector('.browse-match-context')).to.be.null;
    expect(panel.shadowRoot.querySelector('[data-preview="match"]')).to.be.null;
  });

  it('labels omitted matches and shows a fallback when source context is unavailable', async () => {
    await setResults([result({ text: `${'x'.repeat(200)}old`.repeat(5) })]);
    expect(panel.shadowRoot.querySelectorAll('[data-preview="match"]')).to.have.length(3);
    expect(panel.shadowRoot.textContent).to.contain('More matches are not shown.');
    expect(panel.shadowRoot.textContent).to.contain('Search-time source excerpts.');
    await setResults([{ path: '/org/site/products/legacy.html', name: 'legacy' }]);
    expect(panel.shadowRoot.textContent).to.contain('Source context is unavailable');
  });

  it('limits grouped context to three files while keeping the full result count', async () => {
    const items = Array.from({ length: 5 }, (_, index) => result({ path: `/org/site/products/page${index}.html` }));
    await setResults(items);
    expect(panel.shadowRoot.querySelectorAll('[data-match-file]')).to.have.length(3);
    expect(panel.shadowRoot.textContent).to.contain('Showing context for 3 of 5 results.');
    expect(panel.searchState.count).to.equal(5);
  });

  it('focuses Find on opening and emits controlled edits and explicit searches', async () => {
    panel.searchState = { ...panel.searchState, term: undefined, draft: '' };
    await panel.updateComplete;
    panel.focus();
    const input = panel.shadowRoot.querySelector('#find');
    expect(panel.shadowRoot.activeElement).to.equal(input);
    const changed = spy();
    const searched = spy();
    panel.addEventListener('findchange', changed);
    panel.addEventListener('search-submit', searched);
    input.value = 'new query';
    input.dispatchEvent(new Event('input'));
    expect(changed.calledOnce).to.be.true;
    expect(changed.firstCall.args[0].detail).to.deep.equal({ value: 'new query' });
    expect(panel.searchState.draft).to.equal('');
    expect(searched.called).to.be.false;
    panel.searchState = { ...panel.searchState, draft: 'new query' };
    await panel.updateComplete;
    panel.shadowRoot.querySelector('.browse-find-form')
      .dispatchEvent(new Event('submit', { cancelable: true }));
    expect(searched.calledOnce).to.be.true;
    expect(searched.firstCall.args[0].detail).to.deep.equal({ value: 'new query' });
    expect(searched.firstCall.args[0].composed).to.be.true;
  });

  it('invalidates confirmation and hides stale context when Find changes', async () => {
    await setResults([result()]);
    await review();
    const requested = spy();
    panel.addEventListener('replacerequest', requested);
    const input = panel.shadowRoot.querySelector('#find');
    input.value = 'new';
    input.dispatchEvent(new Event('input'));
    panel.searchState = { ...panel.searchState, draft: 'new' };
    panel.confirmReplacement();
    await panel.updateComplete;
    expect(requested.called).to.be.false;
    expect(panel.shadowRoot.querySelector('.browse-replace-confirmation')).to.be.null;
    expect(panel.shadowRoot.querySelector('.browse-match-context')).to.be.null;
    expect(panel.shadowRoot.querySelector('.browse-replace-form [type="submit"]').disabled).to.be.true;
    expect(panel.shadowRoot.textContent).to.contain('Run Find to update the results.');
  });

  it('allows read-only searches but blocks Find controls while replacement is active', async () => {
    panel.searchState = { ...panel.searchState, canWrite: false };
    await panel.updateComplete;
    expect(panel.shadowRoot.querySelector('.browse-find-form [type="submit"]').disabled).to.be.false;
    expect(panel.shadowRoot.querySelector('.browse-replace-form [type="submit"]').disabled).to.be.true;
    panel.searchState = { ...panel.searchState, replacement: { loading: true } };
    await panel.updateComplete;
    const searched = spy();
    panel.addEventListener('search-submit', searched);
    expect(panel.shadowRoot.querySelector('#find').disabled).to.be.true;
    expect(panel.shadowRoot.querySelector('.browse-find-form [type="submit"]').disabled).to.be.true;
    panel.shadowRoot.querySelector('.browse-find-form')
      .dispatchEvent(new Event('submit', { cancelable: true }));
    expect(searched.called).to.be.false;
  });

  it('emits controlled case changes without mutating the supplied settings', async () => {
    const changed = spy();
    panel.addEventListener('matchcasechange', changed);
    panel.shadowRoot.querySelector('#match-case').click();
    expect(changed.calledOnce).to.be.true;
    expect(changed.firstCall.args[0].detail).to.deep.equal({ matchCase: false });
    expect(changed.firstCall.args[0].composed).to.be.true;
    expect(panel.searchState.matchCase).to.be.true;
  });

  it('requires review and explicit confirmation before requesting a replacement', async () => {
    const requested = spy();
    panel.addEventListener('replacerequest', requested);
    const input = panel.shadowRoot.querySelector('#replacement');
    input.value = '$& literal';
    input.dispatchEvent(new Event('input'));
    await review();
    expect(requested.called).to.be.false;
    const confirmation = panel.shadowRoot.querySelector('.browse-replace-confirmation');
    expect(confirmation.textContent).to.contain('old');
    expect(confirmation.textContent).to.contain('$& literal');
    const buttons = confirmation.querySelectorAll('button');
    expect(panel.shadowRoot.activeElement).to.equal(buttons[0]);
    buttons[1].click();
    expect(requested.calledOnce).to.be.true;
    expect(requested.firstCall.args[0].detail).to.deep.equal({ replacement: '$& literal' });
  });

  it('allows an empty replacement only after confirmation and cancels without writing', async () => {
    const requested = spy();
    panel.addEventListener('replacerequest', requested);
    await review();
    expect(panel.shadowRoot.querySelector('.browse-replace-confirmation').textContent)
      .to.contain('(empty text)');
    await panel.cancelReplacement();
    expect(requested.called).to.be.false;
    expect(panel.shadowRoot.querySelector('.browse-replace-confirmation')).to.be.null;
    expect(panel.shadowRoot.activeElement)
      .to.equal(panel.shadowRoot.querySelector('.browse-replace-form [type="submit"]'));
    await review();
    panel.confirmReplacement();
    expect(requested.firstCall.args[0].detail).to.deep.equal({ replacement: '' });
  });

  it('invalidates pending confirmation for new searches and replacement edits', async () => {
    await review();
    const input = panel.shadowRoot.querySelector('#replacement');
    input.value = 'new';
    input.dispatchEvent(new Event('input'));
    await panel.updateComplete;
    expect(panel.shadowRoot.querySelector('.browse-replace-confirmation')).to.be.null;
    await review();
    panel.searchState = { ...panel.searchState, request: {}, term: 'other' };
    await panel.updateComplete;
    expect(panel.shadowRoot.querySelector('.browse-replace-confirmation')).to.be.null;
  });

  it('blocks writes during search, replacement, errors, and without write permission', async () => {
    const defaults = panel.searchState;
    for (const state of [
      { loading: true }, { replacement: { loading: true } },
      { error: 'Search failed' }, { canWrite: false }, { count: 0 }, { term: undefined },
    ]) {
      panel.searchState = { ...defaults, ...state };
      // eslint-disable-next-line no-await-in-loop
      await panel.updateComplete;
      expect(panel.shadowRoot.querySelector('.browse-replace-form [type="submit"]').disabled).to.be.true;
      // eslint-disable-next-line no-await-in-loop
      await review();
      expect(panel.shadowRoot.querySelector('.browse-replace-confirmation')).to.be.null;
    }
  });

  it('reports replacement results and individual failures instead of silently succeeding', async () => {
    await setResults([result()]);
    panel.searchState = {
      ...panel.searchState,
      replacement: {
        replaced: 1,
        skipped: 1,
        errors: [{ path: '/org/site/denied.html', error: 'Could not save file (403).' }],
      },
    };
    await panel.updateComplete;
    expect(panel.shadowRoot.querySelector('[role="status"]').textContent)
      .to.equal('Replaced text in 1 file.');
    expect(panel.shadowRoot.textContent).to.contain('1 file had no matching text.');
    expect(panel.shadowRoot.querySelector('[role="alert"]').textContent).to.contain('403');
    const status = panel.shadowRoot.querySelector('[role="status"]');
    const context = panel.shadowRoot.querySelector('.browse-match-context');
    expect(status.compareDocumentPosition(context)).to.equal(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
