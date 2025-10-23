import { Validator } from '@cfworker/json-schema';
import { fromHtmlIsomorphic } from 'hast-util-from-html-isomorphic';
import { dereferenceSync } from 'dereference-json-schema';
import { selectAll } from 'hast-util-select';

function dereferencer(schema) {
  return dereferenceSync(schema);
}

export { Validator, dereferencer, fromHtmlIsomorphic, selectAll };
