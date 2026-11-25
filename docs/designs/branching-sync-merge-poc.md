# Content branching, sync, and merge — PoC design and implementation plan

Status: proposed; stakeholder-demo scope, not production-ready.

## 1. Outcome and scope

Users work in an explicitly selected **content branch** of a site. Every site has one default branch. Branches provide isolated document trees, can only be created from the default, can sync from the default, and can publish only back to the default.

Branching is an **optional backend capability**. Multiple backends provide the Source API; only one supports native branching. On every other backend the app works as today: users read and change the single implicit default branch, with no branching controls or dependency on a Branching API. Do not emulate branching on those backends.

The demo must support:

- Creating a branch or selecting an existing branch.
- Editing, creating, and deleting documents, visible only in that branch.
- Switching branches and seeing the selected branch's persisted content.
- Continuing to edit the default branch directly.
- A Changes view comparing the active branch with the current default.
- Syncing default-branch changes into a branch, with explicit user resolution of conflicts.
- Publishing all branch changes to default, only when the branch is up to date.
- Rejecting stale publishes without changing either branch, followed by sync, resolution if necessary, and retry.

### PoC boundaries

Use one dedicated, small demo site on the native-branching backend, and HTML documents. Also verify unchanged single-default operation on a non-branching backend. Existing site configuration and existing media can be read as shared resources; their mutation from a non-default branch is disabled. Branch isolation applies to documents, including their document-owned metadata. New media uploads, sheets/forms/config editing, comments, version restore, move/copy, folder deletion, bulk tools, imports, extensions/agents that write content, and live-site delivery from a content branch are out of scope and must be disabled or rejected in non-default branches. File deletion remains supported. Folders are derived from document paths; creating a document can create its containing folder implicitly.

For a complete demo, support browse plus the canvas document editor. Preserve the branch through any legacy-editor fallback, or block that fallback explicitly; never open a non-default document in an unscoped editor. Default-branch workflows outside the enabled demo site remain unchanged.

Do not build Git integration, a commit-history UI, arbitrary branch ancestry, branch-to-branch merging, automatic HTML/block merging, partial publishing, approvals, branch deletion, offline editing, or a production storage migration. Non-overlapping changes to *different documents* merge automatically. Concurrent changes to the same document are resolved at whole-document granularity. This is a deliberate simplification, not a claim that same-document edits cannot be merged.

## 2. Current application and integration points

The following are observations from this repository; the backend design below is proposed, not an assertion about an inspected Source server implementation.

| Observed surface | Design implication |
| --- | --- |
| Browse obtains `source` through `getNx2Api()` and calls `source.list(this.fullpath)` (`blocks/browse/da-list-base/da-list-base.js:163-180`). | Add explicit content-branch context to the shared client, including pagination; a selector alone cannot isolate listings. |
| Browse dispatches copy/move/delete through that Source client (`blocks/browse/da-list-base/da-list-base.js:433-467`). Its delete flow can also unpreview/unpublish (`blocks/browse/da-list-base/da-list-base.js:583-618`). | Branch file deletion must bypass trash/move and delivery side effects; unsupported mutations need guards. |
| Canvas builds Source URLs for both `api.aem.live/{org}/sites/{site}/source/...` and `admin.da.live/source/{org}/{site}/...` (`blocks/canvas/ew-editor-doc/utils/source.js:12-28`). | Backend capability and URL selection belong in the adapter; implement one backend for the demo, not silent fallback to another. |
| Canvas passes `sourceUrl` to the collaborative editor (`blocks/canvas/ew-editor-doc/ew-editor-doc.js:382-405`). The legacy editor establishes its connection from the document path (`blocks/edit/prose/index.js:522-545`). | Both editor entry paths must preserve branch identity, or unsupported entry paths must be blocked. |
| `createConnection` extracts the URL pathname and constructs a WebSocket room (`blocks/edit/prose/index.js:51-75`). | A Source URL query parameter alone is insufficient: this code currently discards it when building the room. Collaboration needs explicit changes. |
| Existing `fetchWysiwygBranch` resolves `ref` or `ew.wysiwygBranch` and defaults to `main` (`blocks/canvas/editor-utils/editor-utils.js:609-641`); preview origins use that resolved branch (`blocks/canvas/editor-utils/editor-utils.js:601-606`). | This is a code/preview ref, not a persisted content branch. Keep it separate. |
| Canvas already has `branchState` and a bridge to `nx-branch-*` events (`blocks/canvas/utils/canvas-bus.js:20-38`, `blocks/canvas/editor-utils/branch-bridge.js:12-27`). | Do not repurpose this state or break existing consumers. Add distinct `contentBranch*` channels. |
| Existing merge-conflict detection checks localization diff nodes (`blocks/canvas/editor-utils/prose-merge-conflicts.js:1-12`). | It is not evidence of a repository-level three-way merge API. Use a separate branch-conflict session and UI. |
| Existing editor Preview/Publish actions force-flush collaboration before AEM operations (`blocks/edit/da-title/da-title.js:311-320`). | Branch operations likewise require acknowledged persistence, but content-branch publish must remain distinct from AEM delivery publish. |
| The checked-in nx2 **test fixture** exposes source get/list/save/metadata/delete and snapshot APIs (`test/fixtures/nx2/utils/api.js:123-179`, `test/fixtures/nx2/utils/api.js:184-266`). Form code also consumes an external nx2 Source client (`blocks/form/utils/da-api.js:1-16`). | Change the actual shared client dependency as well as fixtures. Existing snapshot publish is not assumed to implement content branching. |

