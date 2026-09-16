import { runOotbProvider } from './providers/ootb.js';
import { runProjectValidationProvider } from './providers/project-validation.js';

// Lets code outside preflight.js (a project-specific check, an extended-checks feature
// like governance, etc.) contribute extra Preflight categories without preflight.js
// importing them directly. A provider is `async (details, { signal }) =>
// CategoryResult | CategoryResult[] | null`, where CategoryResult matches the shape OOTB
// categories already use: `{ title, open, checks: [{ title, results: [{ reason, badge }] }] }`.
// A provider may contribute more than one category (e.g. separate ones per check type) —
// return an array. Returning `null`/`[]` means "nothing to show" for that provider.
const providers = [];

export function registerPreflightProvider(provider) {
  providers.push(provider);
}

export function getPreflightProviders() {
  return [...providers];
}

// Test-oriented reset — production code never needs this, since each provider below is
// only ever registered once, when this module first evaluates.
export function clearPreflightProviders() {
  providers.length = 0;
}

// The default provider set. Registered here (statically, so no separate load step is
// needed by whoever mounts Preflight) rather than each provider self-registering on its
// own import — a provider module can't import registerPreflightProvider from this file
// and call it at its own top level, since that would form a circular import where the
// provider's module body (and its registerPreflightProvider(...) call) runs before this
// file's own `const providers = []` has executed. An extended/product feature like
// governance doesn't have this problem, since it isn't imported *by* this file — it
// registers itself from wherever it's loaded, with registry.js as a one-way dependency.
registerPreflightProvider(runOotbProvider);
registerPreflightProvider(runProjectValidationProvider);
