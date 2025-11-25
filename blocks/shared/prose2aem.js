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

function convertBlocks(editor, isFragment = false) {
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

    // cursor detection
    const daCursor = nameRow.querySelector('#da-cursor-position');
    if (daCursor) div.id = daCursor.id;

    if (isFragment) {
      table.parentElement.replaceChild(div, table);
    } else {
      table.parentElement.parentElement.replaceChild(div, table.parentElement);
    }
  });
}

function makePictures(editor) {
  const imgs = editor.querySelectorAll('img');
  imgs.forEach((img) => {
    img.removeAttribute('contenteditable');
    img.removeAttribute('draggable');
    img.removeAttribute('style');

    const dataFocalX = img.getAttribute('data-focal-x');
    const dataFocalY = img.getAttribute('data-focal-y');
    if (dataFocalX && dataFocalY) {
      img.setAttribute('data-title', `data-focal:${dataFocalX},${dataFocalY}`);
    }

    if (img.parentElement.classList.contains('focal-point-image-wrapper')) {
      const wrapper = img.parentElement;
      wrapper.parentElement.replaceChild(img, wrapper);
    }

    // Set the cursor id on the image for live preview scrolling
    const daCursor = img.parentElement.querySelector('#da-cursor-position');
    if (daCursor) img.id = daCursor.id;

    const clone = img.cloneNode(true);
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
  const topLevelLists = editor.querySelectorAll('ul > li, ol > li');

  topLevelLists.forEach((li) => {
    if (li.firstChild.classList.contains('loc-deleted-view')) {
      li.remove(); // remove deleted nodes in preview
    } else if (li.firstChild.classList.contains('loc-added-view')) {
      li.querySelector('.loc-color-overlay').remove();
      li.innerHTML = li.firstChild.innerHTML;
    }
  });

  const lis = editor.querySelectorAll('li');
  lis.forEach((li) => {
    // Collapse single child p tags
    if (li.children.length === 1 && li.firstElementChild.nodeName === 'P') {
      li.innerHTML = li.firstElementChild.innerHTML;
    }
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

/**
 * A utility to take ProseMirror formatted DOM and convert to AEM semantic markup
 * @param {HTMLElement} editor the editor dom
 * @param {Boolean} livePreview whether or not the target destination is Live Preview
 * @param {Boolean} isFragment whether or not the DOM is a fragment
 * @returns AEM-friendly HTML as a text string
 */
export default function prose2aem(editor, livePreview, isFragment = false) {
  if (!isFragment) editor.removeAttribute('class');

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

  convertBlocks(editor, isFragment);

  if (livePreview) {
    removeMetadata(editor);
    parseIcons(editor);
  }

  makePictures(editor);

  if (!isFragment) {
    makeSections(editor);
  }

  if (isFragment) {
    return editor.innerHTML;
  }

  const html = `
    <body>
      <header></header>
      <main>${editor.innerHTML}</main>
      <footer></footer>
    </body>
  `;

  return html;
}

export function getHtmlWithCursor(view) {
  const { selection } = view.state;
  const cursorPos = selection.from;

  // Clone the editor first so we don't modify the real DOM
  const editorClone = view.dom.cloneNode(true);

  // Get the DOM position corresponding to the ProseMirror position
  const { node: domNode, offset } = view.domAtPos(cursorPos);

  // Find the corresponding node in the cloned DOM
  // Build path from view.dom to domNode
  const path = [];
  let current = domNode;
  while (current && current !== view.dom) {
    const parent = current.parentNode;
    if (parent) {
      const index = Array.from(parent.childNodes).indexOf(current);
      path.unshift(index);
      current = parent;
    } else {
      break;
    }
  }

  // Follow the same path in the clone
  let clonedNode = editorClone;
  for (const index of path) {
    clonedNode = clonedNode.childNodes[index];
  }

  // Create cursor marker element
  const marker = document.createElement('span');
  marker.id = 'da-cursor-position';
  marker.setAttribute('data-cursor-pos', cursorPos);

  // Insert the marker into the cloned DOM
  if (clonedNode.nodeType === Node.TEXT_NODE) {
    const parent = clonedNode.parentNode;
    const textBefore = clonedNode.textContent.substring(0, offset);
    const textAfter = clonedNode.textContent.substring(offset);

    const beforeNode = document.createTextNode(textBefore);
    const afterNode = document.createTextNode(textAfter);

    parent.insertBefore(beforeNode, clonedNode);
    parent.insertBefore(marker, clonedNode);
    parent.insertBefore(afterNode, clonedNode);
    parent.removeChild(clonedNode);
  } else {
    clonedNode.insertBefore(marker, clonedNode.childNodes[offset] || null);
  }

  // Convert to an HTML string using prose2aem
  return prose2aem(editorClone, true);
}
