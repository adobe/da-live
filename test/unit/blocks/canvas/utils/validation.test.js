import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { createValidationRequester } = await import(
  '../../../../../blocks/canvas/utils/validation.js'
);

function goodItem(title = 'Alt text') {
  return { severity: 'warn', title, message: 'Missing alt text' };
}

function waitForMessage(port) {
  return new Promise((resolve) => {
    port.onmessage = (e) => resolve(e.data);
  });
}

describe('createValidationRequester', () => {
  it('posts a RUN message with a fresh requestId', async () => {
    const { port1, port2 } = new MessageChannel();
    const requester = createValidationRequester(port1);
    requester.run();
    const data = await waitForMessage(port2);
    expect(data.type).to.equal('run');
    expect(data.requestId).to.be.a('string');
  });

  it('resolves with sanitized items on a matching RESULT', async () => {
    const { port1, port2 } = new MessageChannel();
    const requester = createValidationRequester(port1);
    const runPromise = requester.run();
    const { requestId } = await waitForMessage(port2);
    port2.postMessage({
      type: 'result',
      requestId,
      items: [goodItem(), { severity: 'bogus' }],
      hasRunner: true,
    });
    expect(await runPromise).to.deep.equal({
      items: [goodItem()],
      timedOut: false,
      hasRunner: true,
    });
  });

  it('ignores a RESULT for a stale (superseded) requestId', async () => {
    const { port1, port2 } = new MessageChannel();
    const requester = createValidationRequester(port1);

    // First run() is abandoned once run() is called again — its promise is left pending
    // by design, so it's not awaited here.
    requester.run();
    const { requestId: firstId } = await waitForMessage(port2);

    const secondRunMsg = waitForMessage(port2);
    const secondRun = requester.run();
    const { requestId: secondId } = await secondRunMsg;
    expect(secondId).to.not.equal(firstId);

    // Late RESULT for the abandoned first request must not resolve anything.
    const staleResult = { type: 'result', requestId: firstId, items: [], hasRunner: true };
    const liveItems = [goodItem()];
    const liveResult = { type: 'result', requestId: secondId, items: liveItems, hasRunner: true };
    port2.postMessage(staleResult);
    port2.postMessage(liveResult);

    const expected = { items: [goodItem()], timedOut: false, hasRunner: true };
    expect(await secondRun).to.deep.equal(expected);
  });

  it('resolves with hasRunner: null when no ACK arrives (old host/no quick-edit here)', async () => {
    const clock = sinon.useFakeTimers();
    try {
      const { port1 } = new MessageChannel();
      const requester = createValidationRequester(port1);
      const resultPromise = requester.run();
      await clock.tickAsync(1000);
      expect(await resultPromise).to.deep.equal({ items: null, timedOut: true, hasRunner: null });
    } finally {
      clock.restore();
    }
  });

  it('resolves with the ACK\'d hasRunner when ACK\'d but no RESULT ever arrives', async () => {
    const clock = sinon.useFakeTimers();
    try {
      const { port1, port2 } = new MessageChannel();
      const requester = createValidationRequester(port1);
      const resultPromise = requester.run();
      const { requestId } = await waitForMessage(port2);
      port2.postMessage({ type: 'ack', requestId, hasRunner: true });
      await clock.tickAsync(4000);
      expect(await resultPromise).to.deep.equal({ items: null, timedOut: true, hasRunner: true });
    } finally {
      clock.restore();
    }
  });

  it('does not time out at the ack-phase deadline once ACK has already arrived', async () => {
    const clock = sinon.useFakeTimers();
    try {
      const { port1, port2 } = new MessageChannel();
      const requester = createValidationRequester(port1);
      const resultPromise = requester.run();
      const { requestId } = await waitForMessage(port2);
      port2.postMessage({ type: 'ack', requestId, hasRunner: true });
      await clock.tickAsync(1000);
      port2.postMessage({ type: 'result', requestId, items: [goodItem()], hasRunner: true });
      const expected = { items: [goodItem()], timedOut: false, hasRunner: true };
      expect(await resultPromise).to.deep.equal(expected);
    } finally {
      clock.restore();
    }
  });

  it('dispose() clears the pending timeout and closes the port', () => {
    const { port1 } = new MessageChannel();
    const requester = createValidationRequester(port1);
    requester.run();
    expect(() => requester.dispose()).to.not.throw();
    expect(port1.onmessage).to.equal(null);
  });
});
