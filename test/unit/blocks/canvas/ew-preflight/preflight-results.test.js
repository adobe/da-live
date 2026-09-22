import { expect } from '@esm-bundle/chai';
import '../../../../../blocks/canvas/ew-preflight/preflight-results.js';
import { SEVERITY } from '../../../../../blocks/edit/da-prepare/actions/preflight/views/result.js';

function entry(overrides = {}) {
  const item = document.createElement('span');
  item.className = 'test-item';
  item.textContent = overrides.text ?? 'item';
  return { category: 'Content', title: 'H1', item, ...overrides };
}

function data({ failedEntries = [], passedEntries = [], naEntries = [] } = {}) {
  return {
    summary: [
      { label: 'Failed', value: failedEntries.length, severity: SEVERITY.ERROR },
      { label: 'Passed', value: passedEntries.length, severity: SEVERITY.SUCCESS },
      { label: 'Not applicable', value: naEntries.length, severity: SEVERITY.NA },
    ],
    sections: [
      { label: 'Failed checks', subLabel: `${failedEntries.length} failed`, severity: SEVERITY.ERROR, defaultOpen: failedEntries.length > 0, entries: failedEntries },
      { label: 'Passed checks', subLabel: `${passedEntries.length} passed`, severity: SEVERITY.SUCCESS, defaultOpen: failedEntries.length === 0, entries: passedEntries },
      { label: 'Not applicable', subLabel: `${naEntries.length} not executed`, severity: SEVERITY.NA, defaultOpen: false, entries: naEntries },
    ],
  };
}

let nextRunId = 1;
async function setRun(el, opts) {
  el.runId = nextRunId;
  nextRunId += 1;
  el.data = data(opts);
  document.body.append(el);
  await el.updateComplete;
}

function sectionByLabel(el, label) {
  return [...el.shadowRoot.querySelectorAll('.pfr-section')]
    .find((section) => section.querySelector('.pfr-section-label').textContent === label);
}

describe('preflight-results', () => {
  let el;

  afterEach(() => {
    if (el && el.parentElement) el.remove();
    el = null;
  });

  it('is defined as a custom element', () => {
    expect(customElements.get('preflight-results')).to.exist;
  });

  it('renders nothing without data', async () => {
    el = document.createElement('preflight-results');
    document.body.append(el);
    await el.updateComplete;

    expect(el.shadowRoot.querySelector('.pfr')).to.not.exist;
  });

  it('renders a summary tile per bucket', async () => {
    el = document.createElement('preflight-results');
    await setRun(el, { failedEntries: [entry()] });

    const tiles = el.shadowRoot.querySelectorAll('.pfr-tile');
    expect(tiles).to.have.length(3);
    expect(tiles[0].querySelector('.pfr-tile-value').textContent).to.equal('1');
  });

  it('opens sections with entries by default, and embeds the live item element', async () => {
    const e = entry();
    el = document.createElement('preflight-results');
    await setRun(el, { failedEntries: [e] });

    const section = el.shadowRoot.querySelector('.pfr-section');
    expect(section.classList.contains('is-open')).to.be.true;
    expect(section.querySelector('.pfr-entry-title').textContent).to.equal('H1');
    expect(section.querySelector('.pfr-entry-category').textContent).to.equal('Content');
    expect(section.querySelector('.pfr-entry-body').contains(e.item)).to.be.true;
  });

  it('keeps the passed section collapsed when there are failures', async () => {
    el = document.createElement('preflight-results');
    await setRun(el, { failedEntries: [entry()], passedEntries: [entry()] });

    const [, passedSection] = el.shadowRoot.querySelectorAll('.pfr-section');
    expect(passedSection.classList.contains('is-open')).to.be.false;
    expect(passedSection.querySelector('.pfr-entries')).to.not.exist;
  });

  it('toggles a section open/closed on header click', async () => {
    el = document.createElement('preflight-results');
    await setRun(el, { passedEntries: [entry()] });

    const passedSection = sectionByLabel(el, 'Passed checks');
    expect(passedSection.classList.contains('is-open')).to.be.true;

    passedSection.querySelector('.pfr-section-header').click();
    await el.updateComplete;
    expect(passedSection.classList.contains('is-open')).to.be.false;

    passedSection.querySelector('.pfr-section-header').click();
    await el.updateComplete;
    expect(passedSection.classList.contains('is-open')).to.be.true;
  });

  it('preserves an open/closed choice across a progressive update within the same run', async () => {
    el = document.createElement('preflight-results');
    const runId = nextRunId;
    await setRun(el, { passedEntries: [entry()] });

    const passedSection = sectionByLabel(el, 'Passed checks');
    passedSection.querySelector('.pfr-section-header').click();
    await el.updateComplete;
    expect(passedSection.classList.contains('is-open')).to.be.false;

    // adaptPreflightResults() always builds a fresh object per progressive update - same runId,
    // new data reference - which must not reset the user's collapse choice.
    el.runId = runId;
    el.data = data({ passedEntries: [entry(), entry()] });
    await el.updateComplete;

    expect(sectionByLabel(el, 'Passed checks').classList.contains('is-open')).to.be.false;
  });

  it('re-derives default-open state when a new run starts', async () => {
    el = document.createElement('preflight-results');
    await setRun(el, { passedEntries: [entry()] });

    const passedSection = sectionByLabel(el, 'Passed checks');
    passedSection.querySelector('.pfr-section-header').click();
    await el.updateComplete;
    expect(passedSection.classList.contains('is-open')).to.be.false;

    await setRun(el, { failedEntries: [entry()], passedEntries: [entry()] });

    expect(sectionByLabel(el, 'Failed checks').classList.contains('is-open')).to.be.true;
    expect(sectionByLabel(el, 'Passed checks').classList.contains('is-open')).to.be.false;
  });
});
