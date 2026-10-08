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
Built-in library sheets, block variants, template insertion, and preview iframes use
the shared DA preview proxy for content in the current editor's organization,
including libraries hosted by another site in that organization. The proxy session
is requested before loading content, and only proxy fetches include credentials.

Cross-organization sources keep their original URLs and do not request a DA proxy
session. If access is denied, verify DA sign-in and site access for same-org libraries;
for cross-org AEM libraries, open the source preview and sign in with AEM Sidekick,
then reopen the library. Access failures are not cached as a successful empty library.

When validating library routing, check both a protected same-org library and a
cross-org library. Verify the sheets, variant HTML, template insertion, and preview
iframe requests, including the matching proxy and `/gimme_cookie` origins. Inserted
image URLs should retain their public content origin rather than the proxy origin.
Template image paths resolve against the public document URL, preserving directories,
query strings, and fragments. Only generated AEM `./media_*` references use the site root;
direct DA-content templates retain the organization/site path in relative image URLs.

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
