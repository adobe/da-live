import { expect } from '@esm-bundle/chai';
import { runOotbProvider } from '../../../../../../../blocks/edit/da-prepare/actions/preflight/providers/ootb.js';
import { runProjectValidationProvider } from '../../../../../../../blocks/edit/da-prepare/actions/preflight/providers/project-validation.js';
import {
  registerPreflightProvider,
  getPreflightProviders,
  clearPreflightProviders,
} from '../../../../../../../blocks/edit/da-prepare/actions/preflight/registry.js';

describe('preflight provider registry', () => {
  // Must run before any other test clears the registry — this checks the pristine,
  // just-imported state.
  it('registers the default providers (OOTB, custom validation)', () => {
    expect(getPreflightProviders()).to.deep.equal([runOotbProvider, runProjectValidationProvider]);
  });

  describe('registerPreflightProvider / getPreflightProviders / clearPreflightProviders', () => {
    beforeEach(() => {
      clearPreflightProviders();
    });

    it('returns registered providers in registration order', () => {
      const providerA = () => null;
      const providerB = () => null;
      registerPreflightProvider(providerA);
      registerPreflightProvider(providerB);
      expect(getPreflightProviders()).to.deep.equal([providerA, providerB]);
    });

    it('returns a copy, not the live array', () => {
      const provider = () => null;
      registerPreflightProvider(provider);
      const result = getPreflightProviders();
      result.push(() => null);
      expect(getPreflightProviders()).to.have.length(1);
    });

    it('clearPreflightProviders empties the registry', () => {
      registerPreflightProvider(() => null);
      clearPreflightProviders();
      expect(getPreflightProviders()).to.deep.equal([]);
    });
  });
});
