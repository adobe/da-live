import { getNx2Api } from '../../../scripts/utils.js';
import { refuseOversizedImage } from '../utils/image-upload.js';
import { getBlockPositions, getTableBlockName } from '../editor-utils/blocks.js';

function closestBlock(view) {
  const { doc, selection } = view.state;
  const positions = getBlockPositions(view);
  if (!positions.length) return null;
  const cursor = selection.from;
  const pos = positions.reduce((nearest, candidate) => {
    const distance = (start) => {
      const end = start + doc.nodeAt(start).nodeSize;
      return Math.max(start - cursor, cursor - end, 0);
    };
    return distance(candidate) < distance(nearest) ? candidate : nearest;
  });
  return { pos, node: doc.nodeAt(pos) };
}

export function getBlockProperties(view) {
  if (!view?.state?.doc) return { block: null, items: [], canWrite: false };
  const block = closestBlock(view);
  if (!block) return { block: null, items: [], canWrite: view.editable };
  const { pos, node } = block;
  const headerEnd = pos + 1 + (node.firstChild?.nodeSize || 0);
  const items = [];
  node.descendants((child, offset) => {
    const absolute = pos + 1 + offset;
    if (absolute < headerEnd) return true;
    if (child.isText) {
      items.push({ kind: 'text', pos: absolute, text: child.text });
    } else if (child.type.name === 'image') {
      items.push({ kind: 'image', pos: absolute, src: child.attrs.src, alt: child.attrs.alt || '' });
    }
    return true;
  });
  return {
    block: { pos, name: getTableBlockName(node) },
    items,
    canWrite: view.editable,
  };
}

function targetNode(view, item, kind) {
  const { block } = getBlockProperties(view);
  const node = view.state.doc.nodeAt(item?.pos);
  const blockEnd = block && block.pos + view.state.doc.nodeAt(block.pos).nodeSize;
  if (!block || item?.pos <= block.pos || item.pos >= blockEnd
    || (kind === 'text' ? !node?.isText || node.text !== item.text
      : node?.type.name !== 'image' || node.attrs.src !== item.src)) {
    throw new Error('This block changed. Select the item again.');
  }
  return node;
}

export function replaceBlockText(view, item, text) {
  if (!view?.editable) throw new Error('This page is read-only.');
  if (typeof text !== 'string') throw new Error('Invalid replacement text.');
  const node = targetNode(view, item, 'text');
  const replacement = text ? view.state.schema.text(text, node.marks) : [];
  view.dispatch(view.state.tr.replaceWith(item.pos, item.pos + node.nodeSize, replacement));
}

export async function replaceBlockImage(view, item, file, { org, site, path }) {
  if (!view?.editable) throw new Error('This page is read-only.');
  if (!(file instanceof File) || !file.type.startsWith('image/') || !file.name) {
    throw new Error('Choose an image file.');
  }
  targetNode(view, item, 'image');
  if (await refuseOversizedImage(file.size, `/${org}/${site}`)) {
    throw new Error('Image is too large.');
  }
  const page = path || 'index';
  const parent = page.includes('/') ? page.slice(0, page.lastIndexOf('/')) : '';
  const uploadPath = `/${org}/${site}${parent ? `/${parent}` : ''}/.${page.split('/').pop()}/${file.name}`;
  const { source } = await getNx2Api();
  const response = await source.uploadMedia(uploadPath, { body: file });
  if (!response.ok) throw new Error(`Image upload failed (HTTP ${response.status}).`);
  const { source: { contentUrl } = {} } = await response.json();
  if (!contentUrl) throw new Error('Image upload returned no URL.');
  const node = targetNode(view, item, 'image');
  view.dispatch(view.state.tr.setNodeMarkup(item.pos, null, { ...node.attrs, src: contentUrl }));
}
