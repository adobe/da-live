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

### Edge Delivery
If you wish to do any testing that involves Edge Delivery, please note the following:

1. Your local environment will be using Stage Adobe Identity. 
1. Your local/stage project will need to have a stage compatible fstab entry. Hostname: `stage-content.da.live`
1. Edge Delivery cannot validate a Stage Adobe Identity. Your stage project should have auth turned off: `requireAuth: false`

### Canvas library access
Library sheets, block variants, templates, and previews use the shared DA preview proxy
for same-org sources, including other sites, requesting a session before loading.
Only proxy fetches include credentials; cross-org sources load directly.

For access errors, check DA sign-in and site access (same-org), or sign in on the source
preview with AEM Sidekick (cross-org AEM), then reopen the library. Access failures are
not cached.

Validate protected same-org and cross-org libraries, including matching proxy and
`/gimme_cookie` origins. Inserted images retain public source URLs, paths, queries, and
fragments; generated AEM `./media_*` references use the site root.

## Additional details
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
