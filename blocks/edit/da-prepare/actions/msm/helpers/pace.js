// The AEM admin API (api.aem.live and admin.hlx.page) allows 10 requests per
// second per project, and its 429 carries no CORS headers, so the browser
// reports it as a network error. MSM runs one request chain per satellite,
// so requests are capped at 4 in flight and 8 starts per second, and 429,
// 503 and network errors are retried.
const MAX_IN_FLIGHT = 4;
const MIN_INTERVAL_MS = 125;
const RETRY_DELAYS_MS = [1000, 2000, 4000];
const MAX_RETRY_AFTER_S = 60;

let sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
let minIntervalMs = MIN_INTERVAL_MS;
let active = 0;
let nextStart = 0;
const waiting = [];

export function setPaceOptions(opts = {}) {
  if (opts.sleep) ({ sleep } = opts);
  if (opts.minIntervalMs !== undefined) ({ minIntervalMs } = opts);
}

async function inSlot(task) {
  if (active >= MAX_IN_FLIGHT) await new Promise((resolve) => { waiting.push(resolve); });
  active += 1;
  const now = Date.now();
  const wait = Math.max(0, nextStart - now);
  nextStart = Math.max(now, nextStart) + minIntervalMs;
  try {
    if (wait) await sleep(wait);
    return await task();
  } finally {
    active -= 1;
    waiting.shift()?.();
  }
}

function retryDelay(resp, attempt) {
  const after = Number(resp?.headers?.get('x-retry-after') || resp?.headers?.get('retry-after'));
  if (after > 0) return Math.min(after, MAX_RETRY_AFTER_S) * 1000;
  return RETRY_DELAYS_MS[attempt];
}

export default function paced(task) {
  return inSlot(async () => {
    for (let attempt = 0; ; attempt += 1) {
      let resp;
      let error;
      try {
        // eslint-disable-next-line no-await-in-loop
        resp = await task();
      } catch (e) {
        error = e;
      }
      const retryable = error || resp?.status === 429 || resp?.status === 503;
      if (!retryable || attempt >= RETRY_DELAYS_MS.length) {
        if (error) throw error;
        return resp;
      }
      // eslint-disable-next-line no-await-in-loop
      await sleep(retryDelay(resp, attempt));
    }
  });
}
