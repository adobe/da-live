window.daTestTreegridCalls ??= [];

export const treegridCalls = window.daTestTreegridCalls;

const record = (name) => (...args) => { treegridCalls.push({ name, args }); };

export const treegridEnsureTabStop = record('ensureTabStop');
export const treegridFocusIn = record('focusIn');
export const treegridKeydown = record('keydown');
