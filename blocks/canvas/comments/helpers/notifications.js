import { DA_ORIGIN } from '../../../shared/constants.js';
import { daFetch } from '../../../shared/utils.js';

const EXCERPT_LENGTH = 160;

export const threadKey = (threadId) => `comment:${threadId}`;

const emailOf = (person) => person?.email?.toLowerCase();

export function commentRecipients({
  store, threadId, actor, mentions = [], previousMentions = [], includeParticipants = false,
}) {
  const actorEmail = emailOf(actor);
  const previous = new Set(previousMentions.map(emailOf));
  const mentioned = new Set(mentions.map(emailOf).filter((email) => email && !previous.has(email)));
  const participants = new Set();
  if (includeParticipants) {
    store?.forEach((comment, id) => {
      const inThread = id === threadId || comment.threadId === threadId;
      if (inThread) participants.add(emailOf(comment.author));
    });
  }
  const others = (emails) => [...emails].filter((email) => email && email !== actorEmail);
  return {
    mentioned: others(mentioned),
    participants: others(participants).filter((email) => !mentioned.has(email)),
  };
}

export function commentNotification({ path, threadId, body, type, recipients }) {
  const excerpt = body.length > EXCERPT_LENGTH ? `${body.slice(0, EXCERPT_LENGTH).trimEnd()}…` : body;
  return {
    type,
    key: threadKey(threadId),
    recipients,
    title: path.split('/').pop(),
    description: excerpt,
    link: `/canvas?comment=${encodeURIComponent(threadId)}#/${path}`,
  };
}

function send(path, method, payload) {
  return daFetch(`${DA_ORIGIN}/notifications/${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    noRedirect: true,
  }).catch(() => null);
}

export function notifyComment({ path, threadId, body, recipients }) {
  if (!path) return Promise.resolve();
  const sends = [
    ['comment-reply', recipients.participants],
    ['comment-mention', recipients.mentioned],
  ]
    .filter(([, emails]) => emails.length)
    .map(([type, emails]) => {
      const notification = commentNotification({ path, threadId, body, type, recipients: emails });
      return send(path, 'POST', notification);
    });
  return Promise.all(sends);
}

export function resolveCommentNotifications({ path, threadId }) {
  if (!path) return Promise.resolve();
  return send(path, 'DELETE', { key: threadKey(threadId) });
}
