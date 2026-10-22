import { Y } from 'da-y-wrapper';
import { aem2doc, getSchema, yDocToProsemirror } from 'da-parser';
import { fetchDoc } from './source.js';
import { sessionErrorFromResponse } from './load-editor-doc.js';

export async function loadLocalDocument(sourceUrl) {
  const resp = await fetchDoc(sourceUrl);
  const failure = sessionErrorFromResponse(resp);
  if (failure) throw new Error(failure.notFound ? 'The document no longer exists.' : failure.error);
  const body = await resp.text();
  const ydoc = new Y.Doc();
  try {
    aem2doc(body, ydoc);
    return {
      initialDoc: yDocToProsemirror(getSchema(), ydoc),
      initialMetadata: Object.fromEntries(ydoc.getMap('daMetadata').entries()),
      docId: resp.headers?.get('x-da-id') ?? null,
      permissions: resp.permissions,
    };
  } finally {
    ydoc.destroy();
  }
}