**Repository boundary:** Source persistence and collaboration-server implementations were not inspected here. Endpoint ownership, storage primitives, and the actual shared-client change must be confirmed in those repositories before coding. The first implementation milestone is a backend/collaboration feasibility spike, not a UI-only mock advertised as isolation. Scout reported source freshness as unverified during this design pass; cited source should be rechecked when implementation starts.

## 3. Behavioral contract

### Branch identity

- Scope branches by `(org, site)`; the default is site-wide, not per folder or document.
- When branching is available, fetch `defaultBranchId` from the Branching API. Seed the demo default as `main`, but do not hardcode it in UI logic. Otherwise use the existing implicit default context without inventing a server branch ID or fetching branch metadata.
- Use an immutable opaque ID in requests and a display name in the UI. For demo names, conservatively allow 1–8 lowercase alphanumeric characters (for example `campaign`). Do not reuse preview-ref normalization or infer a Git branch.
- Selecting a branch is browser-tab state, never a server-global “active branch.” Multiple users/tabs can work in different branches safely.
- Creating a branch always snapshots the current default, even if initiated while another branch is selected. The dialog says “Create from Default”; the server rejects any other source.
- Selecting an unknown or inaccessible branch produces an error; never fall back to default. Omitting branch context intentionally selects default for backward compatibility.

### Action availability

The table below applies only when branching is available. Without that capability, render the existing UI unchanged: normal document actions remain available, and no selector, Changes view, sync, or branch-publish actions appear.

| Action | Default selected | Non-default selected |
| --- | --- | --- |
| Select branch / create from default | Yes | Yes |
| Edit / create / delete document | Yes | Yes |
| Changes view | Not needed | Yes, including an empty state |
| Sync from default | No | Yes, even with no local changes |
| Merge to default | No | Yes when changes exist and no sync is pending |
| Existing AEM live publish/unpublish | Existing behavior | Disabled for the PoC |

The backend enforces default-branch and target restrictions even if a disabled UI is bypassed. While a branch sync session is unresolved, branch editing and publishing are locked; switching away and returning is allowed and resumes the session. Default can continue to receive changes between requests.

### Fast-forward-only semantics

Each non-default branch remembers `baseDefaultRevision`, the default revision captured at creation or last successful sync/publish.

Publish succeeds only if:

1. The source branch is non-default and its destination is the configured default.
2. No sync session is unresolved and all writes have been persisted.
3. The submitted branch revision is still current.
4. `baseDefaultRevision === currentDefaultRevision`, checked atomically with the update.

If default has advanced, **reject publish even when changes are disjoint**. Return `SYNC_REQUIRED`; the client starts an explicit sync. Any actual conflicts are displayed there, not merged during publish. Publish rejection has no side effects.

This is the requested fast-forward-only workflow, implemented with revision tokens and a three-way sync rather than a Git commit DAG. Sync is the only operation that reconciles divergent content.

After publish, keep the branch selected and reusable. Its tree and base become the newly published default revision; Changes becomes empty. A subsequent default edit makes it stale again. Publishing affects Source content only; it does not deploy to AEM preview or live.

## 4. Storage and revision model

This section describes the semantics required **inside the one native-branching provider only**. It is not a new storage requirement for every Source backend or a client-side storage layer. Prefer mapping the Branching API to that provider's native branches, revisions, and merge primitives. If those primitives already meet the contract, do not introduce a parallel manifest store. The following is a reference implementation if the native provider needs a small PoC implementation; non-branching providers remain untouched.

### Recommendation: immutable full manifests for a small demo site

Use immutable document blobs plus immutable manifests mapping canonical site-relative paths to blobs. Branch creation copies a small manifest, not all document bytes. Do not implement overlay reads against *current* default: that would leak default edits into branches before sync.

Conceptual records:

```text
Blob: { contentHash, bytes, contentType }
Tree: { treeId, entries: { "/about.html": { blobId, documentId, metadata } } }
Branch: {
  id, name, revision, treeId,
  baseDefaultRevision, baseTreeId, activeSyncId?, collaborationEpoch
}
SiteState: { generation, defaultBranchId, branches: { id: Branch } }
SyncSession: {
  id, branchId, expectedBranchRevision, baseTreeId,
  targetDefaultRevision, targetDefaultTreeId, candidateTreeId,
  conflicts, resolutions, revision, status
}
```

