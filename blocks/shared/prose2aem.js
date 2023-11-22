function toBlockCSSClassNames(text) {
  if (!text) return [];
  const names = [];
  const idx = text.lastIndexOf('(');
  if (idx >= 0) {
    names.push(text.substring(0, idx));
    names.push(...text.substring(idx + 1).split(','));
  } else {
    names.push(text);
  }

  return names.map((name) => name
    .toLowerCase()
    .replace(/[^0-9a-z]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, ''))
    .filter((name) => !!name);
}

function convertBlocks(editor) {
  const tables = editor.querySelectorAll('.tableWrapper > table');

  tables.forEach(table => {
    const tbody = table.querySelector(':scope > tbody');
    const rows = tbody ? [...tbody.querySelectorAll(':scope > tr')] : [...table.querySelectorAll(':scope > tr')];
    const nameRow = rows.shift();
    const divs = [...rows].map((row) => {
      const cols = row.querySelectorAll(':scope > td');
      const divs = [...cols].map((col) => {
        const { innerHTML } = col;
        const div = document.createElement('div');
        div.innerHTML = innerHTML;
        return div;
      });
      const div = document.createElement('div');
      div.append(...divs);
      return div;
    });

    const div = document.createElement('div');
    div.className = toBlockCSSClassNames(nameRow.textContent).join(' ');
    div.append(...divs);
    table.parentElement.parentElement.replaceChild(div, table.parentElement);
  });
}

// <source type="image/webp" srcset="./media_1ca933d32ca97e654f88cda8ad61a232bb4087ace.png?width=750&#x26;format=webply&#x26;optimize=medium">
// <source type="image/png" srcset="./media_1ca933d32ca97e654f88cda8ad61a232bb4087ace.png?width=2000&#x26;format=png&#x26;optimize=medium" media="(min-width: 600px)">

function makePictures(editor) {
  const imgs = editor.querySelectorAll('img');
  imgs.forEach((img) => {
    img.removeAttribute('contenteditable');
    img.removeAttribute('draggable');

    const clone = img.cloneNode(true);
    clone.setAttribute('loading', 'lazy');

    const pic = document.createElement('picture');

    const srcMobile = document.createElement('source');
    srcMobile.srcset = clone.src;

    const srcTablet = document.createElement('source');
    srcTablet.srcset = clone.src;
    srcTablet.media = '(min-width: 600px)';

    pic.append(srcMobile, srcTablet, clone);
    img.parentElement.replaceChild(pic, img);
  });
}

function makeSections(editor) {
  const children = editor.querySelectorAll(':scope > *');
  
  const section = document.createElement('div');
  const sections = [...children].reduce((acc, child) => {
    if (child.nodeName === 'HR') {
      child.remove();
      acc.push(document.createElement('div'));
    } else {
      acc[acc.length - 1].append(child);
    }
    return acc;
  },[section]);

  editor.append(...sections);
}

export default function prose2aem(editor) {
  editor.removeAttribute('class');
  editor.removeAttribute('contenteditable');
  editor.removeAttribute('translate');

  const emptyImgs = editor.querySelectorAll('img.ProseMirror-separator');
  emptyImgs.forEach((el) => { el.remove(); });

  const trailingBreaks = editor.querySelectorAll('.ProseMirror-trailingBreak');
  trailingBreaks.forEach((el) => { el.remove(); });

  const paras = editor.querySelectorAll(':scope > p');
  paras.forEach((p) => { if (p.innerHTML.trim() === '') p.remove(); });

  convertBlocks(editor);
  editor.querySelector('.metadata')?.remove();

  makePictures(editor);

  makeSections(editor);

  const html = `
    <body>
      <header></header>
      <main>${editor.innerHTML}</main>
      <footer></footer>
    </body>
  `;

  // const doc = new DOMParser().parseFromString(html, 'text/html');
  // console.log(doc.body);

  return html;
}
