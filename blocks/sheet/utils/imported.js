export const IMPORTED_PROFILE = 'aem-import';
export const MAX_IMPORTED_COLUMNS = 1000;
export const MAX_IMPORTED_ROWS = 10000;

export class ImportedSheetError extends Error {}

const fail = (message) => { throw new ImportedSheetError(message); };
const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const FRAGMENT_METADATA = ['_path', '_model', '_title', '_variations'];

// da-rs currently identifies content-fragment sheets by their reserved column signature.
function isFragmentSheet(columns) {
  return FRAGMENT_METADATA.every((name, index) => columns[index] === name)
    && columns.slice(FRAGMENT_METADATA.length).every((name) => name.startsWith('field:') || name.startsWith('_'));
}

export function validateImportedResponse(resp) {
  if (!resp?.ok) {
    if (resp?.status === 401) fail('Sign in required');
    if (resp?.status === 403) fail('You do not have permission to view this sheet.');
    fail(`Unable to open imported sheet (${resp?.status ?? 'no response'}).`);
  }
  const header = (name) => resp.headers?.get(name)?.trim();
  if (header('x-da-content-profile') !== IMPORTED_PROFILE
    || header('x-da-source-kind') !== 'sheet'
    || header('x-da-source-collaboration') !== 'false') {
    fail('This content is not an imported read-only sheet.');
  }
  if (!/^application\/json\s*(;|$)/i.test(header('content-type') ?? '')) {
    fail('Imported sheet has an unsupported content type.');
  }
}

function toCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

// Explicit x-da-columns drives headers and row mapping; object key order is never trusted.
export function parseImportedEnvelope(json) {
  if (!isPlainObject(json) || json[':type'] !== 'sheet' || hasOwn(json, ':names') || hasOwn(json, ':private')) {
    fail('Imported sheet has an unsupported format.');
  }
  const sourceColumns = json['x-da-columns'];
  if (!Array.isArray(sourceColumns) || sourceColumns.length > MAX_IMPORTED_COLUMNS
    || sourceColumns.some((col) => typeof col !== 'string')) {
    fail('Imported sheet has invalid columns.');
  }
  const { data } = json;
  if (!Array.isArray(data) || data.length > MAX_IMPORTED_ROWS || !data.every(isPlainObject)) {
    fail('Imported sheet has invalid rows.');
  }
  const isContentFragment = isFragmentSheet(sourceColumns);
  const visibleColumns = isContentFragment
    ? sourceColumns.filter((col) => !col.startsWith('_') && !col.replace(/^field:/, '').startsWith('_'))
    : sourceColumns;
  const columns = visibleColumns.map((col) => (isContentFragment ? col.replace(/^field:/, '') : col));
  const rows = data.map((row) => visibleColumns.map((col) => (hasOwn(row, col) ? toCell(row[col]) : '')));
  const sheetName = typeof json[':sheetname'] === 'string' && json[':sheetname'] ? json[':sheetname'] : 'data';
  return { columns, rows, sheetName, isContentFragment };
}

// Returns jspreadsheet options with every mutation path disabled,
// or null when there are no columns.
export function buildImportedSheet({ columns, rows, sheetName }) {
  if (!columns.length) return null;
  return {
    sheetName,
    data: [columns, ...rows],
    columns: columns.map(() => ({ type: 'text', width: '300', readOnly: true, stripHTML: true })),
    editable: false,
    parseFormulas: false,
    secureFormulas: true,
    stripHTML: true,
    allowInsertRow: false,
    allowManualInsertRow: false,
    allowInsertColumn: false,
    allowManualInsertColumn: false,
    allowDeleteRow: false,
    allowDeleteColumn: false,
    allowRenameColumn: false,
    allowComments: false,
    columnDrag: false,
    rowDrag: false,
    columnResize: false,
    rowResize: false,
    columnSorting: false,
    autoIncrement: false,
    contextMenu: () => false,
    onbeforepaste: () => false,
  };
}

const BLOCKED_KEYS = ['Delete', 'Backspace'];
const BLOCKED_MOD_KEYS = ['s', 'v', 'x', 'z', 'y'];

// Defence in depth: the grid is already non-editable, so these only cover document-level handlers.
export function installImportedGuards(root, doc = document) {
  const inScope = (e) => root.contains(e.target) || !!window.jspreadsheet?.current;
  const block = (e) => {
    if (!inScope(e)) return;
    e.preventDefault();
    e.stopPropagation();
  };
  const onKey = (e) => {
    const modified = (e.ctrlKey || e.metaKey) && BLOCKED_MOD_KEYS.includes(e.key.toLowerCase());
    if (modified || BLOCKED_KEYS.includes(e.key)) block(e);
  };
  const events = ['paste', 'cut', 'drop'];
  events.forEach((name) => doc.addEventListener(name, block, true));
  doc.addEventListener('keydown', onKey, true);
  return () => {
    events.forEach((name) => doc.removeEventListener(name, block, true));
    doc.removeEventListener('keydown', onKey, true);
  };
}
