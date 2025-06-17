function imageToHTML(image, options = {}) {
  if (!image.src) {
    return "";
  }

  const { wrapPicture = false } = options;

    return `${wrapPicture ? '<p>' : ''}
<picture>
  <source srcset="${image.src}" />
  <source srcset="${image.src}" media="(min-width: 600px)" />
  <img src="${image.src}" alt="${image.alt || ''}"  loading="lazy" />
</picture>
${wrapPicture ? '</p>' : ''}`
}

function textToHTML(text) {
  // console.log('Rendering text...')
  if (!text.text) {
    return "";
  }

  return text.text
}

function linkToHTML(link) {
  //console.log('Rendering link...')
  if (!link.text) {
    return "";
  }

  return `<a href="${link.href || '#'}">${textToHTML(link.text)}</a>`
}

function headingToHTML(heading) {
  //console.log(`Rendering ${heading.type}...`)
  if (!heading.level || !heading.text) {
    return "";
  }

  return `<h${heading.level}>${textToHTML(heading.text)}</h${heading.level}>`
}

function strongToHTML(strong) {
  //console.log(`Rendering ${strong.type}...`)
  if (!strong.children) {
    return "";
  }

  return `<strong>${strong.children.map(child => {
    return renderers[child.type](child)
  }).join('')}</strong>`
}

function emToHTML(em) {
  //console.log(`Rendering ${em.type}...`)
  if (!em.children) {
    return "";
  }

  return `<em>${em.children.map(child => {
    return renderers[child.type](child)
  }).join('')}</em>`
}

function paragraphToHTML(paragraph) {
  //console.log(`Rendering ${paragraph.type}...`)
  if (!paragraph || !paragraph.children) {
    return "";
  }

  return `<p>${paragraph.children.map(child => { return renderers[child.type](child)}).join('') }</p>`;
}

function columnToHTML(column) {
  //console.log(`Rendering ${column.type}...`)
  if (!column.children) {
    return "";
  }

  return `
    <div>
      ${column.children.map(child => {
        return renderers[child.type](child, { wrapPicture: column.children.length > 1 })
      }).join('')}
    </div>`
}

function rowToHTML(row) {
  //console.log(`Rendering ${row.type}...`)
  if (!row.children) {
    return "";
  }

  return `
    <div>
      ${row.children.map(child => {
        // Fallback to column renderer if the type is not found
        const renderer = renderers[child.type] || renderers.column
        return renderer(child)
      }).join('')}
    </div>`
}

function blockToHTML(block) {
  //console.log(`Rendering ${block.type}...`)
  if (!block.children || !block.name) {
    return "";
  }

  return `
    <div class="${block.name.toLowerCase().replace(/ /g, '-')}">
      ${block.children.map(child => {
        // Fallback to row renderer if the type is not found
        const renderer = renderers[child.type] || renderers.row
        return renderer(child)
      }).join('')}
    </div>`
}

function sectionToHTML(section) {
  //console.log(`Rendering ${section.type}...`)

  if (!section.children) {
    return "";
  }

  return `
    <div>
      ${section.children.map(child => {
        //console.log(`Rendering ${child.type}...`)
        return renderers[child.type](child)
      }).join('')}
    </div>`
}

function olToHTML(ol) {
  if (!ol.children) {
    return '';
  }

  return `<ol>${ol.children.map(child => {
    return renderers[child.type](child)
  }).join('')}</ol>`
}

function ulToHTML(ul) {
  if (!ul.children) {
    return '';
  }

  return `<ul>${ul.children.map(child => {
    return renderers[child.type](child)
  }).join('')}</ul>`
}

function oliToHTML(li) {
  return `<li>${renderers[li.p?.type](li.p)}${renderers[li.sublist?.type](li.sublist)}</li></li>`
}

function uliToHTML(li) {
  return `<li>${renderers[li.p?.type](li.p)}${renderers[li.sublist?.type](li.sublist)}</li></li>`
}

const renderers = {
  heading: headingToHTML,
  p: paragraphToHTML,
  strong: strongToHTML,
  em: emToHTML,
  block: blockToHTML,
  row: rowToHTML,
  column: columnToHTML,
  text: textToHTML,
  link: linkToHTML,
  image: imageToHTML,
  ol: olToHTML,
  oli: oliToHTML,
  ul: ulToHTML,
  uli: uliToHTML,
  // Fallback for unknown types
  undefined: () => "",
  "": () => "",
  null: () => "",
}

/**
 * Try to balance the JSON content during streaming
 * FIXME: This could definitely be improved
 * @param {string} content 
 * @returns {object|null} returns the balanced JSON when successful, null otherwise
 */
function balanceJson(content) {
  if (!content || typeof content !== 'string') {
    return '{}';
  }

  let result = content;
  let stack = [];
  let inString = false;
  let escaped = false;
  let i = 0;

  // Parse through the content to track open structures
  while (i < content.length) {
    const char = content[i];
    
    if (escaped) {
      escaped = false;
      i++;
      continue;
    }

    if (char === '\\' && inString) {
      escaped = true;
      i++;
      continue;
    }

    if (char === '"' && !escaped) {
      inString = !inString;
    } else if (!inString) {
      if (char === '{') {
        stack.push('}');
      } else if (char === '[') {
        stack.push(']');
      } else if (char === '}' || char === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === char) {
          stack.pop();
        }
      }
    }
    
    i++;
  }

  // If we're in the middle of a string, close it
  if (inString) {
    result += '"';
  }

  // Handle incomplete key-value pairs in objects
  if (stack.length > 0) {
    // Check if we're in an object and need to complete a key-value pair
    const trimmed = result.trim();
    if (trimmed.endsWith(':')) {
      result += '""'; // Add empty string value
    } else if (trimmed.endsWith(',') || (trimmed.endsWith('{') && stack[stack.length - 1] === '}')) {
      // Remove trailing comma if present, or do nothing if we just opened an object
      if (trimmed.endsWith(',')) {
        result = result.trim().slice(0, -1);
      }
    }
  }

  // Close all remaining open structures
  while (stack.length > 0) {
    result += stack.pop();
  }

  // Validate and return the result
  try {
    const json = JSON.parse(result);
    return json;
  } catch (e) {
    // If still invalid, return null
    return null;
  }
}

/**
 * Convert the DA document to HTML
 * @param {object|string} document 
 * @param {boolean} stream 
 * @returns {string|null} the HTML string or null if the document is not valid
 */
export function toHTML(document, stream = false) {
  if (typeof document === 'string' && document.startsWith('<html>')) {
    return document;
  }

  if (stream) {
    document = balanceJson(document);
  }

  if (!document) {
    return null;
  }

  if (typeof document === 'string') {
    try {
      document = JSON.parse(document);
    } catch (e) {
      return null;
    }
  }

  if (!document || !document.children) {
    return null;
  }

  return `
  <html>
  <body>
    <header></header>
    <main>
      ${document.children.map(sectionToHTML).join('')}
    </main>
    <footer></footer>
  </body>
  </html>
  `;
}