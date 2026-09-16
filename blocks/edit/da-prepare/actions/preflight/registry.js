// Lets code outside preflight.js (built-in providers like custom-validation.js, or an
// extended-checks feature like governance) contribute extra Preflight categories without
// preflight.js importing them directly. A provider is `async (details, { signal }) =>
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

// Test-oriented reset — production code never needs this, since a module's own
// top-level registerPreflightProvider() call only ever runs once per page load.
export function clearPreflightProviders() {
  providers.length = 0;
}
