import { htmlDiff } from '../version/htmldiff.js';

const HTML_NS = 'http://www.w3.org/1999/xhtml';
const CONTENT = new Set(('a blockquote br caption code col colgroup dd del div dl dt em figcaption '
  + 'figure h1 h2 h3 h4 h5 h6 hr ins li ol p pre s span strong sub sup table tbody td th '
  + 'thead tfoot tr ul b i u').split(' '));
const DROP = new Set('base button embed form iframe input link meta noscript object script style template textarea'.split(' '));
const DIFF_CLASSES = new Set(['diffins', 'diffdel', 'diffmod']);
const MAX_SOURCE_LENGTH = 48_000;
const MAX_BOUNDARIES = 2_000;

function parseInert(markup) {
  const template = document.createElement('template');
  template.innerHTML = markup;
  return template;
}

function safeElement(node, keepDiff) {
  const { localName: tag } = node;
  const copy = document.createElement(tag === 'a' ? 'span' : tag);
  for (const name of ['colspan', 'rowspan', 'start']) {
    const value = node.getAttribute(name);
    if (value && /^[1-9]\d{0,3}$/.test(value)) copy.setAttribute(name, value);
  }
  if (keepDiff && (tag === 'ins' || tag === 'del')) {
    const classes = [...node.classList].filter((name) => DIFF_CLASSES.has(name));
    if (classes.length) copy.classList.add(...classes);
  }
  return copy;
}

function imagePlaceholder(node) {
  const label = node.getAttribute('alt') || 'Image';
  const src = node.getAttribute('src');
  const placeholder = document.createElement('span');
  placeholder.textContent = `[${label.slice(0, 100)}${src ? ` · ${src.slice(0, 160)}` : ''}]`;
  return placeholder;
}

// Rebuild the content instead of attaching anything from the parsed document.
// No event handlers, style, form controls, active URLs, or embedded resources are copied.
function copySafeChildren(source, target, keepDiff, depth = 0) {
  if (depth > 80) return;
  source.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      target.append(node.textContent);
      return;
    }
    const { localName: tag } = node;
    if (node.nodeType !== Node.ELEMENT_NODE || node.namespaceURI !== HTML_NS) return;
    if (DROP.has(tag)) return;
    if (tag === 'img' && !keepDiff) {
      target.append(imagePlaceholder(node));
      return;
    }
    const childTarget = CONTENT.has(tag) ? safeElement(node, keepDiff) : target;
    copySafeChildren(node, childTarget, keepDiff, depth + 1);
    if (childTarget !== target) target.append(childTarget);
  });
}

function printable(value) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function compareMarkup(text, kind) {
  if (!text) return '';
  if (kind !== 'html') {
    const pre = document.createElement('pre');
    pre.textContent = printable(text);
    return pre.outerHTML;
  }
  const { content } = parseInert(text);
  const clean = document.createElement('template');
  copySafeChildren(content.querySelector('main') || content, clean.content, false);
  return clean.innerHTML;
}

export function buildRevisionDiff(before, after, kind) {
  const oldText = before.state === 'present' ? before.text ?? '' : '';
  const newText = after.state === 'present' ? after.text ?? '' : '';
  const tooLarge = { message: 'This comparison is too large to highlight. Use Source to review it.' };
  if (oldText.length + newText.length > MAX_SOURCE_LENGTH) return tooLarge;

  const oldMarkup = compareMarkup(oldText, kind);
  const newMarkup = compareMarkup(newText, kind);
  if (((oldMarkup + newMarkup).match(/<|\s+/g) || []).length > MAX_BOUNDARIES) return tooLarge;

  const { content } = parseInert(htmlDiff(oldMarkup, newMarkup));
  const dom = document.createElement('div');
  dom.className = 'diff-body';
  copySafeChildren(content, dom, true);
  if (!dom.querySelector('ins.diffins, ins.diffmod, del.diffdel, del.diffmod')) {
    return { dom, message: oldText !== newText ? 'No visual differences. Use Source to review markup changes.' : 'No visible changes in this comparison.' };
  }
  return { dom };
}
