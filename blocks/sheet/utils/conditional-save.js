import { getNx2Api } from '../../../scripts/utils.js';
import { isStrongSourceETag } from '../../shared/da-rs-provider.js';
import { branchEditingLocked } from '../../shared/branch-conflicts/editing-lock.js';

const INSTANCE = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;

function verifiedInstance(response, branch) {
  if (!branch) return null;
  const instance = response.headers.get('x-da-branch-instance');
  if (response.headers.get('content-branch') !== branch
    || response.headers.get('x-da-source-mode') !== 'helix6' || !INSTANCE.test(instance || '')) {
    throw new Error('Unable to verify the Sheet branch.');
  }
  return instance;
}

// Capture the original document and validator; never resolve a delayed save from the current hash.
export async function createConditionalSheetSession({
  details, branch, response, source, href = window.location.href, getApi = getNx2Api,
}) {
  const current = () => window.location.href === href;
  const assertCurrent = () => { if (!current()) throw new Error('The Sheet context changed. Copy your edits.'); };
  const missing = response.status === 404;
  if (!response.ok && !missing) throw new Error(`Unable to load Sheet (${response.status}).`);
  let instance;
  let { permissions } = response;
  if (missing) {
    const root = await source.getMetadata({ org: details.org, site: details.site, path: '/' });
    assertCurrent();
    if (!root.ok) throw new Error('Unable to verify the Sheet site.');
    instance = verifiedInstance(root, branch);
    permissions = root.permissions;
  } else {
    instance = verifiedInstance(response, branch);
  }
  let validator = missing ? null : response.headers.get('etag');
  if (!missing && !isStrongSourceETag(validator)) throw new Error('Unable to verify the Sheet version.');
  assertCurrent();
  let isNew = missing;
  let blocked = false;
  return {
    permissions,
    async save(body) {
      assertCurrent();
      if (blocked || branchEditingLocked()) throw new Error('The Sheet is locked. Copy your edits before reloading.');
      const { source: currentSource } = await getApi();
      assertCurrent();
      const options = { body, ...(isNew ? { ifNoneMatch: '*' } : { ifMatch: validator }) };
      if (branch) options.branchInstance = instance;
      const target = { org: details.org, site: details.site, path: details.path };
      const result = await currentSource.replace(target, options);
      assertCurrent();
      if (!result.ok) {
        if ([404, 409, 410, 412].includes(result.status)) blocked = true;
        throw new Error(`Sheet save failed (${result.status}). Copy your edits before reloading.`);
      }
      const next = result.headers.get('etag');
      let sameBranch = true;
      try {
        if (branch) sameBranch = verifiedInstance(result, branch) === instance;
      } catch {
        sameBranch = false;
      }
      if (!isStrongSourceETag(next) || !sameBranch) {
        blocked = true;
        throw new Error('The Sheet save could not be verified. Copy your edits before reloading.');
      }
      validator = next;
      isNew = false;
      return result;
    },
  };
}
