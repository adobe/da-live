import { expect } from '@esm-bundle/chai';
import { createBranchingDiscovery, DA_RS_PROVIDER } from '../../../../blocks/shared/branching.js';
import { DA_ORIGIN } from '../../../../blocks/shared/constants.js';

const context = { providerId: 'provider', org: 'org', site: 'site' };
const capabilities = () => ({
  supported: true,
  apiVersion: 1,
  defaultBranchId: 'main',
  addressing: 'site-suffix',
  separator: '~',
  operations: ['create', 'changes', 'sync', 'publish', 'revert', 'restore'],
  itemKinds: ['html', 'json', 'media', 'config'],
  branchScopedSource: true,
  branchScopedCollaboration: true,
});
const response = (data, status = 200) => new Response(JSON.stringify(data), { status });
const loader = (value) => () => ({ capabilities: () => value });

describe('optional branching discovery', () => {
  it('is inert and only probes the explicitly selected da-rs provider', async () => {
    const saved = window.fetch;
    const calls = [];
    window.fetch = async (url, opts) => {
      calls.push({ url, opts });
      return response(capabilities());
    };
    try {
      const discovery = createBranchingDiscovery();
      expect(calls).to.have.length(0);
      expect((await discovery.discover(context)).status).to.equal('unsupported');
      expect(calls).to.have.length(0);
      expect((await discovery.discover({ ...context, providerId: DA_RS_PROVIDER })).status).to.equal('available');
      expect(calls[0].url).to.equal(`${DA_ORIGIN}/branches/org/site/capabilities`);
      expect(calls[0].opts.noRedirect).to.equal(true);
      expect(calls[0].opts.redirect).to.equal('error');
    } finally { window.fetch = saved; }
  });

  it('sanitizes and deeply freezes compatible results, ignoring server endpoints', async () => {
    const data = { ...capabilities(), endpoint: 'https://evil.example', operations: [...capabilities().operations, 'extra'] };
    const discovery = createBranchingDiscovery({ loadBranching: loader(response(data)) });
    const found = await discovery.discover(context);
    expect(found.status).to.equal('available');
    expect(found.capabilities.endpoint).to.be.undefined;
    expect(found.capabilities.operations).to.deep.equal(capabilities().operations);
    expect(Object.isFrozen(found)).to.be.true;
    expect(Object.isFrozen(found.capabilities)).to.be.true;
    expect(Object.isFrozen(found.capabilities.operations)).to.be.true;
    expect(Object.isFrozen(found.capabilities.itemKinds)).to.be.true;
  });

  it('does not redirect or fall back on a da-rs authorization failure', async () => {
    const saved = window.fetch;
    let calls = 0;
    window.fetch = async (url, opts) => {
      calls += 1;
      expect(url).to.equal(`${DA_ORIGIN}/branches/org/site/capabilities`);
      expect(opts.noRedirect).to.equal(true);
      return response({}, 401);
    };
    try {
      const discovery = createBranchingDiscovery();
      expect(await discovery.discover({ ...context, providerId: DA_RS_PROVIDER }))
        .to.deep.equal({ status: 'unavailable', reason: 'authorization' });
      expect(calls).to.equal(1);
    } finally { window.fetch = saved; }
  });

  it('rejects every incomplete or incompatible capability shape', async () => {
    const invalid = [
      { supported: true, apiVersion: 2 }, { defaultBranchId: 'other' }, { addressing: 'query' },
      { separator: '-' }, { branchScopedSource: false }, { branchScopedCollaboration: false },
      { operations: ['create', 'changes', 'sync', 'publish'] }, { itemKinds: ['html', 'json'] },
      { operations: 'create' }, { itemKinds: null },
    ];
    for (const override of invalid) {
      const loadBranching = loader(response({ ...capabilities(), ...override }));
      const discovery = createBranchingDiscovery({ loadBranching });
      expect((await discovery.discover(context)).status, JSON.stringify(override)).to.equal('unavailable');
    }
  });

  it('distinguishes unsupported, authorization, failed, and malformed discovery', async () => {
    const cases = [
      [loader(response({ supported: false })), 'unsupported', 'not-supported'],
      [loader(response({}, 404)), 'unsupported', 'not-implemented'],
      [loader(response({}, 501)), 'unsupported', 'not-implemented'],
      [loader(response({}, 401)), 'unavailable', 'authorization'],
      [loader(response({}, 403)), 'unavailable', 'authorization'],
      [loader(response({}, 500)), 'unavailable', 'request-failed'],
      [loader(new Response('bad json')), 'unavailable', 'invalid-response'],
      [() => { throw new Error('network'); }, 'unavailable', 'request-failed'],
      [() => undefined, 'unsupported', 'missing-module'],
    ];
    for (const [loadBranching, status, reason] of cases) {
      const discovery = createBranchingDiscovery({ loadBranching });
      expect(await discovery.discover(context)).to.deep.equal({ status, reason });
    }
  });

  it('bounds loader and body parsing even when abort is ignored', async () => {
    let signal;
    const hangs = () => new Promise(() => {});
    const waiting = [
      ({ signal: s }) => { signal = s; return hangs(); },
      ({ signal: s }) => { signal = s; return { capabilities: hangs }; },
      ({ signal: s }) => {
        signal = s;
        return { capabilities: () => ({ ok: true, status: 200, json: hangs }) };
      },
    ];
    for (const loadBranching of waiting) {
      const discovery = createBranchingDiscovery({ loadBranching, timeoutMs: 20 });
      expect(await discovery.discover(context)).to.deep.equal({ status: 'unavailable', reason: 'timeout' });
      expect(signal.aborted).to.be.true;
    }
  });

  it('deduplicates per provider and site and does not repopulate invalidated entries', async () => {
    const pending = [];
    const capabilitiesRequest = () => new Promise((resolve) => { pending.push(resolve); });
    const loadBranching = () => ({ capabilities: capabilitiesRequest });
    const discovery = createBranchingDiscovery({ loadBranching });
    const first = discovery.discover(context);
    expect(discovery.discover(context)).to.equal(first);
    await Promise.resolve();
    discovery.invalidate(context);
    const second = discovery.discover(context);
    const other = discovery.discover({ ...context, providerId: 'other' });
    const site = discovery.discover({ ...context, site: 'else' });
    const org = discovery.discover({ ...context, org: 'other' });
    await Promise.resolve();
    expect(pending).to.have.length(5);
    pending[1](response(capabilities()));
    pending[2](response({ supported: false }));
    pending[3](response({ supported: false }));
    pending[4](response({ supported: false }));
    expect((await second).status).to.equal('available');
    await Promise.all([other, site, org]);
    pending[0](response({ supported: false }));
    expect((await first).status).to.equal('unsupported');
    expect(await discovery.discover(context)).to.equal(await second);
    discovery.invalidate();
    expect(discovery.discover(context)).not.to.equal(second);
    await Promise.resolve();
    pending[5](response(capabilities()));
  });

  it('coalesces refreshes, expires successful results and does not reuse disabled H6 results', async () => {
    let now = 1000;
    let calls = 0;
    let enabled = false;
    const originalNow = Date.now;
    Date.now = () => now;
    const discovery = createBranchingDiscovery({
      loadBranching: () => ({
        capabilities: async () => {
          calls += 1;
          return response({ ...capabilities(), helix6BranchSource: enabled });
        },
      }),
    });
    const options = { refresh: true, maxAgeMs: 250, requireHelix6: true };
    try {
      const disabled = discovery.discover(context, options);
      expect(discovery.discover(context, options)).to.equal(disabled);
      await disabled;
      enabled = true;
      const available = discovery.discover(context, options);
      expect(available).not.to.equal(disabled);
      await available;
      expect(calls).to.equal(2);
      now += 249;
      expect(discovery.discover(context, options)).to.equal(available);
      now += 1;
      const expired = discovery.discover(context, options);
      expect(expired).not.to.equal(available);
      await expired;
      expect(calls).to.equal(3);
      const forced = discovery.discover(context, { ...options, maxAgeMs: 0 });
      expect(forced).not.to.equal(expired);
      await forced;
      expect(calls).to.equal(4);
    } finally { Date.now = originalNow; }
  });

  it('retries a timed-out discovery on refresh without returning an older positive', async () => {
    let hang = false;
    let calls = 0;
    const discovery = createBranchingDiscovery({
      timeoutMs: 20,
      loadBranching: () => ({
        capabilities: () => {
          calls += 1;
          return hang ? new Promise(() => {}) : response(capabilities());
        },
      }),
    });
    const options = { refresh: true };
    expect((await discovery.discover(context, options)).status).to.equal('available');
    hang = true;
    const pending = discovery.discover(context, options);
    expect(discovery.discover(context, options)).to.equal(pending);
    expect(await pending).to.deep.equal({ status: 'unavailable', reason: 'timeout' });
    hang = false;
    expect(await discovery.discover(context)).to.deep.equal({ status: 'unavailable', reason: 'timeout' });
    expect(calls).to.equal(2);
    expect((await discovery.discover(context, options)).status).to.equal('available');
    expect(calls).to.equal(3);
  });
});
