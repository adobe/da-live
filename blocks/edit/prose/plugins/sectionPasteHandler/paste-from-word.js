/* eslint-disable */
/**
 * Copyright (c) 2026 HIS eG - Tim Wahrendorff
 * Licensed under the MIT License (http://opensource.org/licenses/MIT)
 *
 * WordCleaner
 *
 * Detects and converts HTML pasted from Microsoft Word (desktop and Word Online)
 * to clean HTML, preserving visual formatting while removing MSO-specific and
 * Word Online-specific markup noise.
 *
 * This class has no dependency on jQuery or Summernote and can be used
 * standalone. The Summernote plugin wrapper lives in:
 *   public/plugin/paste-from-word/summernote-ext-paste-from-word.js
 */

export default class WordCleaner {

  // ---------------------------------------------------------------------------
  // Detection
  // ---------------------------------------------------------------------------

  /**
   * Returns true if the HTML string appears to originate from Microsoft Word
   * (desktop or Word Online).
   */
  isWordContent(html) {
    return (
      // Desktop Word (MSO)
      /xmlns:o="urn:schemas-microsoft-com/.test(html) ||
      /ProgId=Word\.Document/.test(html) ||
      /class="?Mso[A-Z]/.test(html) ||
      /<o:p[\s>]/.test(html) ||
      /mso-list\s*:/.test(html) ||
      // Word Online — ListContainerWrapper format (individual items pasted)
      /class="[^"]*ListContainerWrapper/.test(html) ||
      /data-listid=/.test(html) ||
      // Word Online — full document paste (native ul/ol with wrapper divs)
      /color:\s*windowtext/i.test(html) ||
      /border-bottom:\s*1px solid transparent/.test(html) ||
      // Excel (desktop and Online)
      this.isExcelContent(html)
    );
  }

  /**
   * Returns true if the HTML string appears to originate from Microsoft Excel
   * (desktop or Excel Online).
   */
  isExcelContent(html) {
    return (
      /content=["']?Excel\.Sheet/i.test(html) ||
      /mso-displayed-decimal-separator/.test(html) ||
      /Generator["']?\s+content=["']?Microsoft\s+Excel/i.test(html)
    );
  }

  // ---------------------------------------------------------------------------
  // Main pipeline
  // ---------------------------------------------------------------------------

  clean(html) {
    html = this.removeConditionalComments(html);
    if (this.isExcelContent(html)) html = this.preprocessExcel(html);
    html = this.extractBodyContent(html);

    const doc = new DOMParser().parseFromString(
      `<div id="__pfword__">${html}</div>`,
      'text/html'
    );
    const container = doc.getElementById('__pfword__');
    if (!container) return html;

    this.convertHeadings(container);
    this.convertWordOnlineLists(container);
    this.convertLists(container);
    this.unwrapDivs(container);
    this.mergeSiblingLists(container);
    this.removeNoiseNodes(container);
    this.cleanStyles(container);
    this.cleanAttributes(container);
    this.cleanHeadingSpans(container);
    this.deduplicateInheritedStyles(container);
    this.unwrapEmptySpans(container);
    this.replaceNbsp(container);
    this.unwrapWhitespaceSpans(container);
    this.removeEmptyBlocks(container);

    return container.innerHTML;
  }

  // ---------------------------------------------------------------------------
  // String pre-processing
  // ---------------------------------------------------------------------------

  removeConditionalComments(html) {
    // Remove [if !supportLists] / [if !supportAnnotations] blocks entirely
    html = html.replace(/<!--\[if !support[^\]]*\]>[\s\S]*?<!\[endif\]-->/gi, '');
    // Strip remaining conditional comment markers, keep inner content
    html = html.replace(/<!--\[if[^\]]*\]>/gi, '');
    html = html.replace(/<!\[endif\]-->/gi, '');
    // Remove XML processing instructions
    html = html.replace(/<\?xml[^?]*\?>/gi, '');
    return html;
  }

  extractBodyContent(html) {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return bodyMatch ? bodyMatch[1] : html;
  }

  /**
   * Pre-process Excel HTML before the body is extracted.
   * Excel stores visual styles in a <style> block with named classes
   * (e.g. `.xl66 { font-weight: 700 }`). This must be baked into inline
   * styles before the head is discarded, and <col>/<colgroup> elements
   * (column widths) are removed as they are not useful in rich-text context.
   */
  preprocessExcel(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    this.applyExcelClassStyles(doc);
    doc.querySelectorAll('col, colgroup').forEach(el => el.remove());
    return doc.documentElement.outerHTML;
  }

  /**
   * Parse class rules from <style> blocks and apply matching visual properties
   * as inline styles on all matching elements in the document.
   * Only class selectors (`.xl66`) are processed; element rules are ignored.
   * Existing inline styles are preserved and take precedence (appended after).
   */
  applyExcelClassStyles(doc) {
    const KEEP_PROPS = new Set([
      'color', 'background-color', 'font-weight', 'font-style', 'text-decoration',
    ]);

    // Collect all class rules from style blocks
    const classRules = {}; // className -> array of "prop: value" strings
    doc.querySelectorAll('style').forEach(styleEl => {
      const text = styleEl.textContent || '';
      const ruleRe = /\.([a-zA-Z][\w-]*)\s*\{([^}]*)\}/g;
      let m;
      while ((m = ruleRe.exec(text)) !== null) {
        const className = m[1];
        const body = m[2];
        const declarations = [];
        body.split(';').forEach(decl => {
          const colon = decl.indexOf(':');
          if (colon === -1) return;
          let prop = decl.slice(0, colon).trim().toLowerCase();
          const value = decl.slice(colon + 1).trim();
          if (!value) return;
          // Normalize `background` shorthand to `background-color` (Excel uses solid colors)
          if (prop === 'background') prop = 'background-color';
          if (KEEP_PROPS.has(prop)) {
            declarations.push(prop + ': ' + value);
          }
        });
        if (declarations.length) {
          classRules[className] = declarations;
        }
      }
    });

    if (!Object.keys(classRules).length) return;

    // Apply matched class rules as inline styles
    doc.querySelectorAll('[class]').forEach(el => {
      const classes = (el.getAttribute('class') || '').split(/\s+/);
      const toApply = [];
      classes.forEach(cls => {
        if (classRules[cls]) toApply.push(...classRules[cls]);
      });
      if (!toApply.length) return;
      const existing = el.getAttribute('style') || '';
      const combined = toApply.join('; ') + (existing ? '; ' + existing : '');
      el.setAttribute('style', combined);
    });
  }

  // ---------------------------------------------------------------------------
  // DOM transformations
  // ---------------------------------------------------------------------------

  convertHeadings(container) {
    const headingMap = {
      MsoHeading1: 'h1',
      MsoHeading2: 'h2',
      MsoHeading3: 'h3',
      MsoHeading4: 'h4',
      MsoHeading5: 'h5',
      MsoHeading6: 'h6',
    };

    container.querySelectorAll('p').forEach(p => {
      let headingTag = null;

      // 1. Word Online standard headings: role="heading" + aria-level (reliable W3C markers)
      if (p.getAttribute('role') === 'heading') {
        const level = parseInt(p.getAttribute('aria-level') || '0', 10);
        if (level >= 1 && level <= 6) headingTag = 'h' + level;
      }

      // 2. Word Online custom heading styles: data-ccp-parastyle="heading N"
      //    Built-in headings also carry this, but those are already caught above.
      //    For N <= 6 the number maps directly; for custom styles (N > 6) infer
      //    the visual level from the paragraph's font size.
      if (!headingTag) {
        const span = p.querySelector('span[data-ccp-parastyle]');
        if (span) {
          const style = (span.getAttribute('data-ccp-parastyle') || '').toLowerCase().trim();
          const m = style.match(/^heading\s+(\d+)$/);
          if (m) {
            const n = parseInt(m[1], 10);
            if (n >= 1 && n <= 6) {
              headingTag = 'h' + n;
            } else {
              // Custom heading style — infer level from font size of the paragraph
              headingTag = this._inferHeadingTagFromFontSize(p);
            }
          }
        }
      }

      // 3. Fallback: MSO class names (desktop Word)
      if (!headingTag) {
        const cls = p.className || '';
        for (const [msoClass, tag] of Object.entries(headingMap)) {
          if (cls.includes(msoClass)) {
            headingTag = tag;
            break;
          }
        }
      }

      if (headingTag) {
        const heading = container.ownerDocument.createElement(headingTag);
        heading.innerHTML = p.innerHTML;
        p.replaceWith(heading);
      }
    });
  }

  /**
   * Estimate a heading tag (h1–h5) from the largest font-size found in
   * inline styles within the paragraph. Used for custom Word heading styles
   * that have no aria-level attribute.
   *
   * Thresholds are based on typical Word Online heading font sizes:
   *   h1 ≈ 20pt+, h2 ≈ 16pt+, h3 ≈ 14pt+, h4 ≈ 12pt+, else h5
   */
  _inferHeadingTagFromFontSize(p) {
    let maxPt = 0;
    const check = (style) => {
      const m = (style || '').match(/font-size:\s*([\d.]+)pt/i);
      if (m) { const pt = parseFloat(m[1]); if (pt > maxPt) maxPt = pt; }
    };
    check(p.getAttribute('style'));
    p.querySelectorAll('span[style]').forEach(s => check(s.getAttribute('style')));
    if (maxPt >= 20) return 'h1';
    if (maxPt >= 16) return 'h2';
    if (maxPt >= 14) return 'h3';
    if (maxPt >= 12) return 'h4';
    return 'h5';
  }

  /**
   * Convert Word Online list structure to proper nested <ul>/<ol> elements.
   *
   * Word Online outputs each list item as:
   *   <div class="ListContainerWrapper ...">
   *     <ul class="BulletListStyle1 ..."> (or <ol>)
   *       <li data-aria-level="1" data-listid="2" ...>
   *         <p class="Paragraph ...">...</p>
   *       </li>
   *     </ul>
   *   </div>
   *
   * We group consecutive ListContainerWrapper divs and reconstruct proper
   * nesting using the data-aria-level attribute.
   */
  convertWordOnlineLists(container) {
    const doc = container.ownerDocument;

    // ListContainerWrapper divs may be grandchildren (wrapped in outer SCXW divs)
    // rather than direct children of container. Collect every distinct parent node
    // that has at least one ListContainerWrapper child and process each one.
    const seen = new Set();
    const parents = [];
    container.querySelectorAll('[class*="ListContainerWrapper"]').forEach(el => {
      const p = el.parentNode;
      if (p && !seen.has(p)) {
        seen.add(p);
        parents.push(p);
      }
    });

    parents.forEach(parent => {
      const children = Array.from(parent.childNodes);
      let i = 0;
      while (i < children.length) {
        if (!this.isWordOnlineListWrapper(children[i])) {
          i++;
          continue;
        }

        const group = [];
        while (i < children.length && this.isWordOnlineListWrapper(children[i])) {
          const wrapper = children[i];
          const listEl = wrapper.querySelector('ul, ol');
          const li = listEl ? listEl.querySelector('li') : null;
          if (li) {
            group.push({
              el: wrapper,
              level: parseInt(li.getAttribute('data-aria-level') || '1', 10),
              isOrdered: listEl.tagName.toUpperCase() === 'OL',
              html: this.extractWordOnlineLiContent(li),
            });
          }
          i++;
        }

        if (group.length) {
          const listRoot = this.buildNestedList(doc, group);
          group[0].el.parentNode.insertBefore(listRoot, group[0].el);
          group.forEach(item => item.el.parentNode?.removeChild(item.el));
        }
      }
    });
  }

  isWordOnlineListWrapper(node) {
    if (!node || node.nodeType !== 1 /* ELEMENT_NODE */) return false;
    return (node.getAttribute('class') || '').includes('ListContainerWrapper');
  }

  extractWordOnlineLiContent(li) {
    const clone = li.cloneNode(true);
    // Remove EOP (end-of-paragraph) spans — trailing &nbsp; markers
    clone.querySelectorAll('span').forEach(span => {
      if (/\bEOP\b/.test(span.getAttribute('class') || '')) span.remove();
    });
    // Unwrap inner <p> elements — content goes directly into <li>
    clone.querySelectorAll('p').forEach(p => {
      p.replaceWith(...p.childNodes);
    });
    return clone.innerHTML.trim().replace(/\u00a0$/, '').trim();
  }

  /**
   * Convert flat MsoList* paragraphs into proper nested <ul>/<ol> elements.
   *
   * Word outputs lists as sibling <p> elements with `mso-list: lN levelN lfoN`
   * in their style attribute. We group consecutive list paragraphs and
   * reconstruct proper nesting based on the level number.
   */
  convertLists(container) {
    const doc = container.ownerDocument;
    const children = Array.from(container.childNodes);

    let i = 0;
    while (i < children.length) {
      if (!this.isListParagraph(children[i])) {
        i++;
        continue;
      }

      const items = [];
      while (i < children.length && this.isListParagraph(children[i])) {
        const para = children[i];
        items.push({
          el: para,
          level: this.getListLevel(para),
          isOrdered: this.isOrderedList(para),
          html: this.extractListItemContent(para),
        });
        i++;
      }

      const listRoot = this.buildNestedList(doc, items);
      items[0].el.parentNode.insertBefore(listRoot, items[0].el);
      items.forEach(item => item.el.parentNode?.removeChild(item.el));
    }
  }

  isListParagraph(node) {
    if (!node || node.nodeType !== 1 /* ELEMENT_NODE */) return false;
    const tag = node.tagName.toUpperCase();
    if (tag !== 'P' && tag !== 'DIV') return false;
    const style = node.getAttribute('style') || '';
    const cls = node.getAttribute('class') || '';
    return /mso-list\s*:/i.test(style) || /MsoList/.test(cls);
  }

  getListLevel(para) {
    const style = para.getAttribute('style') || '';
    const match = style.match(/mso-list\s*:[^;]*level\s*(\d+)/i);
    return match ? parseInt(match[1], 10) : 1;
  }

  isOrderedList(para) {
    const cls = para.getAttribute('class') || '';
    if (/MsoListNumber/.test(cls)) return true;
    if (/MsoListBullet/.test(cls)) return false;

    const ignoreSpan = para.querySelector('[style*="mso-list:Ignore"], [style*="mso-list: Ignore"]');
    if (ignoreSpan) {
      const text = ignoreSpan.textContent.replace(/\u00a0/g, '').trim();
      if (/^[\d]+[.)]/.test(text) || /^[ivxlcdmIVXLCDM]+\./i.test(text) || /^[a-zA-Z]\./.test(text)) {
        return true;
      }
    }
    return false;
  }

  extractListItemContent(para) {
    const clone = para.cloneNode(true);
    clone.querySelectorAll('[style*="mso-list:Ignore"], [style*="mso-list: Ignore"]').forEach(s => s.remove());
    return clone.innerHTML.trim();
  }

  /**
   * Build a nested <ul>/<ol> DOM tree from a flat list of items with levels.
   */
  buildNestedList(doc, items) {
    if (!items.length) return doc.createElement('ul');

    const rootTag = items[0].isOrdered ? 'ol' : 'ul';
    const root = doc.createElement(rootTag);
    const stack = [{ list: root, level: 1 }];

    for (const { level, isOrdered, html } of items) {
      while (stack.length > 1 && stack[stack.length - 1].level > level) {
        stack.pop();
      }

      const top = stack[stack.length - 1];

      if (top.level < level) {
        const lastLi = top.list.lastElementChild;
        const nestedTag = isOrdered ? 'ol' : 'ul';
        const nestedList = doc.createElement(nestedTag);
        (lastLi || top.list).appendChild(nestedList);
        stack.push({ list: nestedList, level });
      }

      const li = doc.createElement('li');
      li.innerHTML = html;
      stack[stack.length - 1].list.appendChild(li);
    }

    return root;
  }

  /**
   * Unwrap all <div> elements — Word Online wraps content in semantically empty
   * divs. Process deepest first so inner divs are removed before their parents.
   */
  unwrapDivs(container) {
    Array.from(container.querySelectorAll('div')).reverse().forEach(div => {
      if (div.parentNode) div.replaceWith(...div.childNodes);
    });
  }

  /**
   * Merge consecutive <ul>/<ol> siblings of the same type.
   * Word Online outputs each list item in its own wrapper, resulting in
   * multiple consecutive same-type lists after div unwrapping.
   */
  mergeSiblingLists(container) {
    let changed = true;
    while (changed) {
      changed = false;
      container.querySelectorAll('ul + ul, ol + ol').forEach(list => {
        const prev = list.previousElementSibling;
        if (prev && prev.tagName === list.tagName) {
          while (list.firstChild) prev.appendChild(list.firstChild);
          list.remove();
          changed = true;
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Noise removal
  // ---------------------------------------------------------------------------

  removeNoiseNodes(container) {
    // Remove HTML comment nodes (e.g. <!--StartFragment--> / <!--EndFragment-->
    // that Excel embeds inside table markup)
    const walker = container.ownerDocument.createTreeWalker(container, 128 /* SHOW_COMMENT */);
    const comments = [];
    let node;
    while ((node = walker.nextNode())) comments.push(node);
    comments.forEach(c => c.remove());

    container.querySelectorAll('o\\:p').forEach(el => {
      if (el.textContent.trim()) {
        el.replaceWith(...el.childNodes);
      } else {
        el.remove();
      }
    });

    Array.from(container.querySelectorAll('*')).forEach(el => {
      if (el.tagName?.includes(':') && el.parentNode) {
        el.replaceWith(...el.childNodes);
      }
    });

    // Remove Word Online EOP (end-of-paragraph) spans
    container.querySelectorAll('span').forEach(span => {
      const cls = span.getAttribute('class') || '';
      if (/\bEOP\b/.test(cls) && span.parentNode) span.remove();
    });

    // Unwrap spans that carry no visual styles (MSO noise spans and Word Online TextRun spans)
    container.querySelectorAll('span').forEach(span => {
      if (this.hasOnlyNoisyStyles(span) && span.parentNode) {
        span.replaceWith(...span.childNodes);
      }
    });

    // Unwrap <p> inside <li> and table cells — Word Online wraps item text in <p>
    container.querySelectorAll('li, td, th').forEach(cell => {
      const doc = cell.ownerDocument;
      const paragraphs = Array.from(cell.querySelectorAll(':scope > p'));
      if (!paragraphs.length) return;
      paragraphs.forEach((p, idx) => {
        const frag = doc.createDocumentFragment();
        if (idx > 0) frag.appendChild(doc.createElement('br'));
        while (p.firstChild) frag.appendChild(p.firstChild);
        p.parentNode.insertBefore(frag, p);
        p.parentNode.removeChild(p);
      });
    });

    container.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src') || '';
      if (!src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:')) {
        img.remove();
      }
    });

    container.querySelectorAll('br[style]').forEach(br => {
      if (/mso-/i.test(br.getAttribute('style') || '')) {
        br.removeAttribute('style');
      }
    });
  }

  hasOnlyNoisyStyles(span) {
    const style = span.getAttribute('style') || '';
    if (!style.trim()) return true;
    const VISUAL = /^(color|background-color|font-size|font-weight|font-style|text-decoration|vertical-align)\s*:/i;
    return style.split(';').map(p => p.trim()).filter(Boolean).every(p => !VISUAL.test(p));
  }

  // ---------------------------------------------------------------------------
  // Style and attribute cleaning
  // ---------------------------------------------------------------------------

  cleanStyles(container) {
    const KEEP = new Set([
      'color', 'background-color', 'font-size', 'font-weight',
      'font-style', 'text-decoration', 'text-align', 'vertical-align',
    ]);

    // Default/no-op values — visually equivalent to the browser default
    const DEFAULTS = {
      'color': new Set(['#000000', 'black', 'windowtext', 'inherit',
        'rgb(0,0,0)', 'rgb(0, 0, 0)']),
      'background-color': new Set(['#ffffff', 'white', 'transparent', 'inherit',
        'rgb(255,255,255)', 'rgb(255, 255, 255)']),
      'font-size': new Set(['12pt']),
      'font-weight': new Set(['normal', '400']),
      'font-style': new Set(['normal']),
      'vertical-align': new Set(['baseline', 'top']),
      'text-align': new Set(['left', 'start']),
    };

    container.querySelectorAll('[style]').forEach(el => {
      const cleaned = (el.getAttribute('style') || '')
        .split(';')
        .map(p => p.trim())
        .filter(p => {
          if (!p) return false;
          const colon = p.indexOf(':');
          if (colon === -1) return false;
          const prop = p.slice(0, colon).trim().toLowerCase();
          if (!KEEP.has(prop)) return false;
          const value = p.slice(colon + 1).trim().toLowerCase()
            .replace(/\s*!important\s*$/, '');
          return !DEFAULTS[prop]?.has(value);
        })
        .join('; ');

      if (cleaned) {
        el.setAttribute('style', cleaned);
      } else {
        el.removeAttribute('style');
      }
    });
  }

  cleanAttributes(container) {
    const PRESERVE_ON = {
      A:   new Set(['href', 'target', 'title', 'rel']),
      IMG: new Set(['src', 'alt', 'width', 'height']),
      TD:  new Set(['colspan', 'rowspan']),
      TH:  new Set(['colspan', 'rowspan', 'scope']),
      OL:  new Set(['start', 'type']),
    };
    // style is always kept — it has already been cleaned by cleanStyles
    const ALWAYS_KEEP = new Set(['style']);

    container.querySelectorAll('*').forEach(el => {
      const allowed = PRESERVE_ON[el.tagName.toUpperCase()] || new Set();
      Array.from(el.attributes).forEach(attr => {
        const name = attr.name.toLowerCase();
        if (!ALWAYS_KEEP.has(name) && !allowed.has(name)) el.removeAttribute(attr.name);
      });
    });
  }

  /**
   * Remove style declarations from an element that are already set identically
   * on its direct parent — inherited styles need not be repeated.
   * Runs after cleanStyles/cleanAttributes so only kept properties remain.
   * Spans emptied by this pass are then caught by unwrapEmptySpans.
   */
  deduplicateInheritedStyles(container) {
    container.querySelectorAll('[style]').forEach(el => {
      const parent = el.parentElement;
      if (!parent) return;
      const parentStyles = this._parseStyleStr(parent.getAttribute('style') || '');
      if (!Object.keys(parentStyles).length) return;
      const childStyles = this._parseStyleStr(el.getAttribute('style') || '');
      const unique = Object.entries(childStyles)
        .filter(([prop, val]) => parentStyles[prop] !== val)
        .map(([k, v]) => k + ': ' + v)
        .join('; ');
      if (unique) {
        el.setAttribute('style', unique);
      } else {
        el.removeAttribute('style');
      }
    });
  }

  _parseStyleStr(styleStr) {
    const result = {};
    (styleStr || '').split(';').forEach(decl => {
      const colon = decl.indexOf(':');
      if (colon === -1) return;
      const prop = decl.slice(0, colon).trim().toLowerCase();
      const val = decl.slice(colon + 1).trim().toLowerCase();
      if (prop && val) result[prop] = val;
    });
    return result;
  }

  /**
   * Unwrap spans whose text content is purely whitespace.
   * Word often wraps spaces in spans with font-size/color etc. — the style is
   * meaningless on a whitespace-only node; the space character is preserved in
   * the parent after the span is removed.
   * Must run after cleanStyles/cleanAttributes so styles are already normalised.
   */
  /**
   * Unwrap spans that have no remaining attributes after cleaning.
   * Once cleanStyles strips a span's style and cleanAttributes removes its
   * class/etc., the span carries no information — unwrap it.
   * Process deepest first so inner spans are resolved before their parents.
   */
  /**
   * Unwrap all spans inside headings — headings carry full semantic styling,
   * so span-level color/font-size/font-weight inside them is always Word noise.
   */
  cleanHeadingSpans(container) {
    Array.from(container.querySelectorAll('h1 span, h2 span, h3 span, h4 span, h5 span, h6 span'))
      .reverse()
      .forEach(span => {
        if (span.parentNode) span.replaceWith(...span.childNodes);
      });
  }

  unwrapEmptySpans(container) {
    Array.from(container.querySelectorAll('span')).reverse().forEach(span => {
      if (span.attributes.length === 0 && span.parentNode) {
        span.replaceWith(...span.childNodes);
      }
    });
  }

  unwrapWhitespaceSpans(container) {
    container.querySelectorAll('span').forEach(span => {
      if (span.textContent.trim() === '' && !span.querySelector('img, br') && span.parentNode) {
        span.replaceWith(...span.childNodes);
      }
    });
  }

  replaceNbsp(container) {
    const walker = container.ownerDocument.createTreeWalker(container, 4 /* NodeFilter.SHOW_TEXT */);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.includes('\u00a0')) {
        node.nodeValue = node.nodeValue.replace(/\u00a0/g, ' ');
      }
    }
  }

  removeEmptyBlocks(container) {
    let changed = true;
    while (changed) {
      changed = false;
      container.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, span').forEach(el => {
        if (!el.textContent.trim() && !el.querySelector('img, br')) {
          el.remove();
          changed = true;
        }
      });
    }
  }
}
