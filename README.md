# Edge Delivery Authoring
This repo provides the author experience for https://da.live.

## Deployment configuration

`scripts/deployment.js` is the single runtime override file. Its empty default
export preserves Adobe's deployment. `scripts/config.js` synchronously merges
overrides with defaults using native ES modules; no build or configuration fetch
is required. `scripts/urls.js` owns URL building, parsing and origin validation;
components call helpers such as `getSiteUrl('live', { org, site, path })` rather
than assembling deployment hostnames. For example:

```js
export default {
  da: {
    domain: 'author.example.com',
    pageDomain: 'author-test.example.com',
    owner: 'customer-org',
    repo: 'customer-author',
    services: {
      admin: { prod: 'https://author-api.example.net' },
    },
  },
  aem: {
    previewHost: 'customer.page',
    liveHost: 'customer.live',
    reviewHost: 'customer.reviews',
    adminOrigin: 'https://admin.customer.page',
    apiOrigin: 'https://api.customer.live',
    toolsOrigin: 'https://tools.customer.live',
    adminOrigins: [],
    legacyHosts: [],
  },
  nx: { owner: 'customer-org', repo: 'customer-nx' },
  ims: { clientId: 'customer-authoring' },
};
```

DA admin, content, collab and preview endpoints default to the corresponding
subdomains of `da.domain`, with `stage-` prefixes for stage. Local endpoints remain
unchanged. `da.services` accepts `admin`, `content`, `collab`, `preview` and `etc`,
each with individual environment overrides; omitted values keep their defaults.
The `etc` default remains `https://da-etc.adobeaem.workers.dev` (prod) and
`http://localhost:8787` (local). Preview values are hostnames (with an optional
port) or complete URL templates as described below, collab values are WebSocket
URLs, and other service values are origins. Use origins without paths or trailing
slashes for non-preview services.

The alternate app at `da.pageDomain` uses independently derived endpoints,
overridable through `da.pageServices` with the same shape. Primary service
overrides do not affect the alternate app. Existing query/localStorage selectors
(`da-admin`, `da-content`, `da-collab`, `da-live-preview`, `da-etc`) still select
configured environments, never arbitrary endpoint URLs; `reset` clears them.

AEM content suffixes are independent of admin, API and tools origins. Adobe
defaults retain `admin.hlx.page` and legacy `hlx.page`/`hlx.live` recognition.
`aem.adminOrigins` lists additional trusted AEM admin origins (default:
`https://admin.aem.live`); `aem.legacyHosts` lists additional content suffixes.
These arrays can be replaced with empty arrays for an isolated deployment.
Configured service origins form the bearer-token allowlist; do not point them
at untrusted servers.

`da.owner`/`da.repo` identify this app's branch previews for preview-message
validation; `nx.owner`/`nx.repo` select the NX repository independently. Production
still uses `/nx` (or `/nx2`), and `?nx=local` still uses localhost. Configure the
NX deployment itself separately; this file does not change settings inside NX
or remote services. The public IMS client ID must be registered for the chosen
app domains; authentication providers and scopes are unchanged.

### Independent domains and path-based routes

Complete URL templates take precedence over content suffixes and Sidekick hosts.
For example, the following override uses unrelated app, site, proxy and NX URLs:

```js
export default {
  da: {
    domain: 'author.customer.example',
    services: {
      preview: {
        prod: 'https://proxy.example.net/author/{org}/{site}/{branch}',
        stage: 'https://test-proxy.example.net/author/{org}/{site}/{branch}',
      },
    },
  },
  aem: {
    liveUrl: 'https://publish.example.net/sites/{org}/{site}/{branch}',
    previewUrl: 'https://preview.example.net/render/{org}/{site}/{branch}',
    reviewUrl: 'https://review.example.net/{org}/{site}/{snapshot}/{branch}',
    ueUrl: 'https://ue.example.net/{org}/{site}/{branch}',
    uePageUrl: 'https://ue-test.example.net/{org}/{site}/{branch}',
  },
  nx: {
    url: 'https://assets.example.net/{branch}/legacy-runtime',
    urlV2: 'https://other-assets.example.net/runtime-v2/{branch}',
  },
};
```

Site/proxy templates accept `{org}`, `{site}`, `{branch}` and `{snapshot}`;
NX templates accept `{owner}`, `{repo}` and `{branch}`. Identifiers contain
letters, digits, dots, underscores or hyphens, but cannot be `.` or `..`.
Templates must be HTTP(S) base URLs without credentials, queries or fragments.
Document paths, queries and fragments are appended separately, preserving mount
paths. Parsing uses the same templates; routes must identify the org/site, or
the caller must supply that context for a single-site URL.

`nx.url` and `nx.urlV2` are complete runtime directory URLs, independent of site
routes. Without overrides, existing CDN, branch and localhost behavior is
unchanged. If only `nx.url` is supplied, the V2 default appends `2`; supply
`nx.urlV2` when the directories differ. `?nx=local` still overrides both.

`da.previewOrigins` optionally lists additional trusted authoring-app origins for
preview messages. Conventional hostname-based branch previews of `da.owner` /
`da.repo` are recognized automatically. Path-based authoring previews sharing an
origin require explicit trust: paths do not isolate browser origins. Only list
origins wholly controlled by the deployment, and register them with the preview
service as needed. Site/proxy servers must independently support the configured
routes, CORS, cookies and authentication; this file does not configure them.

Keep deployment overrides when syncing upstream. This browser-visible file must
never contain credentials or secrets. `fstab.yaml` and `tools/sidekick/config.json`
are separate static consumers and are **not** rewritten by runtime configuration.

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
