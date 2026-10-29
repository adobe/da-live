import { expect } from '@esm-bundle/chai';
import { createChannel } from '../../../../blocks/shared/channel.js';

describe('shared channel replay', () => {
  it('replays a disabled state instead of the previously enabled state', () => {
    const channel = createChannel({ replay: true });
    channel.emit(true);
    channel.emit(false);
    const received = [];
    const unsubscribe = channel.subscribe((value) => received.push(value));
    unsubscribe();
    expect(received).to.deep.equal([false]);
  });

  it('replays undefined when a previously available state becomes pending', () => {
    const channel = createChannel({ replay: true });
    channel.emit(true);
    channel.emit(undefined);
    const received = [];
    const unsubscribe = channel.subscribe((value) => received.push(value));
    unsubscribe();
    expect(received).to.deep.equal([undefined]);
  });

  it('does not invent a pending state before any value has been emitted', () => {
    const channel = createChannel({ replay: true });
    const received = [];
    const unsubscribe = channel.subscribe((value) => received.push(value));
    unsubscribe();
    expect(received).to.deep.equal([]);
  });
});
