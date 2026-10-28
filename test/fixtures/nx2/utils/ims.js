// Test fixture mirroring nx2/utils/ims.js.
const SIGNED_IN = { accessToken: { token: 'test-token' } };

let mockIms = SIGNED_IN;

export const setMockIms = ({ anonymous = false } = {}) => {
  mockIms = anonymous ? { anonymous: true } : SIGNED_IN;
};
export const resetMockIms = () => { mockIms = SIGNED_IN; };

export const loadIms = async () => mockIms;
export const handleSignIn = () => {};
