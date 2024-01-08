const IMPORT_MAP = {
  'imports': {
    'prosemirror-state': '/deps/prosemirror-state/dist/index.js',
    'prosemirror-view': '/deps/prosemirror-view/dist/index.js',
    'prosemirror-model': '/deps/prosemirror-model/dist/index.js',
    'prosemirror-schema-basic': '/deps/prosemirror-schema-basic/dist/index.js',
    'prosemirror-schema-list': '/deps/prosemirror-schema-list/dist/index.js',
    'prosemirror-transform': '/deps/prosemirror-transform/dist/index.js',
    'prosemirror-example-setup': '/deps/prosemirror-example-setup/dist/index.js',
    'prosemirror-history': '/deps/prosemirror-history/dist/index.js',
    'prosemirror-commands': '/deps/prosemirror-commands/dist/index.js',
    'prosemirror-dropcursor': '/deps/prosemirror-dropcursor/dist/index.js',
    'prosemirror-gapcursor': '/deps/prosemirror-gapcursor/dist/index.js',
    'prosemirror-menu': '/deps/prosemirror-menu/dist/index.js',
    'prosemirror-inputrules': '/deps/prosemirror-inputrules/dist/index.js',
    'prosemirror-keymap': '/deps/prosemirror-keymap/dist/index.js',
    'prosemirror-tables': '/deps/prosemirror-tables/dist/index.js',
    'rope-sequence': '/deps/rope-sequence/dist/index.es.js',
    'w3c-keyname': '/deps/w3c-keyname/index.es.js',
    'orderedmap': '/deps/orderedmap/dist/index.js',
    'crelt': '/deps/crelt/index.es.js',
    '@lit/task': '/deps/lit/task/task.js',
    '@lit/reactive-element': '/deps/lit/reactive-element/reactive-element.js',
    'helix-importer': '/deps/@adobe/helix-importer-ui/js/dist/helix-importer.js',
    'helix-importer-sitemap': '/deps/@adobe/helix-importer-ui/js/shared/sitemap.js',
  },
};

(function setImportMap() {
  const script = document.createElement('script');
  script.setAttribute('type', 'importmap');
  const map = JSON.stringify(IMPORT_MAP);
  script.textContent = map;
  document.head.append(script);
}());
