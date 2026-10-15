export function connectExtension(args) {
  const handle = { closed: 0, close() { handle.closed += 1; } };
  (globalThis.__extHostCalls ??= []).push({ ...args, handle });
  return handle;
}
