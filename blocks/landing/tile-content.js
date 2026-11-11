export function parseTileEntries(block) {
  return [...(block?.children || [])].flatMap((row) => {
    const [icon, content, metadata] = row.children;
    const options = [...(metadata?.childNodes || [])].map((node) => node.textContent).join(' ');
    const link = content?.querySelector('h3 a');
    const iconName = icon?.textContent.trim().match(/^:(s2-icon-[a-z0-9-]+):$/)?.[1]
      || icon?.querySelector('span.icon')?.className.match(/\bicon-(s2-icon-[a-z0-9-]+)\b/)?.[1];
    if (!link?.textContent.trim() || !link.getAttribute('href') || !iconName) {
      // eslint-disable-next-line no-console
      console.warn('Skipped a Landing row without an icon or an H3 title link.', row);
      return [];
    }
    return [{
      id: options.match(/\bid:\s*([a-z0-9-]+)/i)?.[1]
        || link.closest('h3').id || iconName,
      heading: link.textContent.trim(),
      description: [...content.querySelectorAll('li, p:not(li p)')]
        .map((item) => item.textContent.trim()).join(' '),
      iconHref: `/img/icons/${iconName}.svg`,
      href: link.getAttribute('href'),
      tone: options.match(/\btone:\s*([a-z0-9-]+)/i)?.[1].toLowerCase(),
    }];
  });
}

export function readTileEntries(block) {
  const entries = parseTileEntries(block);
  return entries.length ? { entries } : { error: 'No quick links are configured.' };
}
