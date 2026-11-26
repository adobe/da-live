import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let mod;

before(async () => {
  mod = await import('../../../../../blocks/canvas/ew-agent-activity/agent-activity.js');
});

const fire = (type, detail) => document.dispatchEvent(new CustomEvent(type, { detail }));

describe('reduceAgentActivity', () => {
  it('starts a running turn with no pages, even after a previous turn', () => {
    const { reduceAgentActivity, TURN_EVENT } = mod;
    const previous = { status: 'completed', pages: [{ path: '/a', status: 'done' }] };
    expect(reduceAgentActivity(previous, TURN_EVENT.STARTED, {}))
      .to.deep.equal({ status: 'running', pages: [] });
  });

  it('replaces the page list on each progress event', () => {
    const { reduceAgentActivity, TURN_EVENT } = mod;
    let state = reduceAgentActivity(undefined, TURN_EVENT.STARTED);
    state = reduceAgentActivity(state, TURN_EVENT.PROGRESS, { pages: [{ path: '/a', status: 'working' }, { path: '/b', status: 'working' }] });
    state = reduceAgentActivity(state, TURN_EVENT.PROGRESS, { pages: [{ path: '/a', status: 'done' }] });
    expect(state).to.deep.equal({ status: 'running', pages: [{ path: '/a', status: 'done' }] });
  });

  it('begins a running turn from progress that arrives without a start', () => {
    const { reduceAgentActivity, TURN_EVENT } = mod;
    expect(reduceAgentActivity(undefined, TURN_EVENT.PROGRESS, { pages: [] }))
      .to.deep.equal({ status: 'running', pages: [] });
  });

  it('records how the turn ended, once, and ignores completions with no running turn', () => {
    const { reduceAgentActivity, TURN_EVENT } = mod;
    const running = { status: 'running', pages: [] };
    const failed = reduceAgentActivity(running, TURN_EVENT.COMPLETED, { status: 'error' });
    expect(failed.status).to.equal('error');
    expect(reduceAgentActivity(failed, TURN_EVENT.COMPLETED, { status: 'completed' })).to.equal(failed);
    expect(reduceAgentActivity(undefined, TURN_EVENT.COMPLETED, { status: 'completed' }))
      .to.equal(undefined);
    expect(reduceAgentActivity(running, TURN_EVENT.COMPLETED, {}).status).to.equal('completed');
  });
});

describe('installAgentActivity', () => {
  let uninstall;
  let unsubscribe;

  afterEach(() => {
    unsubscribe?.();
    uninstall?.();
  });

  it('publishes each turn event and opens the panel only when a prompt is sent', () => {
    const { installAgentActivity, TURN_EVENT } = mod;
    let opened = 0;
    uninstall = installAgentActivity({ onTurnStarted: () => { opened += 1; } });
    const states = [];
    unsubscribe = canvasBus.agentActivityState.subscribe((state) => states.push(state));
    states.length = 0;

    fire(TURN_EVENT.STARTED, {});
    fire(TURN_EVENT.PROGRESS, { pages: [{ path: '/a', status: 'working' }] });
    fire(TURN_EVENT.COMPLETED, { status: 'completed' });
    fire(TURN_EVENT.COMPLETED, { status: 'completed' });

    expect(opened).to.equal(1);
    expect(states).to.deep.equal([
      { status: 'running', pages: [] },
      { status: 'running', pages: [{ path: '/a', status: 'working' }] },
      { status: 'completed', pages: [{ path: '/a', status: 'working' }] },
    ]);
  });

  it('installs once and stops listening after uninstall', () => {
    const { installAgentActivity, TURN_EVENT } = mod;
    let opened = 0;
    uninstall = installAgentActivity({ onTurnStarted: () => { opened += 1; } });
    expect(installAgentActivity({ onTurnStarted: () => { opened += 10; } })).to.equal(uninstall);
    uninstall();
    uninstall = undefined;
    fire(TURN_EVENT.STARTED, {});
    expect(opened).to.equal(0);
  });
});
