# File item rows

`da-file-item` renders Browse's standard selection, Name, Type, Modified and
action columns by default. Cards are unchanged.

Owners can supply a `columns` array using `select`, `name`, `type`, `folder`,
`modified`, `modifiedBy` and `actions`, in display order. Unknown keys are
ignored. A custom column layout keeps all requested columns at narrow widths;
the owner provides matching headers, a scroll container and
`--da-list-columns` with the matching CSS grid tracks.

`folder` is an optional `{ label, href }` object. `modifiedBy` can supply display
text, including an empty string when unavailable. Otherwise, visible file rows
with a `modifiedBy` column lazily load the existing DA status helper. The same
in-flight/result promise is reused by the information control. Folders and link
files do not request modifier metadata. Missing values show a dash; no author is
invented. Requests are invalidated on path changes and removal.
Known modifiers have the standard decorative user icon beside their name,
20px in the default size and 22px in M. Missing modifiers show no user icon.

Modified dates keep the standard row date format. Information and favorite
controls retain their existing events and on-demand details. Failed detail
requests show unavailable values rather than leaking an unhandled rejection.

Set `role="row"` on the host inside an accessible table or rowgroup. Cells
retain native links and buttons. Custom rows can omit the selection column.
`size="m"` advances row icons and action buttons; the owner supplies inherited
text sizing. The default size and all card metrics remain unchanged.
