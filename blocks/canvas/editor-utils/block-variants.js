export function normalizeBlockName(name) {
  return (name || '').toLowerCase().replace(/[\s_-]+/g, ' ').trim();
}

export function splitLibraryVariant(variant) {
  const header = variant?.dom?.tagName === 'TABLE'
    ? variant.dom.rows[0]?.cells[0]?.textContent?.trim() : null;
  const name = header ?? variant?.name ?? '';
  const match = name.match(/^(.*\S)\s*\(([^)]+)\)\s*$/);
  if (match) return { base: match[1].trim(), variant: match[2].trim() };
  if (!header && variant?.variants) return { base: name, variant: variant.variants };
  return { base: name, variant: '' };
}

export async function getBlockVariantOptions(blocks, blockName) {
  const target = normalizeBlockName(blockName);
  const found = new Set();
  await Promise.all((blocks || []).map(async (block) => {
    const variants = (await block.loadVariants) || [];
    variants.forEach((v) => {
      const { base, variant } = splitLibraryVariant(v);
      if (variant && normalizeBlockName(base) === target) found.add(variant);
    });
  }));
  return [...found];
}
