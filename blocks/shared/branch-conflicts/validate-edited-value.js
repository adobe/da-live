import { Y } from 'da-y-wrapper';
import { aem2doc, doc2aem, getSchema, isKnownHTMLTag, yDocToProsemirror } from 'da-parser';

const VOID = new Set(['br', 'hr', 'img', 'source']);
const RESOURCE = new Set(['src', 'srcset', 'href']);
const SAFE_ATTRIBUTE = /^(class|alt|title|colspan|rowspan|da-diff-added|data-[a-z0-9_-]+)$/;
const NAME = /^[a-z][a-z0-9-]*/i;
const ATTRIBUTE = /^[a-z_:][a-z0-9:_.-]*/i;
const whitespace = (char) => char !== undefined && /[ \t\r\n\f]/.test(char);

const invalidHtml = () => { throw new Error('Invalid editor HTML: use a complete, well-formed DA document with sections.'); };
const plainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const escapeAttribute = (value) => value.replaceAll('"', '&quot;');

// Rebuild a strictly tokenized document with resource URLs removed *before* any
// browser HTML parser sees it. DOMParser on an untrusted detached document can
// still load images or frames; this pass only accepts editor-supported tags.
function safeEditorHtml(source) {
  if (source.includes('\0')) invalidHtml();
  const root = { name: '#root', children: [] };
  const stack = [root];
  let output = '';
  let offset = 0;
  while (offset < source.length) {
    if (source[offset] !== '<') {
      const end = source.indexOf('<', offset);
      const text = source.slice(offset, end < 0 ? source.length : end);
      stack[stack.length - 1].children.push({ text });
      output += text;
      offset += text.length;
      // eslint-disable-next-line no-continue
      continue;
    }
    if (source.startsWith('<!--', offset)) {
      const end = source.indexOf('-->', offset + 4);
      if (end < 0) invalidHtml();
      const comment = source.slice(offset + 4, end);
      if (comment.startsWith('>') || comment.startsWith('->') || comment.endsWith('-')
        || comment.includes('--') || comment.includes('<!--')) invalidHtml();
      stack[stack.length - 1].children.push({ comment: true });
      output += '<!---->';
      offset = end + 3;
      // eslint-disable-next-line no-continue
      continue;
    }
    const doctype = source.slice(offset).match(/^<!doctype\s+html\s*>/i);
    if (doctype) {
      offset += doctype[0].length;
      // eslint-disable-next-line no-continue
      continue;
    }
    const closing = source[offset + 1] === '/';
    let cursor = offset + (closing ? 2 : 1);
    const match = source.slice(cursor).match(NAME);
    if (!match) invalidHtml();
    const name = match[0].toLowerCase();
    if (!isKnownHTMLTag(name) && !['html', 'head'].includes(name)) invalidHtml();
    cursor += match[0].length;
    const attrs = Object.create(null);
    let selfClosing = false;
    while (cursor < source.length) {
      const beforeSpace = cursor;
      while (whitespace(source[cursor])) cursor += 1;
      if (source[cursor] === '>') {
        cursor += 1;
        break;
      }
      if (source[cursor] === '/' && source[cursor + 1] === '>') {
        selfClosing = true;
        cursor += 2;
        break;
      }
      if (closing || cursor === beforeSpace) invalidHtml();
      const attrMatch = source.slice(cursor).match(ATTRIBUTE);
      if (!attrMatch) invalidHtml();
      const attr = attrMatch[0].toLowerCase();
      if (Object.hasOwn(attrs, attr)) invalidHtml();
      cursor += attrMatch[0].length;
      const attrEnd = cursor;
      while (whitespace(source[cursor])) cursor += 1;
      let value = '';
      if (source[cursor] === '=') {
        cursor += 1;
        while (whitespace(source[cursor])) cursor += 1;
        const quote = source[cursor];
        if (quote === '"' || quote === "'") {
          const end = source.indexOf(quote, cursor + 1);
          if (end < 0) invalidHtml();
          value = source.slice(cursor + 1, end);
          cursor = end + 1;
        } else {
          const unquoted = source.slice(cursor).match(/^[^ \t\r\n\f"'`=<>]+/);
          if (!unquoted) invalidHtml();
          [value] = unquoted;
          cursor += value.length;
        }
      } else cursor = attrEnd;
      attrs[attr] = value;
    }
    if (source[cursor - 1] !== '>' || (selfClosing && !VOID.has(name))) invalidHtml();
    if (closing) {
      if (VOID.has(name) || stack.length === 1
        || stack[stack.length - 1].name !== name) invalidHtml();
      stack.pop();
      output += `</${name}>`;
    } else {
      if (name === 'img' && !attrs.src?.trim()) invalidHtml();
      if (name === 'a' && attrs['data-edit-as'] === 'image' && !attrs.href?.trim()) invalidHtml();
      const node = { name, attrs, children: [] };
      stack[stack.length - 1].children.push(node);
      if (!VOID.has(name)) stack.push(node);
      const safeAttrs = Object.entries(attrs).flatMap(([attr, value]) => {
        if (RESOURCE.has(attr)) return [` ${attr}="about:blank"`];
        if (SAFE_ATTRIBUTE.test(attr)) return [` ${attr}="${escapeAttribute(value)}"`];
        return [];
      }).join('');
      output += `<${name}${safeAttrs}>`;
    }
    offset = cursor;
  }
  if (stack.length !== 1) invalidHtml();
  const elements = (node) => node.children.filter((child) => child.name);
  const noText = (node) => node.children.every((child) => child.name
    || child.comment || !child.text.trim());
  const noComments = (node) => node.children.every((child) => !child.comment
    && (!child.children || noComments(child)));
  let top = elements(root);
  if (!noText(root) || top.length !== 1) invalidHtml();
  if (top[0].name === 'html') {
    if (!noText(top[0])) invalidHtml();
    top = elements(top[0]);
    if (top.filter((node) => node.name === 'head').length > 1) invalidHtml();
    const head = top.find((node) => node.name === 'head');
    if (head && (elements(head).length || !noText(head))) invalidHtml();
    top = top.filter((node) => node.name !== 'head');
  }
  if (top.length !== 1) invalidHtml();
  let body;
  if (top[0].name === 'main') body = top;
  else {
    if (top[0].name !== 'body' || !noText(top[0])) invalidHtml();
    body = elements(top[0]);
  }
  const mains = body.filter((node) => node.name === 'main');
  if (mains.length !== 1 || body.some((node) => !['header', 'main', 'footer', 'div'].includes(node.name))) invalidHtml();
  if (body.some((node) => ['header', 'footer'].includes(node.name)
    && (elements(node).length || !noText(node)))) invalidHtml();
  if (['header', 'footer', 'div'].some((name) => body.filter((node) => node.name === name).length > 1)) invalidHtml();
  if (body.some((node) => node.name === 'div' && !node.attrs.class?.split(/\s+/).includes('da-metadata'))) invalidHtml();
  const metadata = body.find((node) => node.name === 'div');
  if (metadata && (!noText(metadata) || !noComments(metadata)
    || elements(metadata).some((row) => row.name !== 'div'
    || !noText(row) || elements(row).length !== 2 || elements(row).some((cell) => cell.name !== 'div'
      || elements(cell).length)))) invalidHtml();
  const main = mains[0];
  if (!noText(main) || !elements(main).length || elements(main).some((node) => node.name !== 'div')) invalidHtml();
  elements(main).forEach((section) => {
    elements(section).filter((node) => node.name === 'div' && node.attrs.class?.trim()).forEach((block) => {
      if (!noText(block) || !elements(block).length || elements(block).some((row) => row.name !== 'div'
        || !noText(row) || !elements(row).length || elements(row).some((cell) => cell.name !== 'div'))) invalidHtml();
    });
  });
  return output;
}

function validateHtml(source) {
  const safe = safeEditorHtml(source);
  const first = new Y.Doc();
  const second = new Y.Doc();
  try {
    const schema = getSchema();
    aem2doc(safe, first);
    const initial = yDocToProsemirror(schema, first);
    initial.check();
    // aem2doc intentionally ignores markup it cannot import. Reject lost text
    // rather than silently accepting a document that reopens without content.
    const parsed = new DOMParser().parseFromString(safe, 'text/html');
    const walker = document.createTreeWalker(parsed.querySelector('main'), NodeFilter.SHOW_TEXT);
    const text = initial.textContent.replace(/\s+/g, '');
    let position = 0;
    while (walker.nextNode()) {
      const value = walker.currentNode.textContent.replace(/\s+/g, '');
      if (value) {
        const index = text.indexOf(value, position);
        if (index < 0) throw new Error('Some source text cannot be reopened in the editor.');
        position = index + value.length;
      }
    }
    // doc2aem may interpolate metadata into HTML. Sanitize its result as well;
    // decoded metadata text must never become a resource-loading element.
    aem2doc(safeEditorHtml(doc2aem(first)), second);
    const reopened = yDocToProsemirror(schema, second);
    reopened.check();
    if (!initial.eq(reopened)) throw new Error('Editor content changes when reopened.');
    if (JSON.stringify([...first.getMap('daMetadata').entries()].sort())
      !== JSON.stringify([...second.getMap('daMetadata').entries()].sort())) {
      throw new Error('Document metadata changes when reopened.');
    }
  } catch (error) {
    throw new Error(`Invalid editor HTML: ${error.message}`);
  } finally {
    first.destroy();
    second.destroy();
  }
}

function sheetIsValid(sheet) {
  if (!plainObject(sheet) || !Array.isArray(sheet.data)) return false;
  if (sheet[':colWidths'] !== undefined && (!Array.isArray(sheet[':colWidths'])
    || sheet[':colWidths'].some((width) => !['number', 'string'].includes(typeof width)))) return false;
  const headers = sheet.data.length && plainObject(sheet.data[0]) ? Object.keys(sheet.data[0]) : [];
  return sheet.data.every((row) => plainObject(row)
    && JSON.stringify(Object.keys(row)) === JSON.stringify(headers)
    && Object.values(row).every((value) => value === null || ['string', 'number', 'boolean'].includes(typeof value)));
}

function validateJson(source) {
  let json;
  try {
    json = JSON.parse(source);
  } catch {
    throw new Error('Invalid JSON syntax.');
  }
  if (!plainObject(json)) throw new Error('Invalid sheet or config: expected an object.');
  let count = 0;
  if (json[':type'] === 'sheet') {
    if (!sheetIsValid(json)) throw new Error('Invalid sheet data.');
    count += 1;
  } else if (json[':type'] !== undefined && json[':type'] !== 'multi-sheet') {
    throw new Error('Invalid sheet type.');
  }
  if (json[':names'] !== undefined) {
    if (!Array.isArray(json[':names']) || json[':names'].some((name) => typeof name !== 'string'
      || !name || !Object.hasOwn(json, name) || !sheetIsValid(json[name]))
      || new Set(json[':names']).size !== json[':names'].length
      || json[':type'] === 'sheet') throw new Error('Invalid multi-sheet data.');
    count += json[':names'].length;
  }
  if (json[':private'] !== undefined) {
    if (!plainObject(json[':private']) || Object.values(json[':private']).some((sheet) => !sheetIsValid(sheet))) {
      throw new Error('Invalid private sheet data.');
    }
    count += Object.keys(json[':private']).length;
  }
  if (!count) throw new Error('Invalid sheet or config: no editable sheets.');
}

export function validateEditedValue(kind, source) {
  if (typeof source !== 'string') throw new Error('Enter edited source text.');
  if (kind === 'html') validateHtml(source);
  else if (kind === 'json' || kind === 'config') validateJson(source);
  else throw new Error('This item cannot be edited as text.');
}