- Every successful content mutation, including a direct default edit, creates a new immutable tree and advances that branch's opaque revision. IDs must not be timestamps or client counters.
- A tree is complete. A missing path means absent; deletion does not fall through to another branch. No overlay tombstones are required.
- Preserve the immutable base tree as long as a branch/session references it. A base revision token alone is not enough for conflict detection.
- Document comparison includes persisted document-owned metadata. Ignore purely operational timestamps when testing content equality. Copy-on-write document identity is namespaced by branch for collaboration; the same logical document ID must not imply a shared room.
- Validate canonical paths, case rules, duplicate names, and file/directory collisions before committing trees. Invalid combined trees become structural conflicts, not partial writes.
- Listings, HEAD, GET, and Changes read one resolved branch revision per response. Pin paginated listing tokens to branch ID and revision; a concurrent edit requires restart rather than mixing pages.

### Atomic publication and backend integration

For the demo, serialize mutations per site and store the branch refs in a single small `SiteState` record updated with compare-and-swap. Stage blobs/trees first, then atomically replace that record. This supports advancing default and resetting the publishing branch in one visible update. Readers see old or new refs, never a partially copied directory. Orphan staged blobs after a failure are acceptable in the PoC; a partially published site is not.

All Source writes on the enabled native-branching site, including default writes and collaboration persistence, must participate in its native revision tracking (or the reference store above). Do not leave an unversioned write path alongside it. If bootstrap is needed, import the default tree while demo writers are paused; validate the imported listing and bytes before enabling the capability. Unmodified default clients still use the same Source contract when they omit branch context. No bootstrap, revision model, or write-path change is required on other providers.

If the backend cannot supply a conditional atomic ref update, use a single durable site coordinator for the demo. An in-memory lock in one process is insufficient if requests can reach multiple workers. Do not implement publish as a client loop of document saves/deletes. The dedicated demo site avoids requiring a general production migration, but it does not excuse a split source of truth.

## 5. Sync and conflict resolution

### Three-way algorithm

Capture immutable trees:

- **B**: default at branch creation or last successful sync/publish.
- **L**: current local branch tree.
- **D**: current default tree captured at sync start.

Compare the union of paths, treating absence as a value:

| Condition | Candidate result |
| --- | --- |
| `L == D` | Keep that value, including mutual deletion. |
| `L == B` | Take D; only default changed. |
| `D == B` | Keep L; only branch changed. |
| Otherwise | Conflict; require user choice. |

Equality means document content/merge-relevant metadata equality, not branch revision equality. The table covers modifications, additions, and deletions. Examples of conflicts are edit/edit, edit/delete, delete/edit, and different-content add/add at the same path. Identical concurrent additions and mutual deletions are not conflicts. A branch-created then deleted document produces no net change.

After per-path merging, validate the entire candidate namespace. For example, a file `/news` and documents under `/news/` cannot coexist if the store treats `/news` as a file. Expose colliding entries together for keep-one/delete/rename-in-resolution, or require deletion of one side in the PoC; never silently drop one. Generic rename detection is out of scope: rename is delete plus add.

### Session lifecycle

1. Flush local collaboration, acquire a server-side branch write barrier, drain accepted writes, and pin L and D. Briefly coordinate any default write already in progress to capture a consistent D.
2. Build the candidate and persist a sync session. If conflict-free, commit through the same completion checks below and return `completed` immediately.
3. Otherwise return `needs-resolution`, including stable conflict IDs and immutable B/L/D blob references (or explicit `absent`). Keep ordinary branch writes blocked. The live branch tree and base have not changed.
4. The UI offers **Keep branch**, **Take default**, and, for HTML, **Use edited result**. Deletion is an explicit result, not an empty HTML string. The user can reopen/revise decisions until completing the session.
5. Saving a resolution updates only the session candidate and checks the session revision. Resolving a conflict does not mutate default or pretend that sync has completed.
6. On Complete sync, revalidate authorization, all resolutions, namespace validity, expected branch revision, collaboration barrier, and `currentDefaultRevision === targetDefaultRevision`.
7. If default moved, return `SYNC_TARGET_MOVED`; commit nothing. Preserve the session for inspection and offer Restart sync against the new default. To keep the PoC safe and simple, restarting recomputes conflicts from the unchanged branch/base and requires choices again; do not silently reuse stale resolutions.
8. Otherwise atomically set the branch tree to the resolved candidate, set its base tree/revision to D, advance its revision and collaboration epoch, and close the session. Default is unchanged. Reconnect editors to the new tree.

Cancel sync discards the candidate and unlocks the unchanged branch. A failed request does not lose the saved session: discover it from branch metadata on reload. Allow one active session per branch. No conflict markers are persisted into normal HTML; unresolved conflicts live in structured session data. Sessions have a manual Cancel/Restart path rather than automatic timeout-based content loss.

## 6. Separate Source API and optional Branching API

### Responsibility split

