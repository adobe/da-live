import { convertSheets, debounce, saveToDa } from '../../edit/utils/helpers.js';
import { getNx } from '../../../scripts/utils.js';

let nxPath = getNx();
nxPath = nxPath.endsWith('/nx') ? `${nxPath}2` : nxPath;
const { getSource } = await import(`${nxPath}/utils/api.js`);

const DEBOUNCE_TIME = 1000;
const POLL_INTERVAL = 30000;

class StaleCheck {
  constructor() {
    this._intervalId = null;
    this._sourceUrl = null;
    this._lastJsonString = null;
    this._hasLocalEdits = false;
    this._saveBlocked = false;
    this._onStale = null;
  }

  start({ url, onStale }) {
    if (this._intervalId) clearInterval(this._intervalId);
    this._sourceUrl = url;
    this._onStale = onStale;
    this._intervalId = setInterval(() => this.checkForDrift(), POLL_INTERVAL);
  }

  stop() {
    if (this._intervalId) clearInterval(this._intervalId);
    this._intervalId = null;
    this._sourceUrl = null;
    this._lastJsonString = null;
    this._hasLocalEdits = false;
    this._saveBlocked = false;
    this._onStale = null;
  }

  markSynced(json) {
    this._lastJsonString = JSON.stringify(json);
    this._hasLocalEdits = false;
    // Clear the post-Cancel block: a fresh sync (load or save) is the recovery path.
    this._saveBlocked = false;
  }

  markEdited() {
    this._hasLocalEdits = true;
  }

  blockSaves() {
    this._saveBlocked = true;
  }

  get isBlocked() {
    return this._saveBlocked;
  }

  // Returns true if drift was detected (caller should not write).
  // Skips while blocked so a stale dialog doesn't keep re-firing on subsequent edits/polls.
  async checkForDrift() {
    if (this._saveBlocked) return true;
    try {
      const [org, site, ...parts] = this._sourceUrl.split('source/').pop().split('/');
      const resp = await getSource({ org, site, daPath: `/${parts.join('/')}` });
      if (!resp.ok) return false;
      const json = await resp.json();
      const text = JSON.stringify(json);
      if (text === this._lastJsonString) return false;
      this._onStale({ json, dirty: this._hasLocalEdits });
      return true;
    } catch {
      // swallow transient errors; retry next tick
      return false;
    }
  }
}

export const staleCheck = new StaleCheck();

export const saveSheets = async (sheets) => {
  const convertedJson = convertSheets(sheets);
  document.querySelector('da-sheet-panes').data = convertedJson;

  // Bail before writing if the remote moved out from under us — protects against
  // last-write-wins between concurrent editors. Drift triggers the onStale flow.
  if (await staleCheck.checkForDrift()) return false;

  const { hash } = window.location;
  const pathname = hash.replace('#', '');
  const dasSave = await saveToDa(pathname, sheets);
  if (!dasSave.ok) {
    // eslint-disable-next-line no-console
    console.error('Error saving sheet', dasSave);
    return false;
  }
  staleCheck.markSynced(convertedJson);
  return true;
};

const debouncedSaveSheets = debounce(saveSheets, DEBOUNCE_TIME);

export function handleSave(jexcel, view) {
  // markEdited must precede the config bail so config edits still mark dirty for stale-detection.
  staleCheck.markEdited();
  if (view === 'config') return;
  if (staleCheck.isBlocked) return;
  debouncedSaveSheets(jexcel);
}

export async function showDaDialog({ title, body, confirmLabel }) {
  await import('../../shared/da-dialog/da-dialog.js');
  return new Promise((resolve) => {
    const daDialog = document.createElement('da-dialog');
    daDialog.title = title;

    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      daDialog.remove();
      resolve(result);
    };

    daDialog.action = {
      label: confirmLabel,
      click: () => finish('confirm'),
    };

    const bodyNode = typeof body === 'string'
      ? Object.assign(document.createElement('p'), { textContent: body })
      : body;
    daDialog.append(bodyNode);

    daDialog.addEventListener('close', () => finish('cancel'));
    document.body.append(daDialog);
  });
}
