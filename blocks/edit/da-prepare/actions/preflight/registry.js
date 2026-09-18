import ootb from './providers/ootb.js';

const providers = [ootb];

export function getPreflightProviders() {
  return [...providers];
}
