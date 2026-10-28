export async function buildAttachmentItems(files, { currentCount = 0 } = {}) {
  return Promise.all(files.slice(0, Math.max(0, 20 - currentCount)).map(async (file) => ({
    id: crypto.randomUUID(),
    label: file.name,
    fileName: file.name,
    mediaType: file.type,
    dataBase64: btoa(await file.text()),
  })));
}
