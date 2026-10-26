import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
await import('../../../../../../blocks/browse/v2/da-browse-header/da-browse-header.js');

describe('da-browse-header', () => {
  let header;
  let container;

  beforeEach(async () => {
    container = document.createElement('div');
    header = document.createElement('da-browse-header');
    // da-browse always supplies these.
    Object.assign(header, {
      groupByType: false,
      view: 'list',
      typesFilterState: { open: false, hiddenCount: 0 },
      sortState: { property: null, direction: 'none', loading: false },
    });
    container.append(header);
    document.body.append(container);
    await header.updateComplete;
  });

  afterEach(() => container.remove());

  it('renders independently with default sort and no config or chat action', () => {
    const sort = header.shadowRoot.querySelector('.browse-sort-control');
    expect(sort.textContent.trim()).to.equal('Sort');
    expect(sort.title).to.equal('Sort: Default');
    expect(header.shadowRoot.querySelector('[aria-pressed="true"]')).to.be.null;
    expect(header.shadowRoot.querySelector('.browse-settings-link')).to.be.null;
    expect(header.shadowRoot.querySelector('.chat-btn')).to.be.null;
  });

  it('shows config only at org and site roots, not inside folders', async () => {
    header.details = { org: 'org', path: '' };
    await header.updateComplete;
    expect(header.shadowRoot.querySelector('.browse-settings-link').getAttribute('href'))
      .to.equal('/config#/org/');
    expect(header.shadowRoot.querySelector('.browse-settings-link').textContent.trim())
      .to.equal('Configure Org');

    header.details = { org: 'org', site: 'site', path: '' };
    await header.updateComplete;
    expect(header.shadowRoot.querySelector('.browse-settings-link').getAttribute('href'))
      .to.equal('/config#/org/site/');
    expect(header.shadowRoot.querySelector('.browse-settings-link').textContent.trim())
      .to.equal('Configure Site');

    header.details = { org: 'org', site: 'site', path: 'folder' };
    await header.updateComplete;
    expect(header.shadowRoot.querySelector('.browse-settings-link')).to.be.null;

    header.details = { org: 'org', site: 'site', path: '' };
    await header.updateComplete;
    expect(header.shadowRoot.querySelector('.browse-settings-link')).not.to.be.null;
  });

  it('requests sorting without changing the supplied sort state', () => {
    let event;
    header.addEventListener('sortrequest', (e) => { event = e; });
    header.shadowRoot.querySelector('.browse-sort-option').click();
    expect(event.detail).to.deep.equal({ property: 'name', direction: 'ascending' });
    expect(event.bubbles).to.be.true;
    expect(event.composed).to.be.true;
    expect(header.sortState.property).to.be.null;
  });

  it('opens Sort and dismisses it with Escape while restoring trigger focus', async () => {
    const button = header.shadowRoot.querySelector('.browse-sort-control');
    button.click();
    await header.updateComplete;
    const popover = header.shadowRoot.querySelector('.browse-sort-popover');
    expect(popover.open).to.be.true;
    expect(button.getAttribute('aria-expanded')).to.equal('true');
    popover.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    popover.dispatchEvent(new CustomEvent('close'));
    await header.updateComplete;
    expect(popover.open).to.be.false;
    expect(button.getAttribute('aria-expanded')).to.equal('false');
    expect(header.shadowRoot.activeElement).to.equal(button);
  });

  it('replaces the creation slot with a stable search status and restores it afterwards', async () => {
    const creation = document.createElement('button');
    creation.textContent = 'New';
    header.append(creation);
    const summary = header.shadowRoot.querySelector('[role="status"]');
    expect(summary.textContent).to.equal('');
    expect(summary.getAttribute('aria-atomic')).to.equal('true');
    expect(header.shadowRoot.querySelector('slot').assignedElements()).to.deep.equal([creation]);
    header.searchState = { loading: true, count: 0 };
    await header.updateComplete;
    expect(header.shadowRoot.querySelector('[role="status"]')).to.equal(summary);
    expect(summary.textContent).to.equal('Searching...');
    expect(header.shadowRoot.querySelector('slot:not([name])')).to.be.null;
    expect(creation.isConnected).to.be.true;
    header.searchState = { loading: true, count: 1 };
    await header.updateComplete;
    expect(summary.textContent).to.equal('Searching...');
    const visual = header.shadowRoot.querySelector('.browse-search-summary');
    expect(visual.querySelector('.browse-search-progress').textContent).to.equal('Searching... \u00b7 1 found');
    expect(visual.getAttribute('aria-hidden')).to.equal('true');
    header.searchState = { loading: true, count: 2 };
    await header.updateComplete;
    expect(header.shadowRoot.querySelector('[role="status"]')).to.equal(summary);
    expect(summary.textContent).to.equal('Searching...');
    expect(visual.querySelector('.browse-search-progress').textContent).to.equal('Searching... \u00b7 2 found');
    header.searchState = { loading: false, count: 1 };
    await header.updateComplete;
    expect(summary.textContent).to.equal('1 result found');
    expect(summary.querySelector('span')).to.be.null;
    header.searchState = { loading: false, count: 2 };
    await header.updateComplete;
    expect(summary.textContent).to.equal('2 results found');
    header.searchState = { loading: false, count: 0 };
    await header.updateComplete;
    expect(summary.textContent).to.equal('No results found');
    header.searchState = undefined;
    await header.updateComplete;
    expect(summary.textContent).to.equal('');
    expect(header.shadowRoot.querySelector('slot').assignedElements()).to.deep.equal([creation]);
  });

  it('does not report an unsuccessful search as no matches', async () => {
    header.searchState = { loading: false, count: 0, error: 'Search failed' };
    await header.updateComplete;
    expect(header.shadowRoot.querySelector('[role="status"]').textContent).to.equal('');
    expect(header.shadowRoot.querySelector('slot:not([name])')).to.be.null;
  });

  it('reflects supplied sort state and disables sorting while loading', async () => {
    header.sortState = { property: 'lastModified', direction: 'descending', loading: true };
    await header.updateComplete;
    const picker = header.shadowRoot.querySelector('.browse-sort-control');
    expect(picker.title).to.equal('Sorted by Modified (newest first)');
    expect(picker.getAttribute('aria-busy')).to.equal('true');
    expect(picker.disabled).to.be.true;
    const options = [...header.shadowRoot.querySelectorAll('.browse-sort-option')];
    expect(options[2].getAttribute('aria-pressed')).to.equal('true');
    let requests = 0;
    header.addEventListener('sortrequest', () => { requests += 1; });
    options[0].click();
    expect(requests).to.equal(0);
  });

  it('passes the actual type-filter button as the popover anchor', () => {
    let event;
    header.addEventListener('typesfilterrequest', (e) => { event = e; });
    const button = header.shadowRoot.querySelectorAll('.browse-toolbar-control')[0];
    button.click();
    expect(event.detail.anchor).to.equal(button);
    expect(event.composed).to.be.true;
  });

  it('describes hidden types and restores the default filter label', async () => {
    header.typesFilterState = { open: false, hiddenCount: 2 };
    await header.updateComplete;
    const controls = header.shadowRoot.querySelectorAll('.browse-toolbar-control');
    expect(controls[0].title).to.equal('2 types hidden');
    expect(controls[0].querySelector('.browse-control-label').textContent)
      .to.equal('2 types hidden');
    header.typesFilterState = { open: false, hiddenCount: 0 };
    await header.updateComplete;
    expect(controls[0].title).to.equal('Show All');
  });

  it('emits viewchange from the view segmented control', async () => {
    const control = header.shadowRoot.querySelector('.browse-view-control');
    expect(control.value).to.equal('list');
    let detail;
    header.addEventListener('viewchange', (e) => { detail = e.detail; });
    control.dispatchEvent(new CustomEvent('change', { detail: { value: 'card' } }));
    expect(detail).to.deep.equal({ view: 'card' });
  });

  it('reports size changes for the current layout', async () => {
    const popover = header.shadowRoot.querySelector('.browse-appearance-popover');
    let detail;
    header.addEventListener('appearancesizechange', (e) => { detail = e.detail; });
    const sizeControl = () => popover.querySelector('nx-segmented-btn:not(.browse-view-control)');
    expect(sizeControl().value).to.equal('m');
    sizeControl().dispatchEvent(new CustomEvent('change', { detail: { value: 's' } }));
    expect(detail).to.deep.equal({ view: 'list', size: 's' });
    header.view = 'card';
    header.cardSize = 'l';
    await header.updateComplete;
    expect(sizeControl().getAttribute('label')).to.equal('Card size');
    expect(sizeControl().value).to.equal('l');
    sizeControl().dispatchEvent(new CustomEvent('change', { detail: { value: 'm' } }));
    expect(detail).to.deep.equal({ view: 'card', size: 'm' });
  });
});
