# Canvas library access

## Content and previews

Canvas routes built-in library sheets, variants, and templates through the shared DA
preview proxy when they belong to the editor's organization, including other sites
in that organization. Cross-org content fetches retain their original URLs. Only
proxy fetches include credentials.

Item preview iframes use the resolved canvas branch. Same-org previews use the DA
proxy; cross-org item previews retain the pre-proxy behavior of opening a rendered
`<canvas-branch>--<site>--<org>.aem.page` URL, even when the item's content URL is
`content.da.live` or `aem.live`. They never request a DA proxy session or DA preview
status for the other organization. This is separate from configured third-party
extensions, whose cross-org URLs remain unchanged.

## Sessions and access failures

Library fetches and item previews share one successful session promise per proxy
origin and IMS token. The origin includes organization, site, branch, and
stage/production environment. Concurrent requests wait for the same cookie exchange.
Missing tokens and unsuccessful exchanges are not cached. A content 401/403
invalidates the session and triggers at most one authenticated retry; a second
refusal invalidates the replacement session so reopening can try again.

Before each same-org item preview navigation, a credentialed, non-cached `HEAD`
request checks that the browser still has access. This uses the same bounded
refresh/retry path if a cookie has expired or been cleared while the IMS token
stays unchanged. Healthy previews reuse their session rather than exchanging a
cookie again. Persistent denial is shown in the panel/modal without loading an
unauthorized iframe. Cross-org previews do not make this request.

Access-denied library results are not cached as successful empty libraries. For
same-org failures, check DA sign-in and site access. For cross-org AEM failures,
open the source preview and sign in with AEM Sidekick, then reopen the library.

## Saved image URLs

The preview proxy does not serve all HTML the same way. Extensionless pages are
composed from DA source, while `.html` and `.plain.html` resources are forwarded
to AEM (see `adobe/da-universal`'s `src/handlers/get.js`).
This distinction is based on the routed request, including when a `content.da.live`
URL ending in `.html` or `.plain.html` is rewritten to the proxy. Unproxied
cross-org DA-content HTML retains DA-source image handling.

Images from DA source are saved as absolute content URLs with the source org/site
prefix, not as branch-specific AEM or authenticated proxy URLs. Root-relative
images have that prefix restored; `data-da-img-host` preserves a stored production
or stage content host. Relative directories, queries, fragments, and external
absolute image URLs are retained. AEM HTML keeps its public AEM source origin,
including the site-root convention for generated `./media_*` references. Block
variants retain their thumbnail sizing; templates are not resized.
Restoring a recorded content host also restores HTTPS and removes any local
development port; only the document/image path and URL components are retained.

## Edit-mode compatibility

This change is intentionally limited to canvas built-in library loading. Edit mode
already uses a different content-first path: `daFetchLibrary` and `getBlockVariants`
in `blocks/edit/da-library/helpers/` rewrite AEM sources to `CON_ORIGIN` and fall back
to AEM on 404. Its built-in source URLs therefore stay canonical rather than being
rewritten as extension iframe URLs by `useProxy`. That condition does not mean
edit mode simply loads every built-in library directly from AEM.

Changing edit mode's content-first/fallback contract is not needed for the canvas
protected-library fix. Both editors continue to use the shared preview-proxy
module for configured extensions; their built-in content loaders remain separate.
