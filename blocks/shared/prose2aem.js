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
  const tables = editor.querySelectorAll('.tableWrapper > table, da-diff-added > table');

  tables.forEach((table) => {
    const tbody = table.querySelector(':scope > tbody');
    const rows = tbody ? [...tbody.querySelectorAll(':scope > tr')] : [...table.querySelectorAll(':scope > tr')];
    const nameRow = rows.shift();
    const divs = [...rows].map((row) => {
      const cols = row.querySelectorAll(':scope > td');
      // eslint-disable-next-line no-shadow
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

function makePictures(editor, live) {
  const imgs = editor.querySelectorAll('img');
  imgs.forEach((img) => {
    img.removeAttribute('contenteditable');
    img.removeAttribute('draggable');
    img.removeAttribute('style');

    const clone = img.cloneNode(true);
    if (live) {
      const source = new URL(clone.src);
      if (source.host.endsWith('.da.live')) {
        source.pathname = '/' + source.pathname
          .split('/')
          .slice(3) // remove org and site
          .join('/');
        clone.src = source.toString();
      }
    }

    clone.setAttribute('loading', 'lazy');

    let pic = document.createElement('picture');

    const srcMobile = document.createElement('source');
    srcMobile.srcset = clone.src;

    const srcTablet = document.createElement('source');
    srcTablet.srcset = clone.src;
    srcTablet.media = '(min-width: 600px)';

    pic.append(srcMobile, srcTablet, clone);

    const hrefAttr = img.getAttribute('href');
    if (hrefAttr) {
      const a = document.createElement('a');
      a.href = hrefAttr;
      const titleAttr = img.getAttribute('title');
      if (titleAttr) {
        a.title = titleAttr;
      }
      a.append(pic);
      pic = a;
    }

    // Determine what to replace
    const imgParent = img.parentElement;
    const imgGrandparent = imgParent.parentElement;
    if (imgParent.nodeName === 'P' && imgGrandparent?.childElementCount === 1) {
      imgGrandparent.replaceChild(pic, imgParent);
    } else {
      imgParent.replaceChild(pic, img);
    }
  });
}

function convertParagraphs(editor) {
  const paras = editor.querySelectorAll(':scope > p');
  paras.forEach((p) => {
    // Remove empty p tags
    if (p.innerHTML.trim() === '') { p.remove(); }
    // Convert dash p tags to rules
    if (p.textContent.trim() === '---') {
      const hr = document.createElement('hr');
      p.parentElement.replaceChild(hr, p);
    }
  });
}

function convertListItems(editor) {
  const lis = editor.querySelectorAll('li');
  lis.forEach((li) => {
    const para = li.querySelector(':scope > p');
    if (!para) return;
    li.innerHTML = para.innerHTML;
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
  }, [section]);

  editor.append(...sections);
}

function removeMetadata(editor) {
  editor.querySelector('.metadata')?.remove();
}

const iconRegex = /(?<!(?:https?|urn)[^\s<>]*):(#?[a-z_-]+[a-z\d]*):/gi; // matches icon pattern but not in URLs
function parseIcons(editor) {
  if (!iconRegex.test(editor.innerHTML)) return;
  editor.innerHTML = editor.innerHTML.replace(
    iconRegex,
    (_, iconName) => `<span class="icon icon-${iconName}"></span>`,
  );
}

const removeEls = (els) => els.forEach((el) => el.remove());

export default function prose2aem(editor, live) {
  editor.removeAttribute('class');
  editor.removeAttribute('contenteditable');
  editor.removeAttribute('translate');

  const daDiffDeletedEls = editor.querySelectorAll('da-diff-deleted');
  removeEls(daDiffDeletedEls);

  const emptyImgs = editor.querySelectorAll('img.ProseMirror-separator');
  removeEls(emptyImgs);

  const trailingBreaks = editor.querySelectorAll('.ProseMirror-trailingBreak');
  removeEls(trailingBreaks);

  const userPointers = editor.querySelectorAll('.ProseMirror-yjs-cursor');
  removeEls(userPointers);

  const gapCursors = editor.querySelectorAll('.ProseMirror-gapcursor');
  removeEls(gapCursors);

  const highlights = editor.querySelectorAll('span.ProseMirror-yjs-selection');
  highlights.forEach((el) => {
    el.parentElement.replaceChild(document.createTextNode(el.innerText), el);
  });

  convertListItems(editor);

  convertParagraphs(editor);

  convertBlocks(editor);

  if (live) {
    removeMetadata(editor);
    parseIcons(editor);
  }

  makePictures(editor, live);

  makeSections(editor);

  let html = `
    <body>
      <header></header>
      <main>${editor.innerHTML}</main>
      <footer></footer>
    </body>
  `;

  if (live) {
    html = html.replaceAll('https://content.da.live/', '/');
    html = html.replaceAll('https://stage-content.da.live/', '/');
  }

  return html;
}
