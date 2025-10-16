/**
 * CodeBlockStorage
 * Strategy to store form meta/data in a single <pre><code> JSON block
 */

import { fromHtml } from "https://esm.sh/hast-util-from-html@2";
import { selectAll } from "https://esm.sh/hast-util-select@6";
import { toString } from "https://esm.sh/hast-util-to-string@3";

export default class CodeBlockStorage {
  // Parse html into { metadata, data }
  parseDocument(htmlString) {
    try {
      const hastTree = fromHtml(htmlString);
      const codeNodes = selectAll('pre > code', hastTree);
      if (codeNodes && codeNodes.length > 0) {
        const codeText = toString(codeNodes[0]) || '';
        const parsed = JSON.parse(codeText);
        if (parsed && parsed.data && (parsed.schemaId)) {
          const schemaId = parsed.schemaId;
          const title = parsed.title || 'Untitled Page';
          return { metadata: { title, schemaId }, data: parsed.data };
        }
      }
    } catch {
      // ignore and return empty if invalid
    }
    return { metadata: {}, data: {} };
  }

  // Serialize { formMeta, formData } into code block
  serializeDocument({ formMeta, formData }) {
    const payload = {
      schemaId: formMeta?.schemaId || 'inline',
      title: formMeta?.title || 'Untitled Page',
      data: formData || {},
    };
    const json = JSON.stringify(payload, null, 2);
    return `<pre><code>${json}</code></pre>`;
  }
}


