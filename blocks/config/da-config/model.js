// What the editor shows and writes for the selected section, derived from the registry entry and
// the loaded data. Pure functions: the element (da-config.js) owns the state and passes it in.

import { getValue, applyValues, setRows } from '../sheets.js';
import { inFile, inherits, sheetFor } from '../stores.js';
import { fieldStates, pendingChanges } from '../editors/settings.js';
import { rowStates, rowsToSave } from '../editors/rows.js';
import { INHERITANCE, SHELL } from '../messages.js';

// Identifies the panel being edited (section and part), e.g. to tell whether the user moved on.
export const panelKey = ({ section, part }) => `${section.id}/${part?.id ?? ''}`;

// The part a section with several views (`parts`, e.g. Translation) shows, or null.
export function partOf(panel, partId) {
  if (!panel.parts) return null;
  return panel.parts.find((part) => part.id === partId) ?? panel.parts[0];
}

// The selected section resolved against the loaded data:
// { section, store, part, panel, sheet, own, inherited, ready }. `own` is the config or file being
// edited, `inherited` the org config layered under it at site scope (or null), and `ready` whether
// a file-stored section has been read.
export function editorContext({ section, partId, atSite, configs, file }) {
  const { store } = section;
  const part = partOf(section.panel, partId);
  const fileBased = inFile(store);
  return {
    section,
    store,
    part,
    panel: part ?? section.panel,
    sheet: sheetFor(store, { part, json: file?.json }),
    own: fileBased ? file?.json ?? null : configs[atSite ? 'site' : 'org'],
    inherited: atSite && inherits(store) ? configs.org : null,
    ready: !fileBased || file?.status === 'ok',
  };
}

// The panel's view state with unsaved work: settings `states` or a rows `list`, plus
// { dirty, label, invalid } for the save bar.
export function editState({ panel, own, inherited, sheet }, { edits, rows }) {
  if (panel.kind === 'rows') {
    const list = rowStates(panel, { own, inherited, sheet, pending: rows });
    return { list, dirty: list.dirty, label: SHELL.unsaved, invalid: false };
  }
  const states = fieldStates(panel.fields, { own, inherited, sheet, edits });
  const count = states.filter((s) => s.dirty).length;
  return {
    states,
    dirty: count > 0,
    label: SHELL.unsavedCount(count),
    invalid: states.some((s) => s.error),
  };
}

// The write for the unsaved work: (json|null) => { config, changed }. The sheet comes from the
// copy re-read right before the write, since a library list lives in whatever its first sheet is.
export function mutationFor({ store, part, panel }, edit) {
  return (json) => {
    const sheet = sheetFor(store, { part, json });
    if (panel.kind === 'rows') return setRows(json, rowsToSave(panel, json, edit.list.rows, sheet), sheet);
    return applyValues(json, pendingChanges(edit.states), sheet);
  };
}

// Site scope only: true until the panel's setup flag (e.g. ew.enabled) is set for the site,
// directly or via the org. Once set, even to off, the fields show so it can be changed here.
export function needsSetup({ panel, sheet }, { configs, atSite }) {
  if (!panel.setup || !atSite) return false;
  const { key } = panel.setup;
  return !getValue(configs.site, key, sheet) && !getValue(configs.org, key, sheet);
}

// One sentence on how org and site values combine, or '' where they don't.
export function inheritanceText({ store, panel }, atSite) {
  if (!inherits(store)) return '';
  if (panel.kind !== 'rows') {
    return atSite ? INHERITANCE.settingsAtSite : INHERITANCE.settingsAtOrg;
  }
  return atSite ? INHERITANCE.rowsAtSite : INHERITANCE.rowsAtOrg;
}
