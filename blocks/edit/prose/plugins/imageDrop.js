// eslint-disable-next-line import/no-unresolved
import { Plugin, TextSelection } from 'da-y-wrapper';

const FPO_IMG_URL = 'https://content.da.live/auniverseaway/da/assets/fpo.svg';
const SUPPORTED_FILES = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/gif'];

export default function imageDrop(schema) {
  return new Plugin({
    props: {
      handleDOMEvents: {
        drop: (view, event) => {
          event.preventDefault();

          const { files } = event.dataTransfer;
          if (files.length === 0) return;

          ([...files]).forEach(async (file) => {
            if (!SUPPORTED_FILES.some((type) => type === file.type)) return;

            const fpo = schema.nodes.image.create({ src: FPO_IMG_URL, style: 'width: 180px' });
            view.dispatch(view.state.tr.replaceSelectionWith(fpo).scrollIntoView());

            const { $from } = view.state.selection;

            const image = new Image();
            image.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = image.naturalWidth;
              canvas.height = image.naturalHeight;
              canvas.getContext('2d').drawImage(image, 0, 0);
              canvas.toBlob((blob) => {
                const myImage = new File([blob], file.name, { type: blob.type });
                const reader = new FileReader();
                reader.readAsDataURL(myImage);
                reader.onloadend = () => {
                  const base64 = reader.result;
                  // eslint-disable-next-line max-len
                  const fpoSelection = TextSelection.create(view.state.doc, $from.pos - 1, $from.pos);
                  const ts = view.state.tr.setSelection(fpoSelection);
                  const img = schema.nodes.image.create({ src: base64 });
                  const tr = ts.replaceSelectionWith(img).scrollIntoView();
                  view.dispatch(tr);
                };
              }, 'image/webp');
            };

            image.src = URL.createObjectURL(file);
          });
        },
      },
    },
  });
}
