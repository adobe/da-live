export const AEM_ORIGIN = 'https://admin.hlx.page';
export const DA_ORIGIN = 'https://admin.da.live';
export const DA_LIVE = 'https://da.live';
export const MHAST_LIVE = 'https://mhast-html-to-json.adobeaem.workers.dev';

/**
 * Sanitizes a string for use as class name.
 * @param {string} name The unsanitized string
 * @returns {string} The class name
 */
export function toClassName(name) {
  return typeof name === 'string'
    ? name
      .toLowerCase()
      .replace(/[^0-9a-z]/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
    : '';
}

export const REF_MARKER = '#URL//';

/**
 * Extracts the ref from a string.
 * @param {string} value - The string to extract the ref from
 * @returns {string} The ref or self if no ref is found
 */
export function fromRef(value) {
  if (value.startsWith(REF_MARKER)) {
    return value.substring(REF_MARKER.length);
  }
  return value;
}

export function toRef(value) {
  return `${REF_MARKER}${value}`;
}

export function isRef(value) {
  return typeof value === 'string' && value.startsWith(REF_MARKER);
}

/**
 * Extracts the config from a block.
 * @param {Element} block The block element
 * @returns {object} The block config
 */
// eslint-disable-next-line import/prefer-default-export
export function readBlockConfig(block) {
  const config = {};
  block.querySelectorAll(':scope > div').forEach((row) => {
    if (row.children) {
      const cols = [...row.children];
      if (cols[1]) {
        const col = cols[1];
        const name = toClassName(cols[0].textContent);
        let value = '';
        if (col.querySelector('a')) {
          const as = [...col.querySelectorAll('a')];
          if (as.length === 1) {
            value = as[0].href;
          } else {
            value = as.map((a) => a.href);
          }
        } else if (col.querySelector('img')) {
          const imgs = [...col.querySelectorAll('img')];
          if (imgs.length === 1) {
            value = imgs[0].src;
          } else {
            value = imgs.map((img) => img.src);
          }
        } else if (col.querySelector('p')) {
          const ps = [...col.querySelectorAll('p')];
          if (ps.length === 1) {
            value = ps[0].textContent;
          } else {
            value = ps.map((p) => p.textContent);
          }
        } else value = row.children[1].textContent;
        config[name] = value;
      }
    }
  });
  return config;
}
