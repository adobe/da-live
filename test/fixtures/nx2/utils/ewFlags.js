// Mock NX2 /utils/ewFlags.js for tests
// EW is off unless tests override via globalThis.__ewEnabledMock.
export const isEWEnabled = async (args) => globalThis.__ewEnabledMock?.(args) ?? false;