Yes: separating the APIs is simpler for this multi-backend app. Keep document operations in Source and put branch lifecycle and reconciliation in an optional Branching API. Separation means independent contracts and client modules, **not** a new independently stored branching service or a promise to layer branches over arbitrary Source providers.

| Surface | Responsibilities | Required providers |
| --- | --- | --- |
| Source API | Existing document GET/HEAD/list/create/save/delete; optional branch selector understood by the native provider. | All providers, existing default behavior unchanged. |
| Branching API | Capability/default identity, branch list/create/metadata, Changes, sync sessions/resolutions, publish. | Only the native-branching provider. |
| Provider adapter | Bind Source, optional Branching API, and collaboration support for the same backend/site; translate branch selectors and native errors. | Existing default path everywhere; optional extension for the native provider. |

Ordinary document editing does not call Branching API endpoints per read/save. Once validated, immutable branch context travels with Source/collaboration requests. The two APIs share the native provider's repository state and atomic coordination internally; sync/publish must not be implemented as public Source CRUD loops. They can be hosted in the same backend process and deployed together for the PoC.

These are **new proposed contracts**, not existing implemented routes. Illustrative bases are:

```text
Source:   /source/{org}/{site}/{path}
Listing:  /list/{org}/{site}/{folder}
Branches: /branches/{org}/{site}
```

For a provider using the AEM API route shape, equivalent proposed bases are `/{org}/sites/{site}/source/{path}` (including directory listing) and `/{org}/sites/{site}/branches`. Confirm the actual native provider and routes during the feasibility spike. Only that provider implements the new Branching routes and scoped Source extension. Other providers need neither these routes nor stub endpoints, new headers, revisions, or changes to their storage.

### Optional capability discovery and graceful fallback

Expose an optional `branching` module from the provider adapter. An old shared-client version or an adapter with no such module means unsupported; do not make module import failure fatal to app startup. Prefer an explicit adapter registration over probing guessed Branching URLs on every backend.

For the registered native provider only, use `GET {BranchesBase}/capabilities` to discover availability for the selected site:

```json
{
  "supported": true,
  "apiVersion": 1,
  "defaultBranchId": "bdefault",
  "operations": ["create", "changes", "sync", "publish"],
  "branchScopedSource": true,
  "branchScopedCollaboration": true
}
```

Advertise support only when the complete PoC contract, including collaborative isolation, is available. Per-user permissions remain separate from backend support. Missing permission to create/publish must not be misreported as a non-branching backend. A feature flag can disable the UI, but cannot create support where the backend lacks it. Reject incompatible API versions as unavailable.

| Discovery outcome | No explicit branch in URL/context | Explicit branch selected/requested |
| --- | --- | --- |
| No registered module; `supported:false`; capability route `404/501` | Use existing Source and collaboration paths; hide branching UI. No branch metadata required. | Block scoped operations and show unsupported branch context; offer an explicit return to default. |
| Supported and compatible | Existing default requests continue; show selector after discovery. | Validate selected branch, then enable scoped reads/writes. |
| Timeout, network/5xx, incompatible response/version, or capability authorization error | Do not fail default editing if Source itself works. Hide/disable branching entry points; retain a distinct unavailable/authorization state and a retry path. | Preserve selection and unsaved content; block unvalidated scoped operations and show Retry / Return to default. Never strip context automatically. |

Discovery is asynchronous and bounded; do not put it on the critical path of default document loading or saving. Cache/deduplicate results per `(provider identity, org, site)` for the tab, and invalidate on provider/site changes or retry. A failure at one provider must not disable branching globally or make the client try another backend for the same content. Source authentication/network failures still follow existing error handling; fallback does not bypass them.

If the Branching API later fails while a branch is active, disable new branch-management operations. Already validated branch-scoped Source editing may continue only if the same provider still accepts that exact context and there is no known write barrier; otherwise preserve content and pause writes. A failed scoped Source request must never be retried unscoped. Returning to default is an explicit navigation through the safe flush/discard flow, not an automatic recovery action.

### Existing document operations

The only branch-specific extension needed on Source is an optional branch selector on GET, HEAD, list, POST/save/create, and DELETE, illustrated as `contentBranch=<opaque-id>`. The native adapter may translate it to the provider's existing native selector. Missing means default. For the default context, omit the selector on **all** providers, even when branching is available. Explicit invalid or unauthorized IDs must fail, not revert to default. Branch context must be present on every non-default pagination request as well. Revision-pinned Changes/detail reads belong to the Branching API, so other Source providers need no historical-read API.

Do not send unsupported providers branch query parameters and assume they will reject them: legacy servers may silently ignore unknown parameters. The client adapter must reject explicit branch context locally before issuing a request to an unsupported provider. The default Source request URL, payload, headers, response shapes, and collaboration identity remain as today on those providers.

Mutation preconditions on the native-branching provider only (use existing native equivalents where available):

