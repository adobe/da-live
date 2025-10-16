import TextInput from './text-input.js';
import TextareaInput from './textarea-input.js';
import SelectInput from './select-input.js';
import NumberInput from './number-input.js';
import CheckboxInput from './checkbox-input.js';
import AssetInput from './asset-input.js';
import PictureInput from './picture-input.js';

export function registry(context, handlers) {
  return new Map([
    ['string', new TextInput(context, handlers)],
    ['textarea', new TextareaInput(context, handlers)],
    ['select', new SelectInput(context, handlers)],
    ['number', new NumberInput(context, handlers)],
    ['integer', new NumberInput(context, handlers)],
    ['boolean', new CheckboxInput(context, handlers)],
    ['asset', new AssetInput(context, handlers)],
    ['picture', new PictureInput(context, handlers)]
  ]);
}

export default { registry };


