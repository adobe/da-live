import ootb from './providers/ootb.js';
import { runProjectValidationProvider } from './providers/project-validation.js';

const providers = [ootb, runProjectValidationProvider];

export function getPreflightProviders() {
  return [...providers];
}
