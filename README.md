# Edge Delivery Authoring
This repo provides the author experience for https://da.live.

## Deployment configuration

`scripts/deployment.js` is the single runtime override file. Its empty default
export preserves Adobe's deployment. `scripts/config.js` synchronously merges
overrides with defaults using native ES modules; no build or configuration fetch
is required. This configures deployment locations, not URL routing: existing
`branch--site--org` hostnames and document paths remain unchanged. For example:

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
  nx: {
    owner: 'customer-org',
    repo: 'customer-nx',
    // Optional fixed runtime directories; no placeholders.
    url: 'https://assets.example.net/nx',
    urlV2: 'https://assets.example.net/nx2',
  },
  ims: { clientId: 'customer-authoring' },
};
```

DA admin, content, collab and preview endpoints default to the corresponding
subdomains of `da.domain`, with `stage-` prefixes for stage. Local endpoints remain
unchanged. `da.services` accepts `admin`, `content`, `collab`, `preview` and `etc`,
each with individual environment overrides; omitted values keep their defaults.
The `etc` default remains `https://da-etc.adobeaem.workers.dev` (prod) and
`http://localhost:8787` (local). Preview values are hostname suffixes (with an
optional port), collab values are WebSocket URLs, and other service values are
origins. Use origins without paths, queries, fragments or trailing slashes.
Independent application and service domains are supported; they need not share
a suffix.

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

`da.owner`/`da.repo` identify this app's conventional branch previews for
preview-message validation. Additional authoring origins can be listed explicitly
in `da.previewOrigins`; only trust origins wholly controlled by the deployment.

`nx.owner`/`nx.repo` select the NX repository independently. Without fixed URLs,
existing CDN, branch and localhost behavior is retained. `nx.url` and `nx.urlV2`
optionally select fixed V1/V2 runtime directories, without trailing slashes,
queries or fragments. They do not interpolate branch names. If only `nx.url` is
supplied, V2 appends `2`; supply `nx.urlV2` when the directories differ.
`?nx=local` still overrides both.

Configure NX and remote services separately; this file does not change their
settings, DNS, TLS, CORS, cookies or authentication. The public IMS client ID
must be registered for the chosen app domains; providers and scopes are unchanged.
Arbitrary site/proxy URL templates, path-mounted routes and static single-site
domain parsing are outside this configuration-only change.

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

## Testing

See [TESTING.md](TESTING.md) for unit, end-to-end and CI details.

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
