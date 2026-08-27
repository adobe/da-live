// ---- Force-save protocol ----
// Matches da-collab messageFlushRequest / messageFlushResponse constants.
const MSG_FLUSH_REQUEST = 2;
const MSG_FLUSH_RESPONSE = 3;
const FLUSH_TIMEOUT_MS = 8000;
const FLUSH_MAX_RETRIES = 3;

function decodeFlushAck(data) {
  const ok = data[1] === 1;
  if (ok) return { ok: true };
  // Decode varint-prefixed error string written by lib0/encoding.writeVarString
  let offset = 2;
  let len = 0;
  let shift = 0;
  while (offset < data.length) {
    const b = data[offset];
    offset += 1;
    // eslint-disable-next-line no-bitwise
    len |= (b & 0x7f) << shift;
    // eslint-disable-next-line no-bitwise
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  const error = new TextDecoder().decode(data.slice(offset, offset + len));
  return { ok: false, error };
}

function sendFlushRequest(ws) {
  return new Promise((resolve) => {
    let timer;

    const onMessage = (event) => {
      const data = new Uint8Array(event.data);
      if (data[0] !== MSG_FLUSH_RESPONSE) return;
      clearTimeout(timer);
      ws.removeEventListener('message', onMessage);
      resolve(decodeFlushAck(data));
    };

    timer = setTimeout(() => {
      ws.removeEventListener('message', onMessage);
      resolve({ ok: false, timeout: true });
    }, FLUSH_TIMEOUT_MS);

    ws.addEventListener('message', onMessage);
    ws.send(new Uint8Array([MSG_FLUSH_REQUEST]));
  });
}

function waitForWsConnection(provider) {
  return new Promise((resolve, reject) => {
    if (provider.wsconnected) {
      resolve();
      return;
    }
    let timer;

    const onStatus = ({ status }) => {
      if (status === 'connected') {
        clearTimeout(timer);
        provider.off('status', onStatus);
        resolve();
      }
    };

    timer = setTimeout(() => {
      provider.off('status', onStatus);
      reject(new Error('connection timeout'));
    }, FLUSH_TIMEOUT_MS);

    provider.on('status', onStatus);
  });
}

export async function forceSave(provider) {
  for (let attempt = 0; attempt < FLUSH_MAX_RETRIES; attempt += 1) {
    try {
      if (!provider.wsconnected) {
        await waitForWsConnection(provider);
      }
      const result = await sendFlushRequest(provider.ws);
      if (result.ok) return { ok: true };
      if (!result.timeout) return result; // server-side error, no retry
    } catch {
      // connection wait timed out, try again
    }
  }
  return { ok: false, error: 'Unable to confirm save. Please retry or reload the editor.' };
}
