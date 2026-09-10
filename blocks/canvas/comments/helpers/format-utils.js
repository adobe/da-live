export function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export function formatFullTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export function formatAnchorPreview(anchor) {
  if (!anchor) return '';
  if (anchor.anchorType === 'image') return 'an image';
  if (anchor.anchorType === 'table') {
    const text = (anchor.anchorText || '').trim();
    return text || 'a table';
  }
  const text = (anchor.anchorText || '').trim();
  if (!text) return '';
  const truncated = text.length > 80 ? `${text.slice(0, 80).trim()}…` : text;
  return `"${truncated}"`;
}

export function getInitials(name) {
  if (!name) return '?';
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function getReplySummary({ rootComment, replies }) {
  const uniqueAuthors = [];
  const seen = new Set();

  replies.forEach((reply) => {
    const authorId = reply.author?.id;
    if (!authorId || authorId === rootComment.author?.id || seen.has(authorId)) return;
    seen.add(authorId);
    uniqueAuthors.push(reply.author.name);
  });

  if (uniqueAuthors.length === 0) return '';
  if (uniqueAuthors.length === 1) return ` from ${uniqueAuthors[0]}`;
  if (uniqueAuthors.length === 2) return ` from ${uniqueAuthors[0]} and ${uniqueAuthors[1]}`;

  const remainingCount = uniqueAuthors.length - 2;
  return ` from ${uniqueAuthors[0]}, ${uniqueAuthors[1]} and ${remainingCount} ${remainingCount === 1 ? 'other' : 'others'}`;
}
