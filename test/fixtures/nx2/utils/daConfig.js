// Test double for nx2/utils/daConfig.js. Tests set what getConfigValue resolves to.
import { stub } from 'sinon';

export const getConfigValue = stub().resolves(undefined);
