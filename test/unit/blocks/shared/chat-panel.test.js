import { expect } from '@esm-bundle/chai';
import { setNx, getNx, getNxEWFlags } from '../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
const { chatAvailability } = await import('../../../../blocks/shared/chat-panel.js');
const { hashChange } = await import(`${getNx()}/utils/utils.js`);
const { setChatAvailability } = await getNxEWFlags();
const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('shared chat availability', () => {
  let unsubscribers;

  function observe(values) {
    const unsubscribe = chatAvailability.subscribe((enabled) => values.push(enabled));
    unsubscribers.push(unsubscribe);
    return unsubscribe;
  }

  beforeEach(() => {
    unsubscribers = [];
    hashChange._set({ org: 'org', site: 'site' });
  });

  afterEach(() => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    setChatAvailability(async () => false);
    hashChange._set({});
  });

  it('shares one decision across subscribers and replays it without rechecking document paths', async () => {
    const contexts = [];
    setChatAvailability(async (context) => {
      contexts.push(context);
      return true;
    });
    const first = [];
    const second = [];
    observe(first);
    observe(second);
    await flush();
    expect(first.at(-1)).to.be.true;
    expect(second.at(-1)).to.be.true;

    const late = [];
    observe(late);
    expect(late).to.deep.equal([true]);
    hashChange._set({ org: 'org', site: 'site', path: '/another-document' });
    await flush();
    expect(contexts).to.deep.equal([{ org: 'org', site: 'site' }]);

    hashChange._set({ org: 'org' });
    await flush();
    expect(contexts).to.deep.equal([
      { org: 'org', site: 'site' },
      { org: 'org', site: undefined },
    ]);
  });

  it('publishes pending availability and ignores a stale enabled result after navigation', async () => {
    let release;
    const delayed = new Promise((resolve) => { release = resolve; });
    setChatAvailability(({ site }) => (site === 'site' ? delayed : false));
    const values = [];
    observe(values);
    try {
      await flush();
      expect(values.at(-1)).to.be.undefined;
      const latePending = [];
      observe(latePending);
      expect(latePending).to.deep.equal([undefined]);
      hashChange._set({ org: 'org', site: 'disabled' });
      await flush();
      expect(values.at(-1)).to.be.false;
      const lateDisabled = [];
      observe(lateDisabled);
      expect(lateDisabled).to.deep.equal([false]);
      release(true);
      await flush();
      expect(values).not.to.include(true);
    } finally {
      release(true);
      await flush();
    }
  });

  it('stops notifying disconnected consumers and rechecks when a new host subscribes', async () => {
    let release;
    const delayed = new Promise((resolve) => { release = resolve; });
    let checks = 0;
    setChatAvailability(() => {
      checks += 1;
      return checks === 1 ? delayed : false;
    });
    const disconnected = [];
    const unsubscribe = observe(disconnected);
    try {
      await flush();
      unsubscribe();
      const previous = [...disconnected];
      const current = [];
      observe(current);
      await flush();
      release(true);
      await flush();
      expect(checks).to.equal(2);
      expect(disconnected).to.deep.equal(previous);
      expect(current.at(-1)).to.be.false;
      expect(current).not.to.include(true);
    } finally {
      release(true);
      await flush();
    }
  });

  it('does not check without an org and fails closed before recovering on navigation', async () => {
    const contexts = [];
    setChatAvailability(async (context) => {
      contexts.push(context);
      if (context.org === 'unavailable') throw new Error('Flags unavailable');
      return true;
    });
    hashChange._set({});
    const values = [];
    observe(values);
    await flush();
    expect(values.at(-1)).to.be.false;
    expect(contexts).to.have.length(0);

    hashChange._set({ org: 'unavailable' });
    await flush();
    expect(values.at(-1)).to.be.false;
    hashChange._set({ org: 'available' });
    await flush();
    expect(values.at(-1)).to.be.true;
    expect(contexts).to.have.length(2);
  });
});
