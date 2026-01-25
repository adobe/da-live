import { expect } from '@esm-bundle/chai';
import { createConfigStaleMonitor } from '../../../../../blocks/sheet/utils/config-stale.js';

describe('config stale monitor', () => {
  it('detects stale config when state changes', async () => {
    const states = ['old', 'new'];
    let staleCount = 0;

    const monitor = createConfigStaleMonitor({
      getConfigState: async () => states[0],
      onStale: () => { staleCount += 1; },
      schedule: () => 1,
      unschedule: () => {},
    });

    await monitor.start();
    states.shift();

    const isStale = await monitor.check();
    expect(isStale).to.equal(true);
    expect(staleCount).to.equal(1);
  });

  it('suppresses repeated stale prompts after ignore', async () => {
    let staleCount = 0;

    const monitor = createConfigStaleMonitor({
      getConfigState: async () => 'new',
      onStale: () => { staleCount += 1; },
      schedule: () => 1,
      unschedule: () => {},
    });

    await monitor.start();
    monitor.ignore();
    await monitor.check();

    expect(staleCount).to.equal(0);
  });

  it('refresh clears ignore state and restarts detection', async () => {
    const states = ['old', 'new', 'new', 'latest'];
    let staleCount = 0;

    const monitor = createConfigStaleMonitor({
      getConfigState: async () => states.shift(),
      onStale: () => { staleCount += 1; },
      schedule: () => 1,
      unschedule: () => {},
    });

    await monitor.start();
    await monitor.check();
    expect(staleCount).to.equal(1);

    monitor.ignore();
    await monitor.refresh();

    const isStale = await monitor.check();
    expect(isStale).to.equal(true);
    expect(staleCount).to.equal(2);
  });

  it('clears scheduled interval on stop', async () => {
    let clearedId;

    const monitor = createConfigStaleMonitor({
      getConfigState: async () => 'state',
      onStale: () => {},
      schedule: () => 27,
      unschedule: (id) => { clearedId = id; },
    });

    await monitor.start();
    monitor.stop();

    expect(clearedId).to.equal(27);
  });
});