- Create: `If-None-Match: *` for path existence within this branch.
- Edit/delete: `If-Match: <document-etag>` for this branch/path.
- ETags include branch/document incarnation as needed to reject stale delete/recreate writes. Source performs branch-revision advancement internally under site serialization; unrelated document saves need not conflict on one global ETag.
- Collaboration persistence additionally presents a current, server-issued branch/room epoch. Old epochs cannot write after a sync, publish, or delete/recreate.

The native provider can return `Content-Branch`, `Branch-Revision`, and document `ETag` as applicable, normalized by its adapter. These are not new mandatory fields on the common Source contract. Cache keys must include the branch/revision; use private/no-store caching on the demo site to avoid proxy ambiguity. Configure CORS on the native deployment to permit the query/precondition headers and expose response headers. A conditional failure returns `412`; it is not permission to retry against default. Existing default writes from older clients on that provider must still be tracked in revisions; stricter client preconditions must not break their existing contract.

On the native provider, all methods outside the PoC allowlist must reject non-default branch context with a structured error. The adapter likewise blocks unsupported operations before sending them. In particular, do not accept a branch-scoped copy/move/media/config request and then execute the unscoped operation. Unscoped operations on other providers keep their existing behavior.

### Branching API operations

All routes below are relative to the Branches base. Mutating requests use JSON and an idempotency key.

| Method and route | Request / result |
| --- | --- |
| `GET /capabilities` | Optional native-provider discovery described above; does not list branches. |
| `GET /` | `defaultBranchId`, branches with revisions, base revision, sync state, and computed up-to-date status. Called only when branching is available and the UI needs the list. |
| `POST /` | `{name, fromBranchId}`; source must equal default. Atomically capture its current tree; return `201` and new branch. Duplicate name returns `409`. |
| `GET /{id}` | Branch metadata, current default revision, active sync session ID. |
| `GET /{id}/changes` | Diff branch tree versus current default, pin both revisions in result; optional pagination. |
| `GET /{id}/changes/detail?path=...&branchRevision=...&defaultRevision=...` | Immutable side-by-side document values/diff, including absent sides. |
| `POST /{id}/sync` | `{expectedBranchRevision}`; capture default on server. Return `200 {status:"completed",...}` or `202 {status:"needs-resolution", syncId,...}`. |
| `GET /{id}/sync/{syncId}` | Pinned revisions, candidate summary, conflict kinds, B/L/D references, decisions, session revision. |
| `PUT /{id}/sync/{syncId}/resolutions/{conflictId}` | `{expectedSessionRevision, choice:"branch"|"default"|"edited"|"delete", body?}`; persist a validated decision. |
| `POST /{id}/sync/{syncId}/complete` | `{expectedSessionRevision}`; atomically finish, or report a stale target/unresolved conflict. |
| `DELETE /{id}/sync/{syncId}` | Cancel without changing branch content/base. Idempotent. |
| `POST /{id}/publish` | `{expectedBranchRevision, expectedDefaultRevision}`; target is implicit default. Atomically validate fast-forward rule and update both refs; return new revisions. |

Store and replay the response for an idempotency key together with the atomic mutation; reusing the key with a different payload fails. This makes a lost successful publish response safe to retry. Queries and writes still enforce existing org/site/path permissions; publish must have permission for *every* changed or deleted default path before any update. Default/branch restrictions and barriers apply server-side, not just in the UI.

Example stale-publish response:

```json
{
  "error": {
    "code": "SYNC_REQUIRED",
    "message": "Default changed. Sync this branch before publishing.",
    "branchId": "b123",
    "baseDefaultRevision": "r17",
    "currentDefaultRevision": "r21"
  }
}
```

Use `409` for `SYNC_REQUIRED`, `SYNC_TARGET_MOVED`, `SYNC_IN_PROGRESS`, structural conflicts, or revision races on branch operations; distinguish them with error codes. Use `422` for unresolved/invalid resolutions or prohibited branch sources/targets; `401/403` for authentication/authorization; `404` for inaccessible/missing resources according to existing policy. Do not conflate WebSocket initial “synced” with durable Source persistence.

### Shared client changes

Keep the common Source client backward compatible. Add an optional Branching client/module and native-provider adapter rather than putting sync/merge into the Source namespace. Illustrative application usage:

```js
// Every provider: existing default path; no Branching API dependency.
source.get(path);
source.save(path, { body });

// Optional extension, enabled only after capability validation.
nativeSource.list(path, { contentBranch, continuationToken });
nativeSource.get(path, { contentBranch });
nativeSource.save(path, { contentBranch, body, ifMatch });
nativeSource.delete(path, { contentBranch, ifMatch });
branching.sync({ org, site, branchId, expectedBranchRevision });
```

Here `nativeSource` denotes the native provider's scoped Source adapter, not a second store or necessarily a second exported client. Add equivalent scoped create/HEAD methods there, and branch/session methods to `branching`. A small application facade can select the adapter using captured context; keep capability checks out of individual components. Do not create a generic plugin framework or a fallback merge engine for the PoC.

