import { expect } from '@esm-bundle/chai';
import {
  registerPreflightProvider,
  getPreflightProviders,
  clearPreflightProviders,
} from '../../../../../../../blocks/edit/da-prepare/actions/preflight/registry.js';

afterEach(() => {
  clearPreflightProviders();
});

describe('preflight provider registry', () => {
  it('starts empty', () => {
    expect(getPreflightProviders()).to.deep.equal([]);
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
