# Canvas block icons

All icons use `<svg viewBox="0 0 20 20"><use href="path#icon"></use></svg>` unless noted.

Icons loaded from the content bus (`/img/icons/`) are served from `https://da.live` on prod and proxied on localhost. Code-bus icons (`/blocks/canvas/img/`) are always available locally.

| Icon | SVG path | Used in | Method | Bus |
|---|---|---|---|---|
| undo | `/img/icons/s2-icon-undo-20-n.svg` | `ew-canvas-header` — undo button | `<use href>` | Content bus |
| redo | `/img/icons/s2-icon-redo-20-n.svg` | `ew-canvas-header` — redo button | `<use href>` | Content bus |
| split-left | `/blocks/canvas/img/s2-icon-splitleft-20-n.svg` | `ew-canvas-header` — open before panel; `ew-panel-header` — toggle before panel | `<use href>` | Code bus |
| split-right | `/blocks/canvas/img/s2-icon-splitright-20-n.svg` | `ew-canvas-header` — open after panel; `ew-panel-header` — toggle after panel; `ew-tool-panel` — close panel | `<use href>` | Code bus |
| grid-compare | `/blocks/canvas/img/s2-icon-gridcompare-20-n.svg` | `ew-canvas-header` — split view segment button | `<use href>` | Code bus |
| open-in | `/img/icons/s2-icon-openin-20-n.svg` | `ew-tool-panel` — picker trailing icon for external views | `<img src>` ¹ | Content bus |
| link | `/img/icons/s2-icon-link-20-n.svg` | `ew-selection-toolbar` — create / edit link | `<use href>` | Content bus |
| unlink | `/img/icons/s2-icon-unlink-20-n.svg` | `ew-selection-toolbar` — remove link | `<use href>` | Content bus |
| tag-bold | `/img/icons/s2-icon-tagbold-20-n.svg` | `ew-selection-toolbar` marks; slash menu | `<use href>` | Content bus |
| tag-italic | `/img/icons/s2-icon-tagitalic-20-n.svg` | `ew-selection-toolbar` marks; slash menu | `<use href>` | Content bus |
| code | `/img/icons/s2-icon-code-20-n.svg` | `ew-selection-toolbar` marks; slash menu | `<use href>` | Content bus |
| tag-underline | `/img/icons/s2-icon-tagunderline-20-n.svg` | `ew-selection-toolbar` marks; slash menu | `<use href>` | Content bus |
| tag-strikethrough | `/img/icons/s2-icon-tagstrikethrough-20-n.svg` | `ew-selection-toolbar` marks; slash menu | `<use href>` | Content bus |
| heading-1 | `/img/icons/s2-icon-heading1-20-n.svg` | slash menu | `<use href>` | Content bus |
| heading-2 | `/img/icons/s2-icon-heading2-20-n.svg` | slash menu | `<use href>` | Content bus |
| heading-3 | `/img/icons/s2-icon-heading3-20-n.svg` | slash menu | `<use href>` | Content bus |
| heading-4 | `/img/icons/s2-icon-heading4-20-n.svg` | slash menu | `<use href>` | Content bus |
| heading-5 | `/img/icons/s2-icon-heading5-20-n.svg` | slash menu | `<use href>` | Content bus |
| heading-6 | `/img/icons/s2-icon-heading6-20-n.svg` | slash menu | `<use href>` | Content bus |
| block-code | `/img/icons/s2-icon-blockcode-20-n.svg` | slash menu | `<use href>` | Content bus |
| block-quote | `/img/icons/s2-icon-blockquote-20-n.svg` | `ew-selection-toolbar` structure buttons; slash menu | `<use href>` | Content bus |
| list-bulleted | `/img/icons/s2-icon-listbulleted-20-n.svg` | `ew-selection-toolbar` structure buttons; slash menu | `<use href>` | Content bus |
| list-numbered | `/img/icons/s2-icon-listnumbered-20-n.svg` | `ew-selection-toolbar` structure buttons; slash menu | `<use href>` | Content bus |
| text-indent-increase | `/img/icons/s2-icon-textindentincrease-20-n.svg` | `ew-selection-toolbar` structure buttons (list indent) | `<use href>` | Content bus |
| text-indent-decrease | `/img/icons/s2-icon-textindentdecrease-20-n.svg` | `ew-selection-toolbar` structure buttons (list outdent) | `<use href>` | Content bus |
| separator | `/img/icons/s2-icon-separator-20-n.svg` | slash menu — section break | `<use href>` | Content bus |
| rail | `/img/icons/s2-icon-rail-20-n.svg` | slash menu — lorem ipsum | `<use href>` | Content bus |
| cc-library | `/img/icons/s2-icon-cclibrary-20-n.svg` | slash menu — open library | `<use href>` | Content bus |
| table-add | `/img/icons/s2-icon-tableadd-20-n.svg` | slash menu — insert block | `<use href>` | Content bus |
| experience-add | `/blocks/canvas/img/s2-icon-experienceadd-20-n.svg` | `ew-panel-library` — add block / template / item | `<use href>` | Code bus |
| experience-preview | `/blocks/canvas/img/s2-icon-experiencepreview-20-n.svg` | `ew-panel-library` — preview block / template | `<use href>` | Code bus |
| select | `https://da.live/img/icons/s2-icon-select-20-n.svg` | `ew-editor-doc` — table select handle (`.table-select-handle`) | CSS `background-image` ² | Content bus |

---

**¹ `open-in` — not convertible to `<use href>`**
Passed as `trailingIcon` data property to `nx-picker` (shell component). The picker renders it as `<img src>` internally; canvas code cannot override that.

**² `select` — not convertible to `<use href>`**
Used as a CSS `background-image` on `.table-select-handle`. CSS backgrounds cannot reference SVG `<use>` patterns. Converting would require restructuring the table-select-handle DOM so the icon is a real element.

## Icon name contract

`command-defs.js` stores icon names only (e.g. `tagbold`, `heading1`). Each consumer constructs its own URL:

- **`ew-selection-toolbar`** → `/img/icons/s2-icon-${name}-20-n.svg` (content bus, absolute path)
- **`nx-menu`** (da-nx shell) → `${codeBase}/img/icons/s2-icon-${name}-20-n.svg` (CDN, via `getConfig`)

## Dead local copies

The following files remain in `/blocks/canvas/img/` but are no longer referenced by any code. They can be deleted once confirmed:

`s2-icon-heading1` through `s2-icon-heading6`, `s2-icon-blockcode`, `s2-icon-separator`, `s2-icon-rail`, `s2-icon-cclibrary`, `s2-icon-tableadd` (all `20-n`).
