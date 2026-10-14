import { getNx } from '../../../scripts/utils.js';
import { fileNameOf } from './resolve.js';

const { CHAT_EVENT } = await import(`${getNx()}/utils/chat.js`);
const { PANEL_EVENT } = await import(`${getNx()}/utils/panel.js`);

const PILL_KEY = 'eval-finding';

function detailLines({ finding, label, evidence }) {
  const lines = [];
  const add = (prefix, value) => { if (value) lines.push(`${prefix}${value}`); };
  add('Check: ', finding?.title);
  add('Element: ', label);
  if (evidence?.anchorType === 'image') {
    add('Image: ', fileNameOf(evidence.src));
  } else if (evidence?.anchorType === 'text') {
    if (evidence.anchorText) lines.push(`Current text: "${evidence.anchorText}"`);
    if (evidence.replacement) lines.push(`Change it to: "${evidence.replacement}"`);
  }
  add('Suggested change: ', finding?.suggested);
  add('Reason: ', finding?.issue);
  return lines;
}

/** The instruction sent to the chat agent by "Apply change". */
export function buildApplyText({ finding, label, evidence, page }) {
  const where = page ? ` (${page})` : '';
  return [
    `Apply this brand governance fix to the page I have open${where}.`,
    ...detailLines({ finding, label, evidence }),
    'Only change this element; leave the rest of the page unchanged.',
  ].join('\n');
}

/** The Apply instruction without its first and last line: the "Add to chat" pill description. */
export function buildPillDescription(args) {
  return detailLines(args).join('\n');
}

export function buildPillItem(args) {
  return {
    key: PILL_KEY,
    id: `eval-${args.finding.id}`,
    type: 'evaluation-finding',
    name: args.finding.title,
    description: buildPillDescription(args),
  };
}

export function applyFinding(args) {
  const text = buildApplyText(args);
  const detail = { section: 'chat', options: { text, autoSend: true } };
  document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, { detail }));
  return text;
}

export function addFindingToChat(args) {
  document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, { detail: { section: 'chat' } }));
  const item = buildPillItem(args);
  document.dispatchEvent(new CustomEvent(CHAT_EVENT.ADD_TO_CHAT, { detail: item }));
  return item;
}
