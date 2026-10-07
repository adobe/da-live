const MAX_SNIPPETS = 3;
const MAX_SNIPPET_LENGTH = 160;
const CONTEXT_LENGTH = 40;

export function getSearchPattern({ term, caseSensitive }) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped, caseSensitive ? 'gu' : 'giu');
}

export function getMatchContext({
  text,
  filename,
  term,
  caseSensitive,
  pattern = getSearchPattern({ term, caseSensitive }),
}) {
  const snippets = [];
  let hasMore = false;
  let previousMatchEnd = 0;
  for (const match of text.matchAll(pattern)) {
    const previous = snippets.at(-1);
    const previousEnd = previous ? previous.offset + previous.text.length : 0;
    if (previous && match.index < previousEnd) {
      previous.matches.push({
        start: match.index - previous.offset,
        end: Math.min(match.index + match[0].length, previousEnd) - previous.offset,
      });
    } else if (snippets.length === MAX_SNIPPETS) {
      hasMore = true;
      break;
    } else {
      const start = Math.max(previousEnd, previousMatchEnd, match.index - CONTEXT_LENGTH, 0);
      const end = Math.min(
        text.length,
        match.index + match[0].length + CONTEXT_LENGTH,
        start + MAX_SNIPPET_LENGTH,
      );
      // Copy the slice so excerpts do not keep the full source string alive.
      const excerpt = text.slice(start, end).split('').join('');
      snippets.push({
        offset: start,
        text: excerpt,
        matches: [{
          start: match.index - start,
          end: Math.min(match.index + match[0].length, end) - start,
        }],
        truncatedStart: start > 0,
        truncatedEnd: end < text.length,
      });
    }
    previousMatchEnd = match.index + match[0].length;
  }
  return { filenameMatch: filename.search(pattern) !== -1, snippets, hasMore };
}
