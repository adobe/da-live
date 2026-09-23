const versions = new WeakMap();
const sessionId = crypto.randomUUID();
let nextVersion = 0;

export function getImageDocumentVersion(doc) {
  let version = versions.get(doc);
  if (!version) {
    nextVersion += 1;
    version = `${sessionId}:${nextVersion}`;
    versions.set(doc, version);
  }
  return version;
}
