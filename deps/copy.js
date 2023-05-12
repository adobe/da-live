import fs from 'fs';
import path from 'path';

const IMPORT_MAP = {
  'imports': {
    'prosemirror-state': '/node_modules/prosemirror-state/dist/index.js',
    'prosemirror-view': '/node_modules/prosemirror-view/dist/index.js',
    'prosemirror-model': '/node_modules/prosemirror-model/dist/index.js',
    'prosemirror-schema-basic': '/node_modules/prosemirror-schema-basic/dist/index.js',
    'prosemirror-schema-list': '/node_modules/prosemirror-schema-list/dist/index.js',
    'prosemirror-transform': '/node_modules/prosemirror-transform/dist/index.js',
    'prosemirror-example-setup': '/node_modules/prosemirror-example-setup/dist/index.js',
    'prosemirror-history': '/node_modules/prosemirror-history/dist/index.js',
    'prosemirror-commands': '/node_modules/prosemirror-commands/dist/index.js',
    'prosemirror-dropcursor': '/node_modules/prosemirror-dropcursor/dist/index.js',
    'prosemirror-gapcursor': '/node_modules/prosemirror-gapcursor/dist/index.js',
    'prosemirror-menu': '/node_modules/prosemirror-menu/dist/index.js',
    'prosemirror-inputrules': '/node_modules/prosemirror-inputrules/dist/index.js',
    'prosemirror-keymap': '/node_modules/prosemirror-keymap/dist/index.js',
    'prosemirror-tables': '/node_modules/prosemirror-tables/dist/index.js',
    'rope-sequence': '/node_modules/rope-sequence/dist/index.es.js',
    'w3c-keyname': '/node_modules/w3c-keyname/index.es.js',
    'orderedmap': '/node_modules/orderedmap/dist/index.js',
    'crelt': '/node_modules/crelt/index.es.js',
  },
};

function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) return true;
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname);
}

Object.keys(IMPORT_MAP.imports).forEach((key) => {
  const src = `.${IMPORT_MAP.imports[key]}`;
  const dest = src.replace('node_modules', 'deps');

  ensureDirectoryExistence(dest);
  fs.copyFile(src, dest, (err) => {
    if (err) throw err;
    console.log('source.txt was copied to destination.txt');
  });
});
