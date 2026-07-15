import { convertSheets, debounce, saveToDa } from '../../edit/utils/helpers.js';
import { getNx2Api } from '../../../scripts/utils.js';

const DEBOUNCE_TIME = 1000;
const POLL_INTERVAL = 30000;

class StaleCheck {
  constructor() {
    this._intervalId = null;
    this._doc = null;
    this._lastJsonString = null;
    this._hasLocalEdits = false;
    this._saveBlocked = false;
    this._onStale = null;
    // Promise that resolves when the current save (POST + markSynced) is done.
    // Reads gate on this so we never issue a GET while our own write is in
    // flight — otherwise the server correctly returns a state that predates
    // the write, and drift detection misfires against the just-updated
    // _lastJsonString. Deadlock is impossible because a POST only fires from
    // saveSheets after checkForDrift completes, so at most one save can be
    // pending at a time.
    this._pendingSave = null;
  }

  // `details` is the pathDetails object ({ org, site, path, view }).
  start({ details, onStale }) {
    if (this._intervalId) clearInterval(this._intervalId);
    this._doc = details;
    this._onStale = onStale;
    this._intervalId = setInterval(() => this.checkForDrift(), POLL_INTERVAL);
  }

  stop() {
    if (this._intervalId) clearInterval(this._intervalId);
    this._intervalId = null;
    this._doc = null;
    this._lastJsonString = null;
    this._hasLocalEdits = false;
    this._saveBlocked = false;
    this._onStale = null;
    // Drop the reference so a load for a different file doesn't wait on the
    // previous file's in-flight save. The fetch itself is not cancelled.
    this._pendingSave = null;
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

  // Waits for any in-flight save. Loops so a new save that started while we
  // were waiting also gets awaited before returning.
  async awaitPendingSave() {
    while (this._pendingSave) {
      // eslint-disable-next-line no-await-in-loop
      await this._pendingSave;
    }
  }

  // Serialise a save operation. Any concurrent save queues behind the current
  // one; any read that calls awaitPendingSave() waits until the save (POST +
  // markSynced) has fully settled, so the read never observes a pre-write
  // state that its own markSynced has already invalidated locally.
  async runSave(saveOp) {
    await this.awaitPendingSave();
    let resolve;
    const p = new Promise((r) => { resolve = r; });
    this._pendingSave = p;
    try {
      return await saveOp();
    } finally {
      resolve();
      if (this._pendingSave === p) this._pendingSave = null;
    }
  }

  // Returns true if drift was detected (caller should not write).
  // Skips while blocked so a stale dialog doesn't keep re-firing on subsequent edits/polls.
  async checkForDrift() {
    if (this._saveBlocked) return true;
    // Never read while our own save is in flight — the server hasn't seen
    // the write yet, so the GET would return the previous body and drift
    // would misfire against the locally-updated _lastJsonString once the
    // POST returns.
    await this.awaitPendingSave();
    try {
      const { config, source } = await getNx2Api();
      const { org, site, path, view } = this._doc;

      const resp = view === 'config'
        ? await config.get({ org, site })
        : await source.get({ org, site, path });
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
  return staleCheck.runSave(async () => {
    const dasSave = await saveToDa(pathname, sheets);
    if (!dasSave.ok) {
      // eslint-disable-next-line no-console
      console.error('Error saving sheet', dasSave);
      return false;
    }
    staleCheck.markSynced(convertedJson);
    return true;
  });
};

const debouncedSaveSheets = debounce(saveSheets, DEBOUNCE_TIME);

export async function restoreVersion(daTitle, daSheet, versionData) {
  const initSheet = (await import('./index.js')).default;
  daTitle.sheet = await initSheet(daSheet, versionData);
  return saveSheets(daSheet.jexcel);
}

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
