/**
 * HtmlTableStorage
 * Strategy to store form meta/data as semantic HTML (DIV tables via HAST)
 */

import { h } from "https://esm.sh/hastscript@9";
import { fromHtml } from "https://esm.sh/hast-util-from-html@2";
import { toHtml } from "https://esm.sh/hast-util-to-html@9";
import { selectAll } from "https://esm.sh/hast-util-select@6";
import { toString } from "https://esm.sh/hast-util-to-string@3";
import { toClassName, fromRef, isRef, toRef } from "../../../utils.js";

const DEFAULT_ROOT_NAME = "form";
let effectiveSchema;

// -----------------------------
// HTML tables helpers (scoped to this module)
// -----------------------------

export function jsonToHtml(jsonData, rootName = DEFAULT_ROOT_NAME) {
  const processedObjects = new Set();
  const objectQueue = [];
  const tables = [];

  function generateRefId(name, number = 0) {
    return `${toClassName(name)}-${number}`;
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function toUL(arrayValue) {
    const rows = [];
    for (const value of arrayValue) {
      rows.push(h("li", {}, value));
    }
    return h("ul", {}, rows);
  }

  function createTable(name, data, refId = null) {
    const tableHeader = refId ? `${name} ${toClassName(refId)}` : name;
    const rows = [];
    for (const [key, value] of Object.entries(data)) {
      const childRefId = generateRefId(key, objectQueue.length);
      const combinedRefId = refId ? `${refId}/${childRefId}` : childRefId;
      const isObjectArray = Array.isArray(value) && value.every((item) => isObject(item));
      const isStringArray = Array.isArray(value) && value.every((item) => typeof item === "string");
      if (isObjectArray) {
        const arrayRefs = [];
        value.forEach((item, index) => {
          const itemRefId = `${combinedRefId}-${index}`;
          arrayRefs.push(toRef(itemRefId));
          if (!processedObjects.has(itemRefId)) {
            objectQueue.push({ name: key, data: item, refId: itemRefId });
            processedObjects.add(itemRefId);
          }
        });
        rows.push(h("div", {}, [h("div", {}, key), h("div", {}, toUL(arrayRefs))]));
      } else if (isStringArray) {
        rows.push(h("div", {}, [h("div", {}, key), h("div", {}, toUL(value))]));
      } else if (isObject(value)) {
        rows.push(h("div", {}, [h("div", {}, key), h("div", {}, toRef(combinedRefId))]));
        if (!processedObjects.has(combinedRefId)) {
          objectQueue.push({ name: key, data: value, refId: combinedRefId });
          processedObjects.add(combinedRefId);
        }
      } else {
        rows.push(h("div", {}, [h("div", {}, key), h("div", {}, String(value))]));
      }
    }
    return h("div", { class: tableHeader }, rows);
  }

  tables.push(createTable(rootName, jsonData));
  processedObjects.add(generateRefId(rootName));
  while (objectQueue.length > 0) {
    const { name, data, refId } = objectQueue.shift();
    tables.push(createTable(name, data, refId));
  }
  const rootNode = { type: "root", children: tables };
  return toHtml(rootNode);
}

export async function htmlToJson(htmlString, { schema, schemaId, context, services } = {}) {
  const blocks = {};
  const references = {};
  let metadata = {};
  const hastTree = fromHtml(htmlString);
  const tableDivs = selectAll('main > div > div', hastTree);

  async function loadEffectiveSchema(schemaId) {
    // Determine schema to use (prefer provided, fallback to metadata.schemaId)
    const schemaName = schemaId || metadata.schemaId;
    try {
      if (!effectiveSchema) {
        return services.schemaLoader.loadSchema(schemaName);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[html-storage] Failed to load schema for htmlToJson:', e?.message || e);
    }
    return null;
  }
  function resolveSchema(schemaPart) {
    if (!schemaPart?.refId) {
      return schemaPart;
    }
    let schema = effectiveSchema;
    if (schema) {
      const splittedRefId = refId.split("/");
      for (const id of splittedRefId) {
        if (id !== "#") {
          schema = schema[id];
        }
      }
    }
    return schema;
  }

  function isUL(element) {
    const children = element.children;
    return children.length === 1 && children[0].tagName === 'ul';
  }

  function parseRawValue(value) {
    return isRef(value) ? value : parseValue(value);
  }

  function ulToArrayValue(ulElement) {
    const values = [];
    for (const cell of ulElement.children[0].children) {
      const value = toString(cell);
      values.push(parseRawValue(value));
    }
    return values;
  }

  function parseRowsToBlockData(rows) {
    const data = {};
    for (let i = 0; i < rows.length; i++) {
      const cells = rows[i].children.filter((child) => child.type === "element");
      if (cells.length >= 2) {
        const key = toString(cells[0]).trim();
        const cellValue = cells[1];
        if (isUL(cellValue)) {
          data[key] = ulToArrayValue(cellValue);
        } else {
          const value = toString(cellValue);
          data[key] = parseRawValue(value);
        }
      }
    }
    return data;
  }

  function parseValue(value) {
    if (value === "") return "";
    if (value === "true") return true;
    if (value === "false") return false;

    // Use regex to check if value is a valid float (not just parseable)
    // This prevents strings like "+1231243452" or "2034-12-04" from being treated as floats
    const floatRegex = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
    if (floatRegex.test(value) && !Number.isNaN(parseFloat(value))) {
      return parseFloat(value);
    }

    return value;
  }

  function getPropertySchema(parentSchema, key) {
    if (!parentSchema) return undefined;
    if (parentSchema.type === "object" && parentSchema.properties && parentSchema.properties[key]) {
      return parentSchema.properties[key];
    }
    return undefined;
  }

  function coercePrimitive(value, expectedType) {
    if (!expectedType) return value;
    if (expectedType === "boolean") {
      if (value === "") return false;
      return Boolean(value);
    }
    if (expectedType === "number") {
      if (value === "") return 0;
      const n = Number(value);
      return Number.isNaN(n) ? value : n;
    }
    if (expectedType === "string") {
      return value === undefined || value === null ? "" : String(value);
    }
    return value;
  }

  function resolveReferences(obj, currentSchema) {
    const resolved = {};
    for (const [key, value] of Object.entries(obj)) {
      const propertySchema = getPropertySchema(currentSchema, key);
      const valueIsArray = Array.isArray(value);
      const truelyArray = propertySchema && propertySchema.type === "array" && valueIsArray;
      const emptyObject = propertySchema && propertySchema["$ref"] && valueIsArray && value.length === 0;
      if (truelyArray || isRef(value)) {
        // replace marker before splitting
        const valueSanitized = truelyArray ? value : [value];
        const refIds = valueSanitized.map((id) => toClassName(fromRef(id)));
        // If schema says this property is an array, always return an array
        if (propertySchema && propertySchema.type === "array") {
          if (propertySchema?.items?.["$ref"]) {
            const itemSchema = resolveSchema(propertySchema.items["$ref"]);
            const items = refIds
              .map((refId) => (blocks[refId] ? resolveReferences(blocks[refId], itemSchema) : null))
              .filter((v) => v !== null);
            resolved[key] = items;
          } else if (propertySchema?.items?.["type"] === "object") {
            const itemSchema = propertySchema.items;
            const items = refIds
              .map((refId) => (blocks[refId] ? resolveReferences(blocks[refId], itemSchema) : null))
              .filter((v) => v !== null);
            resolved[key] = items;
          } else {
            resolved[key] = refIds;
          }
        } else {
          // Single or multi refs but no array in schema → collapse single
          const refs = refIds
            .map((refId) => {
              if (!blocks?.[refId]) {
                return null;
              }
              if (propertySchema?.items?.["$ref"]) {
                return resolveReferences(blocks[refId], resolveSchema(propertySchema.items["$ref"]));
              }
              return resolveReferences(blocks[refId], propertySchema);
            })
            .filter((v) => v !== null);
          resolved[key] = refs.length === 1 ? refs[0] : refs;
        }
      } else {
        // Non-ref values: coerce based on schema where possible
        if (propertySchema && propertySchema.type === "array") {
          // Empty or scalar should become []
          if (value === "") {
            resolved[key] = [];
          } else if (Array.isArray(value)) {
            resolved[key] = value;
          } else {
            // Best-effort: wrap a single parsed/coerced item if schema expects primitives
            const itemSchema = propertySchema.items;
            const coerced = coercePrimitive(parseValue(value), itemSchema && itemSchema.type);
            resolved[key] = [coerced];
          }
        } else if (propertySchema && propertySchema.type && propertySchema.type !== "object") {
          resolved[key] = coercePrimitive(parseValue(value), propertySchema.type);
        } else {
          resolved[key] = emptyObject ? {} : value;
        }
      }
    }
    return resolved;
  }

  tableDivs.forEach((tableNode) => {
    const rows = tableNode.children.filter((child) => child.type === "element");
    if (rows.length < 1) return;
    const blockName = tableNode.properties?.className?.[0];
    const refId = tableNode.properties?.className?.[1];
    if (blockName === DEFAULT_ROOT_NAME) {
      metadata = parseRowsToBlockData(rows);
      return;
    }
    const blockData = parseRowsToBlockData(rows);
    if (Object.keys(blockData).length > 0) {
      if (refId) {
        blocks[refId] = blockData;
        references[refId] = blockName;
      } else {
        blocks["__root__"] = blockData;
      }
    }
  });

  const rootData = blocks["__root__"] || {};
  effectiveSchema = await loadEffectiveSchema(schemaId);
  const resolvedRootSchema = resolveSchema(effectiveSchema);
  return { metadata, data: resolveReferences(rootData, resolvedRootSchema) };
}

export default class HtmlTableStorage {
  // Parse html into { metadata, data }
  async parseDocument(htmlString, opts = {}) {
    const asJson = await htmlToJson(htmlString, opts);
    return asJson;
  }
  // Serialize { formMeta, formData } into HTML fragment
  serializeDocument({ formMeta, formData }) {
    const form = jsonToHtml(formMeta || {}, DEFAULT_ROOT_NAME);
    const data = jsonToHtml(formData || {}, formMeta?.schemaId || 'data');
    return `${form}\n${data}`;
  }
}