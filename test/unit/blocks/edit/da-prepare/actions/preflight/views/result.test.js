import { expect } from '@esm-bundle/chai';
import PreflightResult, { STATUS, SEVERITY, createResult } from '../../../../../../../../blocks/edit/da-prepare/actions/preflight/views/result.js';

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('PreflightResult', () => {
  it('registers pf-result', () => {
    expect(customElements.get('pf-result')).to.equal(PreflightResult);
  });

  it('starts pending', () => {
    const item = createResult();
    expect(item.status).to.equal(STATUS.PENDING);
  });

  it('starts with a defined pending badge and reason, not undefined', () => {
    const item = createResult();
    expect(item.badge).to.equal(STATUS.PENDING);
    expect(item.reason).to.be.a('string').that.is.not.empty;
  });

  it('settle() sets result, badge, reason and marks done', () => {
    const item = createResult();
    item.settle(SEVERITY.WARN, SEVERITY.WARN, 'Something to flag.');

    expect(item.result).to.equal(SEVERITY.WARN);
    expect(item.badge).to.equal(SEVERITY.WARN);
    expect(item.reason).to.equal('Something to flag.');
    expect(item.status).to.equal(STATUS.DONE);
  });

  it('renders the reason and a pf-label reflecting the badge', async () => {
    const item = createResult();
    item.settle(SEVERITY.SUCCESS, SEVERITY.SUCCESS, 'All good.');
    document.body.appendChild(item);
    await nextFrame();

    expect(item.shadowRoot.textContent).to.contain('All good.');
    const label = item.shadowRoot.querySelector('pf-label');
    expect(label.badge).to.equal(SEVERITY.SUCCESS);

    item.remove();
  });

  it('renders a pending pf-label (not undefined) before settle() is called', async () => {
    const item = createResult();
    document.body.appendChild(item);
    await nextFrame();

    const label = item.shadowRoot.querySelector('pf-label');
    expect(label.badge).to.equal(STATUS.PENDING);
    const use = label.shadowRoot.querySelector('svg use');
    expect(use.getAttribute('href')).to.contain('ClockPending');

    item.remove();
  });
});
