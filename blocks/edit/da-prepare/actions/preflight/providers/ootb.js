import { loadDoc, loadResults } from '../utils/utils.js';
import { registerPreflightProvider } from '../registry.js';

// References/Content/SEO — the always-on baseline checks, wrapped as a provider like any
// other. `loadResults` returns its categories immediately; each check's own results fill
// in later via its `.then()`, calling `requestUpdate` to re-render — same as before this
// was a provider.
export async function runOotbProvider(details, { requestUpdate } = {}) {
  const { error, doc } = await loadDoc(details);
  if (error) return null;
  return loadResults(doc, requestUpdate);
}

registerPreflightProvider(runOotbProvider);
