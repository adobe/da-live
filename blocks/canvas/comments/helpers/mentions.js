const QUERY_RE = /(?:^|\s)@([^\s@]*)$/;
const EMAIL_RE = /^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/;

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function mentionQuery(text, caret) {
  const match = text.slice(0, caret).match(QUERY_RE);
  if (!match) return null;
  return { query: match[1], start: caret - match[1].length - 1 };
}

export function insertMention({ text, caret, user }) {
  const found = mentionQuery(text, caret);
  if (!found) return { text, caret };
  const label = `@${user.name} `;
  return {
    text: `${text.slice(0, found.start)}${label}${text.slice(caret)}`,
    caret: found.start + label.length,
  };
}

export function filterRoster(users, query, limit = 6) {
  const q = query.trim().toLowerCase();
  return users
    .filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    .slice(0, limit);
}

export function activeMentions(text, mentions = []) {
  const seen = new Set();
  return mentions.filter((m) => {
    if (seen.has(m.email) || !text.includes(`@${m.name}`)) return false;
    seen.add(m.email);
    return true;
  });
}

export function splitMentions(body = '', mentions = []) {
  if (!mentions.length) return [{ text: body }];
  const names = [...mentions].sort((a, b) => b.name.length - a.name.length);
  const pattern = new RegExp(`@(${names.map((m) => escapeRegExp(m.name)).join('|')})`, 'g');
  const segments = [];
  let last = 0;
  body.replace(pattern, (match, name, offset) => {
    if (offset > last) segments.push({ text: body.slice(last, offset) });
    segments.push({ mention: mentions.find((m) => m.name === name) });
    last = offset + match.length;
    return match;
  });
  if (last < body.length) segments.push({ text: body.slice(last) });
  return segments;
}

export function emailsFromPermissions(rows = []) {
  const emails = rows
    .filter((row) => /read|write/.test(row.actions ?? ''))
    .flatMap((row) => (row.groups ?? '').split(','))
    .map((entry) => entry.trim().split('/').pop().toLowerCase())
    .filter((entry) => EMAIL_RE.test(entry) && !entry.endsWith('@techacct.adobe.com'));
  return [...new Set(emails)];
}

export function buildRoster(emails, people = []) {
  const names = new Map(people
    .filter((person) => person?.email && person.name)
    .map((person) => [person.email.toLowerCase(), person.name]));
  return emails
    .map((email) => ({ email, name: names.get(email) ?? email }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
