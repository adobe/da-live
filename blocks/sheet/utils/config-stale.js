import { daFetch } from '../../shared/utils.js';

export async function fetchConfigState(url) {
  const resp = await daFetch(url);
  if (!resp.ok) return null;
  return JSON.stringify(await resp.json());
}

export function createConfigStaleMonitor({
  getConfigState,
  onStale,
  intervalMs = 30000,
  schedule = setInterval,
  unschedule = clearInterval,
}) {
  let baseline;
  let intervalId;
  let ignored = false;

  const stop = () => {
    if (intervalId) {
      unschedule(intervalId);
      intervalId = undefined;
    }
  };

  const check = async () => {
    if (ignored) return false;

    const latest = await getConfigState();
    if (latest === null) return false;

    if (baseline === undefined || baseline === null) {
      baseline = latest;
      return false;
    }

    if (latest !== baseline) {
      stop();
      onStale?.();
      return true;
    }

    return false;
  };

  const start = async () => {
    ignored = false;
    stop();
    baseline = await getConfigState();
    intervalId = schedule(() => {
      check();
    }, intervalMs);
  };

  const ignore = () => {
    ignored = true;
    stop();
  };

  const refresh = async () => {
    ignored = false;
    await start();
  };

  const syncBaseline = async () => {
    baseline = await getConfigState();
  };

  return {
    check,
    ignore,
    refresh,
    start,
    stop,
    syncBaseline,
  };
}