Preserve existing default-call signatures and response shapes, including when the optional module is missing. Refresh the checked-in nx2 fixtures and mock responses after changing the real dependency; editing only `test/fixtures/nx2/utils/api.js` is not an implementation. Route branch-scoped direct Source URLs/fetches through the validated native adapter. Keep unrelated providers' default URL/fetch paths unchanged.

## 7. Collaboration and branch switching

### Identity and write barriers are essential, even for the demo

The requirements in this subsection apply to the native-branching deployment. Other providers keep their existing collaboration connection, room identity, and persistence behavior; default editing must not require branch discovery, new epochs, or a new flush protocol on those providers.

The room/persistence key must include `(org, site, contentBranchId, canonicalDocumentPath, documentIncarnation, collaborationEpoch)`. Awareness, Yjs state, undo history, and local caches must never be reused across branches. The code/preview ref is not part of this identity unless independently needed for rendering.

Before switch/sync/publish, force-flush pending collaboration and wait for an acknowledgment that content reached the revision-aware Source store. If persistence fails, stay on the current branch and show Retry; do not optimistically switch. A Yjs connection/sync event alone is not that acknowledgment.

For sync/publish the server also establishes a write barrier, drains or rejects outstanding saves across *all* affected rooms, and pins the resulting revisions. During publish briefly barrier both source branch and default, including direct HTTP writes. Ordinary accepted writes must complete before the pinned snapshot; later writes get a retriable error. During conflict resolution keep the source branch locked, not default. Completing sync checks whether default moved.

On tree replacement, close/reset affected collaboration rooms, increment epochs, and reconnect from committed Source content. Server-side fencing must reject delayed old-room persistence; disconnecting one browser or merely disabling its editor is insufficient. Coordinate this with the collaboration service in the first spike. A single demo editor can reduce test/setup complexity, but not justify sharing rooms or allowing old rooms to overwrite merged content.

### Browser context

Use an explicit route such as `/canvas?contentBranch=b123#/{org}/{site}/about` and preserve it in browse/edit links. Keep existing `ref` untouched. URL state wins; absent `contentBranch` means default. Avoid global localStorage selection so changing branch in one tab does not redirect another tab's writes.

Switch sequence:

1. Capture the old context; block new edits/navigation actions and flush writes to that captured context.
2. If successful, disconnect/destroy the old provider, view, undo history, and pending async work.
3. Validate destination branch, update URL/context, clear branch-sensitive listing/document caches, selection, pagination, and dialogs.
4. Reload listing/document and join the new room. Ignore stale responses using a context generation token.
5. If the path is absent, show “This document does not exist in this branch,” with browse/create actions. Do not create it automatically or fetch it from default.

Capture immutable context when starting every save/request; never consult a mutable global active branch after an `await`. Branch changes on browser Back/Forward follow the same flush/teardown sequence. A pending sync is discoverable after reload and can be resumed.

Within canvas, add `canvasBus.contentBranchRequest` / `contentBranchState` (and operation-specific request/state channels if needed); do not replace the existing preview `branchState` or add ad-hoc DOM events. For shared panel/chat or quick-edit iframe boundaries, inspect and use the owning da-nx `PANEL_EVENT`/`CHAT_EVENT` or `MESSAGE_TYPES` contract, extending payloads rather than inventing another protocol. Those dependency contracts were not inspected in this design pass and must be checked before implementation. The PoC can avoid new boundary messaging by keeping branch controls and resolution in the host and fully reloading the iframe on branch changes; unsupported live preview must be visibly disabled rather than showing default content as branch content.

## 8. User interface

### Branch selector

Only when branching is available, show a persistent site-level branch pill in browse and editor: **Default · main** or **Branch · campaign**. The selector lists existing branches, marks default, and offers Create from Default. Creation shows source default and selects the new branch after success. Loading/error/permission states block editing only when an explicit branch needs validation, not when optional discovery is pending on the ordinary default path. Unsupported providers show the existing UI unchanged; discovery failure does not display a blocking editor error unless an explicit branch was requested.

### Branch toolbar

For a non-default branch show **Changes (n)**, **Sync from default**, and **Publish to default**. When default advances, show “Default has new changes — sync required.” Metadata is advisory: refresh on focus and before operations; the server remains authoritative. Default shows no sync/publish branch actions.

Label content publishing explicitly **Publish to default** and success **Changes merged into default — not published to live**. Do not reuse the existing AEM Publish button for this action.

### Changes view

Compare **current default → current branch**, clearly label direction, and pin both revisions. List added, modified, and deleted paths, with side-by-side escaped source text for HTML; this is sufficient for the demo and avoids executing document HTML. Added/deleted files show an absent side. Offer Refresh when either revision changes; do not mix revisions while paging or viewing a detail.

This comparison is not the same as “what publish will change” when the branch is stale: it includes default-only changes that the branch has not synced yet. Mark such entries using comparison to B, or show an explicit stale-comparison banner. After sync, the default-to-branch diff is the publish set. Publish confirmation is available only against an up-to-date pinned comparison and includes all document creates/edits/deletes. No partial selection in the PoC.

