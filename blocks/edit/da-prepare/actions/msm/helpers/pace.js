// The AEM admin API (api.aem.live and admin.hlx.page) allows 10 requests per
// second per project, and its 429 carries no CORS headers, so the browser
// reports it as a network error. MSM runs one request chain per satellite,
// so calls are capped at 4 in flight and 8 starts in any second, retries
// included, and 429, 503 and network errors are retried. A Retry-After pauses
// every queued call; one longer than a minute isn't waited for, and calls
// fail with an error until it has passed.
//
// The cap counts calls into the nx2 api, not HTTP requests: a cross-site copy
// to or from a Helix 6 site is one call but a read and a write. The cap is per
// tab, not per project.
//
// A network error doesn't tell whether a write reached the server. Every MSM
// call can be sent again: preview, publish and status change nothing twice, a
// copy writes the same base page again, and a Helix 6 delete sent twice can
// report a 404 although the first one worked (legacy DA answers 204).
const MAX_IN_FLIGHT = 4;
const MAX_STARTS_PER_SECOND = 8;
const RETRY_DELAYS_MS = [1000, 2000, 4000];
const MAX_RETRY_AFTER_MS = 60000;

const defaultSleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

let sleep = defaultSleep;
let maxStarts = MAX_STARTS_PER_SECOND;
let active = 0;
const waiting = [];
let starts = [];
let pausedUntil = 0;

// Tests swap the sleep and the start cap. This also clears the start history
// and any Retry-After pause.
export function setPaceOptions(opts = {}) {
  sleep = opts.sleep || defaultSleep;
  maxStarts = opts.maxStartsPerSecond ?? MAX_STARTS_PER_SECOND;
  starts = [];
  pausedUntil = 0;
}

// Waits until a start fits the window, measured when the call really starts,
// so late timers can't bunch starts together.
async function waitForStart() {
  for (;;) {
    const now = Date.now();
    starts = starts.filter((time) => time > now - 1000 && time <= now);
    const wait = Math.max(
      pausedUntil - now,
      starts.length >= maxStarts ? starts[0] + 1000 - now : 0,
    );
    if (wait <= 0) {
      starts.push(now);
      return;
    }
    if (pausedUntil - now > MAX_RETRY_AFTER_MS) {
      throw new Error(`The AEM admin API is rate limited, try again in ${Math.ceil((pausedUntil - now) / 1000)} s`);
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(wait);
  }
}

async function inSlot(task) {
  if (active < MAX_IN_FLIGHT) {
    active += 1;
  } else {
    // the finishing call hands its slot over, so nobody can take it in between
    await new Promise((resolve) => { waiting.push(resolve); });
  }
  try {
    await waitForStart();
    return await task();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  }
}

function retryAfterMs(resp) {
  const after = Number(resp?.headers?.get('x-retry-after') || resp?.headers?.get('retry-after'));
  return after > 0 ? after * 1000 : 0;
}

export default async function paced(task) {
  for (let attempt = 0; ; attempt += 1) {
    let resp;
    let error;
    try {
      // eslint-disable-next-line no-await-in-loop
      resp = await inSlot(task);
    } catch (e) {
      error = e;
    }
    const retryable = error || resp?.status === 429 || resp?.status === 503;
    // a Retry-After holds the next start of every call, this one included
    const after = retryable ? retryAfterMs(resp) : 0;
    if (after) pausedUntil = Math.max(pausedUntil, Date.now() + after);
    const tooLong = pausedUntil - Date.now() > MAX_RETRY_AFTER_MS;
    if (!retryable || tooLong || attempt >= RETRY_DELAYS_MS.length) {
      if (error) throw error;
      return resp;
    }
    // eslint-disable-next-line no-await-in-loop
    if (!after) await sleep(RETRY_DELAYS_MS[attempt]);
  }
}
