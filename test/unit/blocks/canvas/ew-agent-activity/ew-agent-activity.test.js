/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

before(async () => {
  await import('../../../../../blocks/canvas/ew-agent-activity/ew-agent-activity.js');
});

describe('ew-agent-activity', () => {
  let el;

  async function mount() {
    el = document.createElement('ew-agent-activity');
    document.body.append(el);
    await el.updateComplete;
    return el.shadowRoot;
  }

  afterEach(() => el?.remove());

  const text = (root, selector) => [...root.querySelectorAll(selector)]
    .map((node) => node.textContent.replace(/\s+/g, ' ').trim());

  it('shows the latest activity even when it was published before the panel loaded', async () => {
    canvasBus.agentActivityState.emit({
      status: 'running',
      pages: [
        { path: '/a', status: 'done' },
        { path: '/b', status: 'working' },
        { path: '/c', status: 'failed' },
        { path: '/d', status: 'needs-approval' },
      ],
    });
    const root = await mount();

    expect(root.querySelector('h3').textContent).to.equal('4 pages identified');
    expect(root.querySelector('.turn-status').textContent).to.equal('Running');
    expect(root.querySelector('progress').value).to.equal(2);
    expect(root.querySelector('progress').max).to.equal(4);
    expect(text(root, '.count')).to.deep.equal([
      'Needs approval 1', 'Working 1', 'Failed 1', 'Done 1',
    ]);
    expect(text(root, '.page')).to.deep.equal([
      '/a Done', '/b Working', '/c Failed', '/d Needs approval',
    ]);
  });

  it('updates live as pages are identified and the turn ends', async () => {
    canvasBus.agentActivityState.emit({ status: 'running', pages: [] });
    const root = await mount();
    expect(root.querySelector('h3').textContent).to.equal('0 pages identified');
    expect(root.querySelector('.pages')).to.equal(null);
    expect(root.textContent).to.include('Waiting for the agent to identify pages');

    canvasBus.agentActivityState.emit({ status: 'running', pages: [{ path: '/a', status: 'working' }] });
    await el.updateComplete;
    expect(root.querySelector('h3').textContent).to.equal('1 page identified');

    canvasBus.agentActivityState.emit({ status: 'completed', pages: [{ path: '/a', status: 'done' }] });
    await el.updateComplete;
    expect(root.querySelector('.turn-status').textContent).to.equal('Completed');
    expect(root.textContent).to.include('1 of 1 page finished');
  });

  it('explains when a finished prompt touched no pages, and labels stopped and failed turns', async () => {
    canvasBus.agentActivityState.emit({ status: 'aborted', pages: [] });
    const root = await mount();
    expect(root.querySelector('.turn-status').textContent).to.equal('Stopped');
    expect(root.textContent).to.include('did not work on any pages');

    canvasBus.agentActivityState.emit({ status: 'error', pages: [] });
    await el.updateComplete;
    expect(root.querySelector('.turn-status').textContent).to.equal('Failed');
  });

  it('stops listening once removed', async () => {
    canvasBus.agentActivityState.emit({ status: 'running', pages: [] });
    await mount();
    el.remove();
    canvasBus.agentActivityState.emit({ status: 'completed', pages: [] });
    expect(el._activity.status).to.equal('running');
  });
});
