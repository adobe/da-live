// Test fixture: mock IMS for nx2/utils/api.js.
import sinon from 'sinon';

const SIGNED_IN = { accessToken: { token: 'test-token' } };

export const loadIms = sinon.stub().resolves(SIGNED_IN);
export const handleSignIn = sinon.spy();

export const setMockIms = ({ anonymous = false } = {}) => {
  loadIms.resolves(anonymous ? { anonymous: true } : SIGNED_IN);
};
export const resetMockIms = () => { loadIms.resolves(SIGNED_IN); };