### Conflicts view

Show a persistent “Sync needs resolution” banner and a list of conflicted paths with kinds (edited on both sides, deleted on default, deleted on branch, added on both, namespace collision). Detail shows Base, Branch, and Default, explicit absent/deleted states, and resolution controls. Manual HTML editing uses a source-text editor, with validation sufficient to reopen the result in the document editor; do not inject untrusted HTML into the app DOM.

Show resolved/total counts. Enable Complete sync only after all conflicts are resolved. Completing reports success and offers Publish to default; do not publish automatically. If default moved again, explain that restart is needed and prior choices remain viewable but must be redone. Cancel leaves original branch content intact. Unsaved resolution text gets a navigation warning.

## 9. Implementation plan

Each milestone is demo-sized and independently verifiable. Proposed modules below are **PROPOSED**, not existing source files.

### Milestone 0 — contracts and feasibility gate

1. Confirm ownership and actual repositories for Source API providers, native Branching API, gateway, collaboration service, shared nx2 client, and da-nx boundary contracts. Identify the one native-branching provider; leave the others unchanged.
2. Register its optional Branching client, implement capability discovery, and pick a demo site. Prove missing modules/routes and unavailable discovery leave default editing unchanged on other providers. Enable branching only when scoped Source persistence and collaboration support are both present.
3. Prove an atomic site-ref update, branch-scoped GET/save, durable flush acknowledgment, and fenced room replacement. Audit all write routes to the demo site; shared/unversioned writes must be integrated or blocked.
4. Seed/import the default tree with writers paused. Define a manual demo reset fixture rather than a production migration or garbage collector.

Exit: a minimal two-room experiment cannot leak edits or resurrect old content after a tree replacement. If this fails, stop and resolve backend coordination; do not compensate with UI-only restrictions.

### Milestone 1 — optional Branching API and minimal scoped Source extension

1. Map the native provider's branches/revisions/atomic primitives to the design; implement the reference store only if needed. Keep this internal and do not change other providers' storage.
2. Implement Branching API list/create/get endpoints separately from the native Source GET/HEAD/list/create/save/delete selector extension, with pagination tied to a revision.
3. Implement the optional Branching client and explicit native Source adapter; update actual dependency plus local fixtures. Preserve default signatures and omit branch context on default requests.
4. Add capability checks and local rejection of explicit branch context for unsupported providers, plus server rejection for unsupported native branch operations. Verify unsupported providers receive exactly their existing requests.

Exit: API tests show branch creation is a snapshot of default, isolated create/edit/delete, persistence across reloads, direct-default edits, and no leakage of later default changes before sync. Compatibility tests show other Source providers still work without a Branching API or any new response fields.

### Milestone 2 — app context and editor isolation

1. Add **PROPOSED** `blocks/shared/content-branch-context.js` for validated, immutable per-navigation context and URL helpers, without introducing a second canvas event mechanism.
2. Add the branch selector and default/non-default action gating to browse and canvas; thread context through listing, pagination, document creation/deletion, links, metadata, and direct fetches.
3. Update collaboration identity/persistence and flush/barrier/epoch handling. Integrate both editor entry paths or block the unsupported fallback.
4. Implement switch cancellation, stale-response rejection, cache invalidation, absent-document behavior, and no-preview fallback. Add canvas channels using existing event patterns.

Exit: two tabs in different branches can edit the same path without seeing each other's changes; switching/reloading preserves the correct content and cannot write through the previous context.

### Milestone 3 — Changes view

1. Implement immutable revision-pinned default-to-branch diff summary/detail endpoints in the Branching API, not as required Source features.
2. Add **PROPOSED** `blocks/shared/branch-changes/` for the path list and escaped side-by-side HTML source view.
3. Represent additions/deletions and stale-default comparisons accurately; handle empty states, refresh, and deleted current documents.

Exit: Changes matches the trees through edits, create/delete, sync state, and concurrent default edits without misleading users about the publish set.

### Milestone 4 — sync and resolution

1. Implement **PROPOSED backend** merge service using B/L/D equality rules and full-tree namespace validation; unit-test it as a pure function first.
2. Add persisted sync sessions, candidate trees, revisioned resolution updates, cancel/restart, write barriers, and atomic completion with default-revision recheck.
3. Add **PROPOSED** `blocks/shared/branch-conflicts/` for conflict list, three-way source view, choices/manual result, and completion/resume UI.
4. Reinitialize affected collaboration state after successful sync and release barriers safely after failure/cancel.

Exit: disjoint documents sync automatically; edit/edit, edit/delete, delete/edit, add/add, and structural collisions require deliberate choices; no unresolved candidate is exposed as ordinary branch content.

### Milestone 5 — publish and demo acceptance

1. Implement all-or-nothing publish with expected revisions, strict up-to-date check, target permission validation, room fencing, and idempotent retry.
2. Add confirmation, success state, and stale-publish → explicit-sync UI flow. Reset branch base/tree after success; retain the selected branch.
3. Run focused unit/integration/E2E scenarios below, including lost responses and concurrent default mutation. Rehearse on resettable fixture content.

