import { Y } from 'da-y-wrapper';
import { aem2doc, getSchema, yDocToProsemirror } from 'da-parser';

// Template contents are inert: replace resource URLs before aem2doc's DOMParser
// ever sees them. The original attributes are restored only in the PM document.
export function parseDaRsVersion(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  if (template.content.querySelector('script, style, iframe, object, embed, link, base, meta, video, audio')) {
    throw new Error('Unsupported content in version');
  }
  const originals = new Map();
  const nonce = Array.from(
    crypto.getRandomValues(new Uint8Array(16)),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
  template.content.querySelectorAll('*').forEach((el) => {
    const style = el.getAttribute('style');
    if (style && /url|image|var\s*\(|attr\s*\(|https?:|@|\\|\/\//i.test(style)) {
      throw new Error('Unsupported resource style in version');
    }
    const attributes = ['src', 'srcset', 'poster', 'background', 'xlink:href'];
    if (el.localName !== 'a') attributes.push('href');
    attributes.forEach((name) => {
      if (!el.hasAttribute(name)) return;
      const marker = `data:application/x-da-rs-placeholder,${nonce}-${originals.size}-end`;
      originals.set(marker, el.getAttribute(name));
      el.setAttribute(name, marker);
    });
  });

  const restore = (value) => {
    if (typeof value === 'string') {
      let result = value;
      originals.forEach((original, marker) => { result = result.replaceAll(marker, original); });
      return result;
    }
    if (Array.isArray(value)) return value.map(restore);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, restore(item)]));
    }
    return value;
  };

  const ydoc = new Y.Doc();
  try {
    aem2doc(template.innerHTML, ydoc);
    const schema = getSchema();
    const doc = yDocToProsemirror(schema, ydoc);
    return schema.nodeFromJSON(restore(doc.toJSON()));
  } finally {
    ydoc.destroy();
  }
}
