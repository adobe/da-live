import { createResult, SEVERITY } from '../views/result.js';

// Shared by providers so one throwing check doesn't take its whole category/provider down.
// Awaited so a check that returns a promise (sync or async function, doesn't matter) is
// supported the same way - both a thrown error and a rejection are isolated the same way.
export async function runCheck(check, args) {
  try {
    return await check(args);
  } catch (err) {
    const item = createResult();
    item.settle(SEVERITY.ERROR, err?.message || 'Check failed to run.');
    return { title: check.name || 'Unknown check', items: [item], done: true };
  }
}
