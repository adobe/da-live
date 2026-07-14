import { DOMSerializer, Y } from 'da-y-wrapper';
import { aem2doc, getSchema, yDocToProsemirror } from 'da-parser';
import { formatDate } from '../utils.js';
import { getNx2Api } from '../../../scripts/utils.js';
import { formatVersions } from './helpers.js';
import { wrapTablesInWrappers } from './compare.js';

// Fetch and format the version list for a document path.
// Returns the formatted array on success, null on network/auth failure.
export async function fetchVersions(path) {
  try {
    const { versions } = await getNx2Api();
    const resp = await versions.list(path);
    if (!resp.ok) return null;
    return formatVersions(await resp.json());
  } catch {
    return null;
  }
}

export function newVersionEntry() {
  const { date, time } = formatDate();
  return { date, time, isVersion: true, users: [] };
}

// POST a new version to the server. Returns true on success (201).
export async function createVersion(path, label) {
  try {
    const { versions } = await getNx2Api();
    const res = await versions.create(path, label ? { comment: label } : {});
    return res.status === 201;
  } catch {
    return false;
  }
}

// Compute the versionId for a preview/restore dispatch from a list entry.
export function getVersionId(path, entry) {
  const [, org, site] = path.split('/');
  return entry.url
    ? entry.url.replace(`/versionsource/${org}/${site}/`, '')
    : entry.versionId;
}

// Fetch a version's HTML and parse it through the same schema-driven pipeline
// the live doc went through (aem2doc -> ProseMirror -> DOMSerializer), so the
// result is in the editor's authoring shape rather than raw stored/rendered
// markup — matching what docToHtml(view) produces for the current document.
// (Mirrors da-editor.js's fetchVersion/htmlToProse for the classic editor.)
// todo: extract to shared logic
export async function fetchVersionHtml(path, entry) {
  try {
    const { versions } = await getNx2Api();
    const versionId = getVersionId(path, entry);
    const resp = await versions.get(path, { versionId });
    if (!resp.ok) return null;
    const text = await resp.text();
    const ydoc = new Y.Doc();
    aem2doc(text, ydoc);
    const schema = getSchema();
    const pmDoc = yDocToProsemirror(schema, ydoc);
    const fragment = DOMSerializer.fromSchema(schema).serializeFragment(pmDoc.content);
    const dom = document.createElement('div');
    dom.append(fragment);
    wrapTablesInWrappers(dom);
    return dom;
  } catch {
    return null;
  }
}
