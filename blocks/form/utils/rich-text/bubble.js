/**
 * Places the bubble above the selection, or below it when there is no room above. The
 * bubble centers on a selection within one line, and on the rest of the first line of a
 * longer one.
 * @param {object} options The selection and the bubble.
 * @param {{ top: number, bottom: number, left: number }} options.start The coordinates of the
 *   selection start.
 * @param {{ top: number, bottom: number, left: number }} options.end The coordinates of the
 *   selection end.
 * @param {DOMRect} options.area The rectangle of the bubble's offset parent.
 * @param {number} options.width The width of the bubble.
 * @param {number} options.height The height of the bubble.
 * @param {number} [options.edge] The least distance to the sides of the area.
 * @param {number} [options.gap] The distance to the selection.
 * @returns {{ left: number, top: number, hidden: boolean }} The position relative to the
 *   area, and whether the selection start scrolled out of it.
 */
export function placeBubble({
  start, end, area, width, height, edge = 8, gap = 10,
}) {
  const onOneLine = Math.abs(end.top - start.top) < 1;
  const lineEnd = onOneLine ? end.left : area.right;
  const center = (start.left + lineEnd) / 2 - area.left;
  const left = Math.max(edge, Math.min(center - width / 2, area.width - width - edge));
  const above = start.top - height - gap;
  const top = (above < area.top ? end.bottom + gap : above) - area.top;
  const hidden = start.top < area.top || start.top > area.bottom;
  return { left, top, hidden };
}
