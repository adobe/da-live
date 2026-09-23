# Browse status plugins

A plugin can contribute a **status** to any page, sheet or media item in the browse list. The host renders it as one cell in the item's details drawer, beside Version, Last Modified By, Previewed and Published, and puts the plugin's richer data behind a click popover on the cell's icon.

Nothing is added to the collapsed row, and nothing is fetched until a row is expanded.

```
status-registry/
  status-registry.js   Discovery, prefilters, module loading, the failure table
  README.md            This file
```

The host code that consumes it lives in `../da-list.js` (builds one registry per list) and `../../da-list-item/da-list-item.js` (asks it on expand, renders the cell).

---

## 1. Declare the plugin

Add a row to the site's or org's `library` config sheet:

| title | surface | module | label | icon | kinds | requires | ref |
|---|---|---|---|---|---|---|---|
| Request Publish | status | `/tools/plugins/request-for-publish/plugin.js` | Workflow | workflow | page | | |

| Column | Required | Meaning |
|---|---|---|
| `title` | yes | Plugin identity. Normalized into a name (trimmed, lowercased, spaces to hyphens); two status rows with the same name collide and the first wins. |
| `surface` | yes | `status`. Rows for any other surface are ignored here. |
| `module` | yes | ES module URL. A path starting with `/` is resolved against `https://<ref>--<site>--<org>.aem.live`, or `http://localhost:3000` when running with `?ref=local`. An absolute URL is used as is. |
| `label` | no | The drawer cell's heading, where PREVIEWED and PUBLISHED sit. Falls back to `title`. There is no host default word. |
| `icon` | no | Fallback icon for statuses that do not name their own. A curated name (see below), never a URL. |
| `kinds` | no | Comma-separated item kinds the plugin is asked about: `page` (`.html`), `sheet` (`.json`), `media` (everything else). Default `page`. |
| `requires` | no | `write` means the host does not call the plugin at all for users without write access to the folder. Absent means no gate. |
| `ref` | no | Branch trust gate. Default `main`; a row naming another branch is only used when the browse URL carries the same `?ref=`. |

`path`, `experience` and `format` are ignored on a status row. There is no `placement` column.

**Both surfaces, one module.** A plugin that also contributes an action-bar item writes **two rows pointing at the same `module` URL**. The module is imported and `init`ed once per module URL, so the second row costs nothing but a line of config.

---

## 2. Write the module

```js
export default async function init({ context, token }) {
  // context: { org, site, path, ref } - `path` is the /org/site this list is browsing.
  // Called once per module URL, and only after ref, kinds and requires have passed.
  return {
    async getStatus(item, ctx) {
      // item: { path, previewPath, sitePath, name, ext, date }
      // ctx:  { org, site, path, permissions, token }
      const row = await lookUp(item.sitePath, ctx.token);
      if (!row) return null;                      // "no status" is the NORMAL case
      return {
        state: 'pending',                         // tints the icon
        label: 'In Review',                       // SHORT. Long text belongs in detail.
        icon: 'clock',                            // optional, curated name
        detail: [                                 // optional, shown in the popover
          { label: 'Requested by', value: row.requester },
          { label: 'Approver', value: row.approver },
        ],
        href: '/apps/publish-requests-inbox',     // optional, shown in the popover
      };
    },
  };
}
```

### The two rules authors get wrong

1. **`getStatus` is called on expand, so it may fetch - but it is called once per expand and there is no host cache.** The host refetches every time the drawer opens and drops the result on collapse. Cache inside your module if you need to; the host will not do it for you, and it offers no invalidation API.
2. **Returning `null` is normal and renders nothing.** Most pages have no status. `null` is not an error, is not logged, and adds no cell to the drawer. Do not return a placeholder status to say "nothing here".

### The status object

| Field | Required | Meaning |
|---|---|---|
| `state` | yes | One of `neutral`, `pending`, `positive`, `negative`. Picks the icon tint and nothing else. Anything else is coerced to `neutral`. |
| `label` | yes | Short. "In Review", "Approved". It is the cell's own line of text. |
| `icon` | no | A curated icon name. Unknown names fall through to the row's `icon`, then to the host default `workflow`. |
| `detail` | no | `[{ label, value }]`. Its presence is what turns the icon into a clickable popover trigger. No cap on rows; the popover scrolls past ~280px and clamps a long value to three lines. |
| `href` | no | A site-relative path or an `https:` URL. Anything else is dropped. Rendered as a link at the foot of the popover. |

### The three path forms

`item` carries three spellings of the same page, because a plugin cannot guess which one a host means and a wrong guess shows up as "no status" on every row with no error anywhere:

| Field | Example |
|---|---|
| `path` | `/bpauli/frescopa/tea2.html` - the DA source path, with extension |
| `previewPath` | `/bpauli/frescopa/tea2` - extensionless, org- and site-prefixed, the AEM form |
| `sitePath` | `/tea2` - site-relative and extensionless |

Match on whichever your storage uses. One asymmetry worth knowing: a folder index is `/de/index` in the `sitePath` form, while AEM's canonical form for the same page is the folder itself.

### The token

`ctx.token` and `init`'s `token` are the raw IMS access token. They are passed explicitly because `daFetch` only attaches credentials for DA and AEM origins, so a plugin's own worker would otherwise get an unauthenticated request. Your module is imported into the da-live realm and can already read the token; passing it documents a boundary that was crossed at import time rather than implying containment that does not exist.

---

## 3. What happens when something goes wrong

| Situation | Result |
|---|---|
| `import()` fails, `init` throws, no default export, `init` returns no object | The plugin contributes nothing, to any surface, for the life of the list. |
| The handle has no `getStatus` | Nothing is contributed, silently. An action-bar-only plugin logs nothing. |
| `getStatus` throws, rejects, or takes longer than 5s | **Only** the status surface is disabled, for the life of the list. The same handle keeps serving the action bar. |
| `getStatus` returns `null` | No status. Not an error, not logged. |
| It returns a non-object, or a status whose `label` is missing or empty | Treated as no status, warned once in the console. |
| `state` is outside the enum | Coerced to `neutral`, warned once, the label still renders. |

Nothing above is shown to the user: a `null`, a dead plugin and a rejected promise all render exactly the same nothing. Check the console when a status you expect does not appear.

**There is no loading state**, deliberately. Most pages return `null`, so a placeholder would appear and vanish again on the majority of expands. The cell simply appears when there is something to show.

---

## 4. Curated icon names

The host resolves an icon name to `/img/icons/s2-icon-<name>-20-n.svg`, so only names it knows are accepted; anything else falls through the chain to `workflow`.

`cancel`, `checkmarkcircle`, `clock`, `comment`, `flag`, `history`, `infocircle`, `send`, `user`, `workflow`

To add one, ship the SVG under `img/icons/` and add its name to `KNOWN_ICONS` in `status-registry.js`.

---

## 5. Lifecycle notes

- The registry belongs to a **`da-list` instance**. It is built when the list loads a folder, rebuilt when the path crosses an org or site boundary or when the folder's permissions differ, and dropped with the list.
- The browse tab and the search tab are two `da-list` instances, so a module can be `init`ed **once per list instance** rather than strictly once per page load. Do not assume a single `init`; make it idempotent and cheap.
- Prefilters (`ref`, `kinds`, `requires`) run **before** `import()`, so a row that cannot apply to this item or this user never loads your module at all.
- Folders and links never reach a plugin: only items with an extension can be expanded.
- Multiple plugins each get a cell, in config order, with site rows ahead of org rows. There is no cap.
