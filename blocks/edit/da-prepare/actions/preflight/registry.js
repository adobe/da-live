import ootb from './providers/ootb.js';
import projectValidation from './providers/project-validation.js';

const providers = [ootb, projectValidation];

export function getPreflightProviders() {
  return [...providers];
}
