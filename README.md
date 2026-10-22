# Edge Delivery Authoring
This repo provides the author experience for https://da.live.

## Developing
### Run
1. Clone this repo to your computer.
1. Install the [AEM CLI](https://github.com/adobe/helix-cli): `npm install -g @adobe/aem-cli`
1. In a terminal, run `aem up` this repo's folder.
1. Start building.

### Authentication
DA requires an Adobe Identity. You will need a _Stage_ Adobe Identity to work on `localhost` or `aem.page`.

#### DA to IMS environment mapping
| Domain | IMS Tier |
| :--- | :--- |
| `localhost` | IMS Stage |
| `aem.page` | IMS Stage |
| `aem.live` | IMS Prod |
| `da.live` | IMS Prod |

### Content
Local development will use DA's stage content repository. If you don't have any content or configs there, make some.

### Admin & Collab
You will want to point your local to stage admin & collab or run these services locally. We recommend using stage.

1. Stage - `localhost:3000/?da-admin=stage&da-collab=stage`
2. Local - `localhost:3000/?da-admin=local&da-collab=local`
3. Reset - `localhost:3000/?da-admin=reset&da-collab=reset`

#### NX

In order to also use the local `nx` scripts, run `npm run local` in the `da-nx` checkout and then enable it via: `localhost:3000/?nx=local`

**Note:** these values will persist in local storage until you reset them.

### Offline collaboration mode

Both canvas and the legacy `/edit` editor support explicitly configured local
editing, backported from
[adobe/helix-azure-da-live@6b74975](https://github.com/adobe/helix-azure-da-live/commit/6b74975ef40d91a89c90deed652f2d915e1b06b7).
Collaboration remains enabled by default. To use offline mode, change the shared
JavaScript setting in `blocks/shared/constants.js`:

```js
export const OFFLINE_MODE = true; // Default: false.
```

The setting supplies the default `offline` property for both editor hosts.
There is no automatic detection, connectivity-based fallback, or runtime toggle.
The low-level canvas and legacy `initProse()` APIs remain connected by default
and accept an explicit `offline: true` option. Canvas also accepts `initialDoc`
(a ProseMirror document) and `initialMetadata`; its host handles source loading
and persistence. Legacy initialization requires the fetched HTML `doc` and uses
`sourcePath` (the canonical `/org/site/path.html`) for direct saves.

Offline mode loads HTML from the source API, edits a local Yjs document without
WebSocket or cross-tab synchronization, and autosaves after one second of
inactivity. Save status and retry are shown in the header/title. Versions,
Prepare, and preview/publish wait for pending saves. Failed saves prevent hash
navigation from replacing the current editor; leaving with pending edits triggers
the browser's warning.

This is not disconnected editing: authentication, source reads/writes, comments,
and asset uploads still need their services. There is no durable local recovery
after closing/reloading, and unload warnings do not guarantee a final save.
Comments use their existing API without live remote updates. Multiple authors
or tabs must not edit the same document concurrently: direct saves have no
conflict resolution.

### Edge Delivery
If you wish to do any testing that involves Edge Delivery, please note the following:

1. Your local environment will be using Stage Adobe Identity. 
1. Your local/stage project will need to have a stage compatible fstab entry. Hostname: `stage-content.da.live`
1. Edge Delivery cannot validate a Stage Adobe Identity. Your stage project should have auth turned off: `requireAuth: false`

## Additional details
### Version history in Experience Workspace
The Versions panel refreshes automatically after the current page is successfully
previewed or published and its history version is saved. The Refresh icon reloads
history on demand, including versions created by other authors. Both preserve the
current filter and review state and do not replace document content.
Refresh keeps keyboard focus while loading and ignores repeated manual activation.
Automatic version-created notifications still refresh history during an existing request.

The automatic refresh consumes Nexter's `VERSION_EVENT.CREATED` contract from
`nx2/utils/version-events.js`, through the canvas version bridge.

### Recommendations
1. We recommend running `npm install` for linting.

### Dependencies
DA has several libraries / dependencies that are built adhoc.

```shell
# Build Lit
npm run build:da-lit

# Build Prose / YDoc
npm run build:da-y-wrapper
```

Additional details can be [found here](https://github.com/adobe/da-live/wiki/Dependencies).

Canvas library behavior is documented in [docs/canvas-library.md](docs/canvas-library.md).
