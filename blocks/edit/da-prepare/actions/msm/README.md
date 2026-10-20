## Multi-Site Manager (MSM)
MSM enables base/satellite site relationships where satellite sites inherit content from a base site and can optionally override individual pages.

### Configuration
MSM is configured via an `msm` sheet in the org-level DA config (`/config#/{org}/`). Each row defines a base-satellite relationship:

| base | satellite | title |
| :--- | :--- | :--- |
| `my-base` | | Base Site |
| `my-base` | `satellite-1` | Satellite Site 1 |
| `my-base` | `satellite-2` | Satellite Site 2 |

- The `base` column identifies the base site repo name.
- Rows with an empty `satellite` column define the base site entry and its display title.
- Rows with a `satellite` value define satellite sites that inherit from that base.

### Features

**Base site view** — when editing a page on the base site, the MSM panel shows all satellites split into inherited and custom (override) lists. Available actions:
- **Preview / Publish** — push the base page to inherited satellite sites via AEM.
- **Cancel inheritance** — copy the base page to a satellite, creating a local override.
- **Sync to satellite** — push updates to custom satellites via merge or full override.
- **Resume inheritance** — delete the satellite override so it falls back to the base. Automatically previews/publishes the page from the base based on the satellite's prior AEM status.

Custom satellites always show an "Open in editor" link so base authors can inspect overrides.

**Satellite site view** — when editing a page on a satellite site, the MSM panel shows the base site and offers:
- **Sync from Base** — pull latest base content via merge or full override.
- **Resume inheritance** — delete the local override. Automatically previews/publishes from the base based on prior AEM status.