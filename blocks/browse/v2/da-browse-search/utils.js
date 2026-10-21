import { timeoutWrapper } from '../../shared/search.js';

export function matchFilenames({ items, query, matchCase = true }) {
  const searchTerm = matchCase ? query.trim() : query.trim().toLowerCase();
  return items.filter((item) => {
    const name = item.ext ? `${item.name}.${item.ext}` : item.name;
    return (matchCase ? name : name.toLowerCase()).includes(searchTerm);
  });
}

export async function loadFilenames({ snapshot, list, signal, onPage }) {
  const { fullpath, complete, continuationToken } = snapshot;
  const items = new Map(snapshot.items.map((item) => [item.path, item]));
  const seenTokens = new Set();
  let token = continuationToken;
  if (!complete && !token) throw new Error('Directory listing is incomplete');
  while (token) {
    signal.throwIfAborted();
    if (seenTokens.has(token)) throw new Error('Directory pagination did not advance');
    seenTokens.add(token);
    const requestToken = token;
    const fn = () => list(fullpath, { continuationToken: requestToken });
    const page = await timeoutWrapper({ fn });
    signal.throwIfAborted();
    if (!page.ok || !Array.isArray(page.items)) {
      throw new Error(page.error || `Directory request failed${page.status ? ` (${page.status})` : ''}`);
    }
    page.items.forEach((item) => {
      if (!items.has(item.path)) items.set(item.path, item);
    });
    token = page.continuationToken;
    onPage([...items.values()]);
  }
  return [...items.values()];
}
