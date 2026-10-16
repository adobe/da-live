import { getNx } from '../../../scripts/utils.js';
import { fileNameOf } from './resolve.js';

const { CHAT_EVENT } = await import(`${getNx()}/utils/chat.js`);
const { PANEL_EVENT } = await import(`${getNx()}/utils/panel.js`);

const PILL_KEY = 'eval-finding';

// The first line of an "action message" is its title; chat-ao shows only that and keeps the rest
// collapsed (da-nx `chat-ao/utils/action-message.js`). Older da-nx builds show all of it.
export const DETAILS_MARKER = '<!--nx:details-->';
const SKILL_TOKEN = '/aem-governance-element-suggestions';
// Longer current texts are cut here; the skill then reads the full element from the source.
export const MAX_CURRENT_TEXT = 1500;

function detailLines({ finding, label, evidence }) {
  const lines = [];
  const add = (prefix, value) => { if (value) lines.push(`${prefix}${value}`); };
  add('Check: ', finding?.title);
  add('Element: ', label);
  if (evidence?.anchorType === 'image') {
    add('Image: ', fileNameOf(evidence.src));
  } else if (evidence?.anchorType === 'text') {
    if (evidence.anchorText) {
      // A highlight-only anchor is just the start of the element's text.
      lines.push(`${evidence.highlightOnly ? 'Text starts with' : 'Current text'}: "${evidence.anchorText}"`);
    }
    if (evidence.replacement && !evidence.highlightOnly) lines.push(`Change it to: "${evidence.replacement}"`);
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

const quote = (text) => `"${String(text).replace(/\s+/g, ' ').trim()}"`;
const isNone = (text) => !text || /^n\/?a$/i.test(String(text).trim());
const oneLine = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

/** "<short element name> failure: Generate suggestion", the only part the chat bubble shows. */
export function buildSuggestTitle({ group, snapshot }) {
  const name = oneLine(group?.name) || oneLine(group?.label).replace(/\s*:\s*[“"].*$/, '')
    || snapshot?.kindLabel || 'Element';
  return `${name} failure: Generate suggestion`;
}

function elementLine({ group, snapshot }) {
  const label = oneLine(group?.label).replace(/\s*:\s*[“"].*$/, '');
  const named = /\s[—–]\s/.test(label) || !label ? label : `${label} — ${snapshot.kindLabel}`;
  return `Element: ${named || snapshot.kindLabel} (${snapshot.anchorType})`;
}

function locateLines({ resolved }) {
  const { evidence, snapshot } = resolved;
  const occurrence = evidence?.occurrence ?? 1;
  if (snapshot.anchorType === 'image') {
    return [
      `Locate: image ${snapshot.fileName}, occurrence ${occurrence}`,
      `Current alt: ${quote(snapshot.alt)} · Image file: ${snapshot.fileName}`,
    ];
  }
  const lines = [];
  if (evidence?.anchorText) lines.push(`Locate: text ${quote(evidence.anchorText)}, occurrence ${occurrence}`);
  const { text } = snapshot;
  const current = text.length > MAX_CURRENT_TEXT
    ? `${text.slice(0, MAX_CURRENT_TEXT)} … (truncated, read the source)`
    : text;
  lines.push(`Current text: "${current}"`);
  return lines;
}

function formattingLine(snapshot) {
  const marks = snapshot.formatting.length
    ? snapshot.formatting.map((f) => (f.whole ? `${f.mark} (whole text)` : `${f.mark} (${quote(f.text)})`))
      .join(', ')
    : 'none';
  const links = snapshot.links.length
    ? snapshot.links.map((l) => `${l.text} → ${l.href}`).join('; ')
    : 'none';
  return `Formatting: ${marks} · Links: ${links} · Words: ${snapshot.words}`;
}

function nearbyLine({ prev, next }) {
  const parts = [prev && `previous ${prev}`, next && `next ${next}`].filter(Boolean);
  return parts.length ? `Nearby (context only, do not change): ${parts.join(' · ')}` : '';
}

function checkLine(finding, index) {
  const exact = (finding.evidence ?? []).find((e) => e?.replacement && !e.highlightOnly);
  const hint = [exact?.replacement, finding.suggested].find((h) => !isNone(h));
  const explanation = oneLine(finding.issue ?? finding.description);
  const stop = /[.!?]$/.test(explanation) ? '' : '.';
  const why = explanation ? ` — ${explanation}${stop}` : '';
  return `${index + 1}. ${finding.title}${why}${hint ? ` Hint: ${quote(hint)}` : ''}`;
}

function constraintsLine(snapshot) {
  const { kindLabel, words } = snapshot;
  if (snapshot.anchorType === 'image') {
    return 'Constraints: alt text ≤ 125 chars; keep names, prices, numbers and links.';
  }
  const min = Math.max(1, Math.floor(words * 0.7));
  const max = Math.ceil(words * 1.3) + (words <= 4 ? 1 : 0);
  const shape = {
    Button: 'keep one Button, 1–4 words',
    'List item': 'keep one list item',
    'Code block': 'keep it a code block',
    Paragraph: `keep one paragraph, ${min}–${max} words`,
  }[kindLabel] ?? `keep one ${kindLabel}, ${min}–${max} words`;
  return `Constraints: ${shape}; same language; keep names, prices, numbers and links.`;
}

/**
 * The "Generate suggestion" request: title, marker, then the body in the format of the
 * aem-governance-element-suggestions skill. `resolved` is `resolveGroup`'s result.
 */
export function buildSuggestText({ group, resolved, page, evaluatedUrl }) {
  const { snapshot, findings } = resolved;
  const body = [
    SKILL_TOKEN,
    ...(page ? [`Page: ${page}`] : []),
    ...(evaluatedUrl ? [`Evaluated URL: ${evaluatedUrl}`] : []),
    elementLine({ group, snapshot }),
    ...locateLines({ resolved }),
    formattingLine(snapshot),
    nearbyLine(snapshot.neighbours),
    `Failing checks (${findings.length}):`,
    ...findings.map(checkLine),
    constraintsLine(snapshot),
    'Give 3 options, each fixing ALL failing checks.',
  ].filter(Boolean);
  return [buildSuggestTitle({ group, snapshot }), DETAILS_MARKER, ...body].join('\n');
}

export function requestSuggestions(args) {
  const text = buildSuggestText(args);
  const detail = { section: 'chat', options: { text, autoSend: true } };
  document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, { detail }));
  return text;
}
