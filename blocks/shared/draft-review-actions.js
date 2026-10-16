import { getVersionId } from './version/helpers.js';

async function hash(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function read(response, description) {
  const resp = await response;
  if (!resp?.ok) throw new Error(`${description} failed (${resp?.status ?? 'network error'}).`);
  return resp.text();
}

export function createDraftReviewService({
  api, storage, validateReview, draftRootForUser, getIdentity, flush, write, compare, notify,
  verify = ({ expected, actual }) => expected === actual,
}) {
  let busy = false;

  return async ({ action, review, paths, context, episodeId }) => {
    const { org, site } = context ?? {};
    if (!org || !site || !/^[a-z0-9-]+$/i.test(org) || !/^[a-z0-9-]+$/i.test(site)) {
      throw new Error('Select a DA site before reviewing drafts.');
    }
    const identity = await getIdentity();
    const draftRoot = draftRootForUser(identity);
    if (action === 'context') return { org, site, draftRoot };
    validateReview(review);
    if (!episodeId) throw new Error('Wait for the chat session to connect.');
    const key = `da:ai-review:${JSON.stringify([org, site, identity.userId, episodeId, review.id])}`;
    const load = () => JSON.parse(storage.getItem(key) || 'null');
    const persist = (state) => storage.setItem(key, JSON.stringify(state));
    const full = (path) => `/${org}/${site}${path}`;
    const fetchPage = (path) => read(api.source.get(full(path), { cachebust: true }), `Read ${path}`);
    const state = load();
    const savedVersion = async (path, result) => {
      if (!result.versionLabel) {
        const listed = await api.versions.list(full(path));
        if (!listed?.ok) throw new Error(`Could not resolve the saved version of ${path} (${listed?.status ?? 'network error'}).`);
        const entries = await listed.json();
        const matches = entries.filter((entry) => {
          const label = entry.label ?? entry['version-comment'];
          return label?.startsWith(`Before AI review ${review.id} `)
            && [entry.version, entry.versionId, getVersionId(full(path), entry)]
              .includes(result.versionId);
        });
        if (matches.length !== 1) {
          throw new Error(`Could not uniquely identify the saved version of ${path}. Use version history to select it explicitly.`);
        }
        result.versionId = getVersionId(full(path), matches[0]);
        result.versionLabel = matches[0].label ?? matches[0]['version-comment'];
        persist(state);
      }
      return read(api.versions.get(full(path), { versionId: result.versionId }), 'Read saved version');
    };
    const publicState = (s) => ({
      approvedPaths: s?.approvedPaths,
      results: s?.results ?? {},
    });
    const fingerprint = JSON.stringify(review);
    if (review.type === 'plan' && state && state.plan !== fingerprint) {
      throw new Error('This review id was reused for a different plan. Ask for a new plan with a new id.');
    }
    if (review.type === 'ready') {
      if (!state?.approvedPaths?.length) throw new Error('Approve the matching plan before reviewing drafts.');
      if (review.pages.length !== state.approvedPaths.length
        || review.pages.some((page) => !state.approvedPaths.includes(page.path)
          || page.draftPath !== `${draftRoot}${page.path}`)) {
        throw new Error('Drafts must exactly match the approved pages and signed-in user draft folder.');
      }
      if (state.ready && state.ready !== fingerprint) {
        throw new Error('This ready block changed after review began. Ask for a new plan with a new id.');
      }
    }
    if (action === 'status') return publicState(state);
    if (busy) throw new Error('Another draft review operation is in progress.');
    if (!Array.isArray(paths) || new Set(paths).size !== paths.length
      || paths.some((path) => !review.pages.some((page) => page.path === path))) {
      throw new Error('Select pages from this review only.');
    }
    busy = true;
    try {
      if (action === 'continue-scope') {
        if (review.type !== 'plan' || !state?.approvedPaths?.length || state.ready) {
          throw new Error('Only an approved plan without completed drafts can be continued.');
        }
        return publicState(state);
      }
      if (action === 'approve-scope' || action === 'reject-scope') {
        if (review.type !== 'plan' || state) throw new Error('This plan has already been decided.');
        if (action === 'approve-scope' && !paths.length) throw new Error('Select at least one page.');
        const approvedPaths = action === 'approve-scope' ? paths : [];
        const originals = {};
        for (const path of approvedPaths) {
          await flush({ org, site, path });
          originals[path] = await hash(await fetchPage(path));
        }
        const next = { plan: fingerprint, approvedPaths, originals, results: {}, drafts: {} };
        persist(next);
        return publicState(next);
      }
      if (review.type !== 'ready' || !state || !paths.length
        || !['diff', 'apply', 'reject', 'restore'].includes(action)) {
        throw new Error('Unsupported draft review action.');
      }
      state.ready = fingerprint;
      persist(state);
      for (const path of paths) {
        const result = state.results[path];
        const page = review.pages.find((p) => p.path === path);
        if (action === 'reject') {
          if (result) throw new Error(`${path} has already been decided.`);
          state.results[path] = { status: 'rejected' };
          persist(state);
        } else if (action === 'diff') {
          await flush({ org, site, path });
          const before = result?.versionId
            ? await savedVersion(path, result)
            : await fetchPage(path);
          const after = result?.status === 'applied' || result?.status === 'restored'
            ? await fetchPage(path) : await fetchPage(page.draftPath);
          if (!result) {
            if (await hash(before) !== state.originals[path]) throw new Error(`${path} changed since scope approval. Request a new plan.`);
            state.drafts[path] = await hash(after);
            persist(state);
          }
          await compare({ before, after, path: full(path), title: page.title });
        } else if (action === 'apply') {
          if (result?.status) throw new Error(`${path} has already been decided.`);
          await flush({ org, site, path });
          const original = await fetchPage(path);
          if (await hash(original) !== state.originals[path]) throw new Error(`${path} changed since scope approval. Request a new plan.`);
          const draft = await fetchPage(page.draftPath);
          const draftHash = await hash(draft);
          if (state.drafts[path] && state.drafts[path] !== draftHash) {
            throw new Error(`The draft for ${path} changed after viewing its diff. View the diff again before approving.`);
          }
          const label = `Before AI review ${review.id} ${crypto.randomUUID()}`;
          const created = await api.versions.create(full(path), { comment: label });
          if (!created?.ok) throw new Error(`Could not save a version of ${path}. The original was not modified.`);
          const listed = await api.versions.list(full(path));
          if (!listed?.ok) throw new Error(`Could not confirm the saved version of ${path}. The original was not modified.`);
          const entries = await listed.json();
          const entry = entries.find((e) => (e.label ?? e['version-comment']) === label);
          const versionId = entry && getVersionId(full(path), entry);
          if (!versionId) throw new Error(`Could not identify the saved version of ${path}. The original was not modified.`);
          await flush({ org, site, path });
          if (await hash(await fetchPage(path)) !== state.originals[path]) {
            throw new Error(`${path} changed while saving its version. The draft was not applied.`);
          }
          state.results[path] = { versionId, versionLabel: label, status: 'applying' };
          persist(state);
          await write({ org, site, path, content: draft });
          const applied = await fetchPage(path);
          if (!verify({ expected: draft, actual: applied })) {
            throw new Error(`Could not confirm that ${path} contains the approved changes. Check version history before proceeding.`);
          }
          const appliedHash = await hash(applied);
          state.results[path] = { versionId, versionLabel: label, appliedHash, status: 'applied' };
          persist(state);
          notify({ org, site, path });
        } else if (action === 'restore') {
          if (result?.status !== 'applied') throw new Error(`${path} has no applied changes to restore.`);
          await flush({ org, site, path });
          if (await hash(await fetchPage(path)) !== result.appliedHash) {
            throw new Error(`${path} changed after approval. Restore from version history instead to avoid overwriting newer edits.`);
          }
          const previous = await savedVersion(path, result);
          await flush({ org, site, path });
          if (await hash(await fetchPage(path)) !== result.appliedHash) {
            throw new Error(`${path} changed while loading its previous version. Nothing was restored.`);
          }
          state.results[path] = { ...result, status: 'restoring' };
          persist(state);
          await write({ org, site, path, content: previous });
          if (!verify({ expected: previous, actual: await fetchPage(path) })) {
            throw new Error(`Could not confirm restoration of ${path}. Check version history before proceeding.`);
          }
          state.results[path] = { ...result, status: 'restored' };
          persist(state);
          notify({ org, site, path });
        }
      }
      return publicState(state);
    } finally {
      busy = false;
    }
  };
}
