const SAVE_DELAY_MS = 1000;

// Snapshots let a final save finish without retaining a destroyed editor.
export function createSourcePersistence({ initialBody, save, onState }) {
  let latestBody = initialBody;
  let savedBody = initialBody;
  let timer;
  let pendingSave;
  let disposed = false;

  const hasChanges = () => latestBody !== savedBody;

  async function savePending() {
    while (hasChanges()) {
      const body = latestBody;
      onState({ status: 'saving' });
      try {
        const resp = await save(body);
        if (!resp?.ok) {
          const detail = resp?.headers?.get('x-error');
          throw new Error(`Could not save the document (${resp?.status ?? 'network error'})${detail ? `: ${detail}` : ''}`);
        }
      } catch (error) {
        const message = error.message || 'Could not save the document.';
        onState({ status: 'error', error: message });
        return { ok: false, error: message };
      }
      savedBody = body;
    }
    onState({ status: 'saved' });
    return { ok: true };
  }

  function flush() {
    clearTimeout(timer);
    timer = undefined;
    if (pendingSave) return pendingSave;
    if (!hasChanges()) return Promise.resolve({ ok: true });
    pendingSave = savePending().finally(() => { pendingSave = undefined; });
    return pendingSave;
  }

  return {
    get hasPending() { return Boolean(pendingSave) || hasChanges(); },
    schedule(body) {
      if (disposed) throw new Error('Cannot update a disposed document saver.');
      latestBody = body;
      clearTimeout(timer);
      if (!hasChanges() && !pendingSave) {
        onState({ status: 'saved' });
        return;
      }
      onState({ status: pendingSave ? 'saving' : 'pending' });
      timer = setTimeout(flush, SAVE_DELAY_MS);
    },
    flush,
    dispose() {
      disposed = true;
      return flush();
    },
  };
}
