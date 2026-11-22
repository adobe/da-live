// Test fixture: mock IMS for nx2/utils/api.js.
import sinon from 'sinon';

export const loadIms = sinon.stub().resolves({ accessToken: { token: 'test-token' } });
export const handleSignIn = sinon.spy();
