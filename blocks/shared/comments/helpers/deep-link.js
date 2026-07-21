export function buildDeepLinkUrl(url, commentId) {
  const out = new URL(url.toString());
  out.searchParams.set('comment', commentId);
  return out;
}

export function parseDeepLink(url) {
  const commentId = url.searchParams.get('comment');
  if (!commentId) return { commentId: null, cleaned: url };
  const cleaned = new URL(url.toString());
  cleaned.searchParams.delete('comment');
  return { commentId, cleaned };
}
