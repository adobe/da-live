import AssetInput from './asset-input.js';

export default class PictureInput extends AssetInput {
  constructor(context, handlers = {}) { super(context, handlers); }
  getWrapperLabel() { return 'Choose an image from Assets'; }
}



