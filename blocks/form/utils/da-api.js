import { getNx2Api } from '../../../scripts/utils.js';
import { isDaRsBinding } from '../../shared/da-rs-provider.js';

// DA source operations for the form block, rewritten onto the nx2 api. The
// `sourceUrl`/`path` args are DA locator strings (`/org/site/rest`); the nx2
// `source.*` methods accept that string form directly. Return shapes are kept
// identical to the legacy nx da-api so context/schemas/persistence are
// unchanged: `{ html }` / `{ json }` / `{ ok }` on success, `{ error, status }`
// on failure.

export async function fetchSourceHtml({ sourceUrl }) {
  if (!sourceUrl) return { error: 'Missing source URL.' };

  try {
    const { source, asText } = await getNx2Api();
    const { ok, data, status } = await asText(source.get(sourceUrl));
    if (!ok) return { error: 'Could not load source document.', status };
    return { html: data };
  } catch (e) {
    return { error: 'Could not load source document.', cause: e?.message ?? String(e) };
  }
}

export async function fetchSourceByPath({ path }) {
  if (!path) return { error: 'Missing source path.' };

  try {
    const { source, asText } = await getNx2Api();
    const { ok, data, status } = await asText(source.get(path));
    if (!ok) return { error: 'Could not load source path.', status };
    return { html: data };
  } catch (e) {
    return { error: 'Could not load source path.', cause: e?.message ?? String(e) };
  }
}

export async function listPath({ path }) {
  if (!path) return { error: 'Missing list path.' };

  try {
    const { source } = await getNx2Api();
    const { ok, items } = await source.list(path);
    if (!ok) return { error: 'Could not list path.' };
    return { json: items };
  } catch (e) {
    return { error: 'Could not list path.', cause: e?.message ?? String(e) };
  }
}

export async function saveSourceHtml({ path, html }) {
  if (!path || typeof html !== 'string') return { error: 'Invalid save input.' };

  try {
    const { source } = await getNx2Api();
    const replace = isDaRsBinding() && !path.split('/')[2]?.includes('~') && source.replace;
    const resp = await (replace
      ? source.replace(path, { body: html }) : source.save(path, { body: html }));
    if (!resp?.ok) return { error: 'Could not save source document.', status: resp?.status };
    return { ok: true };
  } catch (e) {
    return { error: 'Could not save source document.', cause: e?.message ?? String(e) };
  }
}
