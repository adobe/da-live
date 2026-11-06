const LABEL_INSET = 16;

/**
 * Creates a canvas off screen that draws in CSS pixels on high density
 * screens too.
 *
 * @param {{ width: number, height: number }} size - The size in CSS pixels.
 * @returns {HTMLCanvasElement} The canvas.
 */
function createScaledCanvas({ width, height }) {
  const scale = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.className = 'drag-preview';
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  Object.assign(canvas.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${width}px`,
    height: `${height}px`,
    pointerEvents: 'none',
  });
  canvas.getContext('2d').scale(scale, scale);
  return canvas;
}

/**
 * Fills the canvas with a rounded background in the given element's color.
 *
 * @param {CanvasRenderingContext2D} context - The drawing context.
 * @param {{ width: number, height: number }} size - The size in CSS pixels.
 * @param {HTMLElement} source - The element whose background to copy.
 */
function drawBackground(context, { width, height }, source) {
  const { backgroundColor, borderRadius } = getComputedStyle(source);
  context.fillStyle = backgroundColor;
  context.beginPath();
  context.roundRect(0, 0, width, height, parseFloat(borderRadius) || 0);
  context.fill();
}

/**
 * Writes the element's text in the middle of the canvas, in the element's
 * font and color.
 *
 * @param {CanvasRenderingContext2D} context - The drawing context.
 * @param {{ width: number, height: number }} size - The size in CSS pixels.
 * @param {HTMLElement} element - The element whose text to write.
 */
function drawLabel(context, { width, height }, element) {
  const { font, color } = getComputedStyle(element);
  context.font = font;
  context.fillStyle = color;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(element.textContent.trim(), width / 2, height / 2, width - LABEL_INSET);
}

/**
 * Draws an element's text on a rounded background as a drag preview, instead
 * of the browser's default snapshot with square corners.
 *
 * @param {HTMLElement} element - The dragged element.
 * @param {HTMLElement} [background] - The element whose background and
 *   corners to copy, when the dragged element has none of its own.
 * @returns {HTMLCanvasElement} The drag preview.
 */
export default function drawDragPreview(element, background = element) {
  const size = element.getBoundingClientRect();
  const preview = createScaledCanvas(size);
  const context = preview.getContext('2d');
  drawBackground(context, size, background);
  drawLabel(context, size, element);
  return preview;
}
