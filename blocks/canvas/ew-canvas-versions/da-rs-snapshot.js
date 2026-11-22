import { getNx2Api } from '../../../scripts/utils.js';
import { isStrongSourceETag } from '../../shared/da-rs-provider.js';

// Snapshot only the editor state whose collaboration flush was acknowledged.
export async function createDaRsSnapshot({
  path, label, view, editor, isCurrent, getApi = getNx2Api,
}) {
  const [, org, site, ...parts] = path.split('/');
  const context = { org, site, path: parts.join('/') };
  try {
    let api;
    let h6;
    // Legacy branches keep their existing DA snapshot path, without requiring a
    // Canvas comparison session. H6 branches still require a durable flush.
    if (site?.includes('~')) {
      api = await getApi();
      if (!isCurrent()) return false;
      h6 = await api.isHlx6(org, site);
      if (!isCurrent()) return false;
      if (!h6) {
        const result = await api.versions.create(path, label ? { comment: label } : {});
        return result?.status === 201 && isCurrent();
      }
    }
    const session = editor?.getComparisonSession?.(context);
    if (!view?.editable || !session?.wsProvider || session.view !== view) return false;
    const { doc } = view.state;
    const current = () => isCurrent() && view.editable && view.state.doc === doc
      && editor.getComparisonSession(context) === session;
    const flush = await editor.saveForComparison(context);
    if (!flush?.ok || !current()) return false;
    api ??= await getApi();
    if (!current()) return false;
    h6 ??= await api.isHlx6(org, site);
    if (!current()) return false;
    const options = label ? { comment: label } : {};
    if (h6) {
      const head = await api.source.getMetadata(path);
      if (!current() || !head?.ok || !head.permissions?.includes('write')) return false;
      const etag = head.headers?.get('etag');
      if (!isStrongSourceETag(etag)) return false;
      options.operation = 'version';
      options.ifMatch = etag;
    }
    if (!current()) return false;
    const result = await api.versions.create(path, options);
    return result?.status === 201 && current();
  } catch {
    return false;
  }
}
