import { Fragment, Y } from 'da-y-wrapper';
import { aem2doc, doc2aem, prosemirrorToYXmlFragment } from 'da-parser';
import DaMerge from '../../../deps/da-merge/dist/index.js';
import {
  addToHashMetadata,
  stripDaDiffAddedAttrs,
  ACCEPTED_KEY,
  REJECTED_KEY,
} from '../../edit/prose/diff/diff-actions.js';

export const CHOICE = Object.freeze({ mine: 'mine', source: 'source', both: 'both' });

const SIDE_OF_TYPE = { diff_deleted: 'source', diff_added: 'local' };
const isMarker = (node) => !!SIDE_OF_TYPE[node.type.name];
const isBase = (node) => node.type.name === 'diff_base';

let engine;
function getEngine() {
  engine ??= new DaMerge({
    DOMParser,
    Node,
    document,
    canonicalize: (html) => {
      const ydoc = new Y.Doc();
      aem2doc(html, ydoc);
      return doc2aem(ydoc);
    },
  });
  return engine;
}

export function docToPageHtml(doc) {
  const ydoc = new Y.Doc();
  prosemirrorToYXmlFragment(doc, ydoc.getXmlFragment('prosemirror'));
  return doc2aem(ydoc);
}

export function hasGroupedMarkup(doc) {
  let found = false;
  doc.descendants((node) => {
    if (found) return false;
    if (isMarker(node) && node.attrs.diffGroup) found = true;
    return !found;
  });
  return found;
}

export function getReviewSummary(doc) {
  return getEngine().diffSummary(docToPageHtml(doc));
}

export function findGroup(doc, id) {
  const markers = [];
  const bases = [];
  doc.descendants((node, pos) => {
    if (isMarker(node) && node.attrs.diffGroup === id) {
      markers.push({ node, pos, side: SIDE_OF_TYPE[node.type.name] });
      return false;
    }
    if (isBase(node) && node.attrs.diffGroup === id) {
      bases.push({ node, pos });
      return false;
    }
    return true;
  });
  return { markers, bases };
}

function findAll(doc) {
  const markers = [];
  const bases = [];
  doc.descendants((node, pos) => {
    if (isMarker(node)) {
      markers.push({ node, pos, side: SIDE_OF_TYPE[node.type.name] });
      return false;
    }
    if (isBase(node)) {
      bases.push({ node, pos });
      return false;
    }
    return true;
  });
  return { markers, bases };
}

function keeps(choice, side) {
  if (choice === CHOICE.both) return true;
  return (choice === CHOICE.mine) === (side === 'local');
}

function unwrap(tr, node, pos) {
  const children = [];
  node.content.forEach((child) => children.push(child));
  const content = Fragment.fromArray(stripDaDiffAddedAttrs(children));
  return tr.replaceWith(pos, pos + node.nodeSize, content);
}

function remove(tr, node, pos) {
  const $pos = tr.doc.resolve(pos);
  if ($pos.parent.type.name === 'list_item' && $pos.parent.childCount === 1) {
    return tr.delete($pos.before(), $pos.after());
  }
  return tr.delete(pos, pos + node.nodeSize);
}

function recordHashes(node, key) {
  const units = [];
  node.content.forEach((child) => units.push(child));
  if (units.some((unit) => unit.type.name === 'list_item')) {
    addToHashMetadata(node, key);
    return;
  }
  units.forEach((unit) => addToHashMetadata(node.type.create(node.attrs, unit), key));
}

function applyChoice(view, { markers, bases }, choice) {
  if (!markers.length && !bases.length) return false;
  const steps = [
    ...markers.map((entry) => ({ ...entry, keep: keeps(choice, entry.side) })),
    ...bases.map((entry) => ({ ...entry, keep: false, base: true })),
  ].sort((a, b) => b.pos - a.pos);

  let { tr } = view.state;
  steps.forEach(({ node, pos, keep, base }) => {
    if (!base) recordHashes(node, keep ? ACCEPTED_KEY : REJECTED_KEY);
    const mapped = tr.mapping.map(pos);
    tr = keep ? unwrap(tr, node, mapped) : remove(tr, node, mapped);
  });
  view.dispatch(tr);
  return true;
}

export function resolveGroup(view, id, choice) {
  return applyChoice(view, findGroup(view.state.doc, id), choice);
}

export function resolveAll(view, choice) {
  return applyChoice(view, findAll(view.state.doc), choice);
}
