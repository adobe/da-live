# Canvas library access

## Content and previews

Canvas and edit mode load built-in library sheets, variants, and templates from
authenticated DA Admin `/source` endpoints. Recognized AEM, HLX, DA Content, and DA
preview URLs resolve to the underlying organization/site source, including
cross-org libraries. HTML sources use `.html`, not composed preview HTML, so
section metadata survives template insertion. JSON sheet paths retain `.json`.
Source content is independent of the code branch.

An Admin 404 falls back to the original URL for AEM-only libraries. Other errors,
including 401/403, do not fall back. Unrecognized external hosts are fetched
directly. DA bearer tokens are only attached to allowlisted origins; library data
does not require a preview cookie or credentialed cross-origin AEM requests.

Item preview iframes use the resolved canvas branch. Same-org previews use the DA
proxy; cross-org item previews retain the pre-proxy behavior of opening a rendered
`<canvas-branch>--<site>--<org>.aem.page` URL, even when the item's content URL is
`content.da.live` or `aem.live`. They never request a DA proxy session or DA preview
status for the other organization. This is separate from configured third-party
extensions, whose cross-org URLs remain unchanged.

## Sessions and access failures

Item previews share one successful session promise per proxy
origin and IMS token. The origin includes organization, site, branch, and
stage/production environment. Concurrent requests wait for the same cookie exchange.
Missing tokens and unsuccessful exchanges are not cached. A preview 401/403
invalidates the session and triggers at most one authenticated retry; a second
refusal invalidates the replacement session so reopening can try again.

Before each same-org item preview navigation, a credentialed, non-cached `HEAD`
request checks that the browser still has access. This uses the same bounded
refresh/retry path if a cookie has expired or been cleared while the IMS token
stays unchanged. Healthy previews reuse their session rather than exchanging a
cookie again. Persistent denial is shown in the panel/modal without loading an
unauthorized iframe. Cross-org previews do not make this request.

Access-denied library results are not cached as successful empty libraries. Check
DA sign-in and access to the source organization/site. For an AEM-only fallback,
open the source preview and sign in with AEM Sidekick, then reopen the library.

## Saved image URLs

Images from DA source are saved as absolute content URLs with the source org/site
prefix, not as branch-specific AEM, Admin, or authenticated proxy URLs. Root-relative
images have that prefix restored; `data-da-img-host` preserves a stored production
or stage content host. Relative directories, queries, fragments, and external
absolute image URLs are retained. AEM HTML keeps its public AEM source origin,
including the site-root convention for generated `./media_*` references. Block
variants retain their thumbnail sizing; templates are not resized.
Restoring a recorded content host also restores HTTPS and removes any local
development port; only the document/image path and URL components are retained.

## Edit-mode compatibility

Both editors share `blocks/shared/library-source.js` for Admin-first data fetching.
Edit mode retains its index-level fallback hint, so items from an AEM-only index
skip the Admin attempt. Configured extension iframes continue to use the shared
preview-proxy module; this data-loading change does not reroute those extensions.
