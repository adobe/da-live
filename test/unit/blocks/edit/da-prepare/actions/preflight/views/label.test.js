/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('pf-label', () => {
  before(async () => {
    const savedFetch = window.fetch;
    window.fetch = () => Promise.resolve(new Response('', { status: 200 }));
    try {
      await import('../../../../../../../../blocks/edit/da-prepare/actions/preflight/views/label.js');
    } finally {
      window.fetch = savedFetch;
    }
  });

  it('Renders the icon for the configured badge', async () => {
    const el = document.createElement('pf-label');
    el.badge = 'info';
    document.body.appendChild(el);
    await nextFrame();
    const use = el.shadowRoot.querySelector('svg use');
    expect(use.getAttribute('href')).to.contain('S2_Icon_InfoCircle');
    el.remove();
  });

  it('Renders the more block when text is supplied', async () => {
    const el = document.createElement('pf-label');
    el.badge = 'info';
    el.text = '200';
    document.body.appendChild(el);
    await nextFrame();
    expect(el.shadowRoot.querySelector('.label-text').textContent).to.equal('200');
    el.remove();
  });

  it('Omits the more block when neither text nor icon is supplied', async () => {
    const el = document.createElement('pf-label');
    el.badge = 'info';
    document.body.appendChild(el);
    await nextFrame();
    expect(el.shadowRoot.querySelector('.more')).to.equal(null);
    el.remove();
  });

  it('Sets the className to badge-X on update', async () => {
    const el = document.createElement('pf-label');
    el.badge = 'success';
    document.body.appendChild(el);
    await nextFrame();
    el.badge = 'warn';
    await el.updateComplete;
    expect(el.className).to.equal('badge-warn');
    el.remove();
  });
});