Exit: one repeatable stakeholder walkthrough demonstrates the entire workflow without database edits, browser-console operations, or accidental AEM delivery publishing.

## 10. Validation matrix

| Layer | Required checks |
| --- | --- |
| Merge unit tests | Unchanged; branch-only/default-only change; identical concurrent change; edit/edit; edit/delete; delete/edit; add/add identical and different; mutual delete; create then delete; namespace collision. |
| Optional capability / compatibility | Each non-branching provider and old client module; missing module, `supported:false`, `404/501`, timeout/5xx, forbidden/incompatible discovery; default CRUD/editor/collaboration unchanged and not blocked by discovery; no branch controls or extra request fields; explicit branch rejected locally without an unscoped request; capability cache isolated by provider/site. |
| Source integration | Snapshot isolation across default edits; branch-local CRUD/list/HEAD; unknown branch does not fall back; pagination revision/branch binding; default-only branch creation; permission denial with no partial result; conditional save/delete/recreate. |
| Publish integration | Stale default rejects even disjoint edits; no side effects on rejection; all creates/edits/deletes apply atomically; target branch cannot be overridden; default cannot publish/sync; branch stays usable and Changes becomes empty. |
| Sync integration | Default-only changes imported; branch-only changes preserved; resolutions durable and reversible before completion; cancel leaves tree/base unchanged; default advances mid-resolution; unresolved completion rejected; repeated completion/key replay safe. |
| Collaboration | Same path in different branches has separate Yjs/awareness/undo; durable flush failure blocks switch; late saves rejected after epoch change; remote room writes fenced during publish; delete/recreate cannot be resurrected by an old room. |
| UI/E2E | Create/select/reload/switch/back/forward; absent document on target; stale request responses ignored; default hides actions; Changes direction and absent sides; conflict choices/manual text; session resume/restart; unsupported tools blocked. |
| Failure injection | Two simultaneous publishes; default edit racing publish; network loss after commit and idempotent retry; blob staging failure; partial permission failure; stale second-tab resolution; server restart with an open session; Branching API disappears while default is open versus while a branch is selected; no scoped request ever retries against default or another provider. |

Use repository-native checks when implementing: targeted Web Test Runner tests under the existing `test/unit` layout before the full `npm test` suite; `npm run lint:js` / `npm run lint:css` for touched code/styles; add a focused Playwright flow under `test/e2e`. Backend and shared-client repositories need their own contract and persistence tests. Package scripts are defined at `package.json:59-75`.

This change is design documentation only; no implementation or runtime validation is claimed. Codelore tools were not available in this session, so no Codelore safeguard pass is claimed.

## 11. Stakeholder demo script

1. Open Default and create branch `campaign`. Show it starts with the same documents.
2. In `campaign`, edit one document, create another, and delete a third. Show all three in Changes.
3. Switch to Default: original content remains, new document is absent, deleted document still exists. Edit a different default document.
4. Return to `campaign`: the default-only edit is not yet visible. Try Publish to default; it is rejected with sync required.
5. Sync: the disjoint default change is imported; branch changes remain. Show updated Changes.
6. Edit the same document differently on Default and `campaign`; attempt publish, then sync. Show the conflict with Base/Branch/Default and resolve using an edited result. Complete sync.
7. Publish to default, switch to Default, and verify edits, creation, and deletion. Return to `campaign`: Changes is empty and the branch remains available.
8. Select Default and show that branch Sync/Publish actions are unavailable while direct editing and branch creation remain possible. Clarify that nothing was published to the public site.
9. Open a site on a non-branching Source provider: show today's browse/edit/create/delete experience with no branch controls. Simulate optional capability discovery being unavailable on the native provider: default editing still works, while an explicit branch link shows a recoverable error rather than writing to default.

## 12. Tradeoffs and follow-up

- Full manifests, site-level serialization, whole-document conflicts, and source-text diffs deliberately favor correctness and demo clarity over scale and polish.
- Locking a branch during resolution is restrictive but avoids implementing a rebase of concurrent branch edits onto an in-progress candidate.
- Requiring a fresh sync after every default advance is stricter than conflict-only publishing and intentionally matches the requested fast-forward-only workflow.
- A separate optional Branching API avoids imposing branch lifecycle, historical reads, sync, or merge on every Source provider. It does not eliminate the native provider's need for branch-scoped document I/O and shared atomic coordination.
- The non-negotiable costs on the one native provider are the scoped Source extension and collaborative persistence isolation. Omitting either changes the feature into a misleading mock. Other providers require no branching implementation and retain their existing single-default behavior.
- Before production: durable/distributed transaction and recovery design, migration/backfill, broader content-type and media isolation, permission model review, scalable diff/storage/GC, structural HTML merges, accessibility and rich diff polish, auditing, observability, quotas, branch lifecycle, and delivery/preview integration.
