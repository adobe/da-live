export function normalizeBlockName(name) {
  return (name || '').toLowerCase().replace(/[\s_-]+/g, ' ').trim();
}

function splitLibraryVariant(variant) {
  if (variant?.variants) return { base: variant.name || '', variant: variant.variants };
  const match = (variant?.name || '').match(/^(.*\S)\s*\(([^)]+)\)\s*$/);
  if (match) return { base: match[1].trim(), variant: match[2].trim() };
  return { base: variant?.name || '', variant: '' };
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
