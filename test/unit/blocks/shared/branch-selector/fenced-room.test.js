import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import {
  handleFencedRoomClose,
  isFencedProvider,
  registerFencedView,
} from '../../../../../blocks/shared/branch-selector/fenced-room.js';

describe('fenced collaboration rooms', () => {
  it('leaves ordinary close behavior unchanged', () => {
    const provider = { shouldConnect: true, destroy: sinon.spy() };
    const doc = { destroy: sinon.spy() };
    const reload = sinon.spy();
    expect(handleFencedRoomClose({ code: 1006 }, provider, doc, reload)).to.equal(false);
    expect(provider.shouldConnect).to.equal(true);
    expect(provider.destroy.called).to.equal(false);
    expect(doc.destroy.called).to.equal(false);
    expect(reload.called).to.equal(false);
  });

  it('stops reconnect and still disposes the document if view teardown fails', () => {
    const provider = { shouldConnect: true, destroy: sinon.spy() };
    const doc = { destroy: sinon.spy() };
    const reload = sinon.spy();
    registerFencedView(provider, () => { throw new Error('view teardown failed'); });
    expect(() => handleFencedRoomClose({ code: 4412 }, provider, doc, reload)).to.throw();
    expect(provider.shouldConnect).to.equal(false);
    expect(isFencedProvider(provider)).to.equal(true);
    expect(provider.destroy.calledOnce).to.equal(true);
    expect(doc.destroy.calledOnce).to.equal(true);
    expect(reload.calledOnce).to.equal(true);
  });
});
