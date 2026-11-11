export function readLandingBlocks(area) {
  return [...(area?.querySelectorAll('.greeting, .recent-files, .landing') ?? [])]
    .filter((block) => !block.closest('.browse'))
    .map((block) => {
      const clone = block.cloneNode(true);
      clone.hidden = false;
      return clone;
    });
}
