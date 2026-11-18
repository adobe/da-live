const LABEL_INSET = 16;

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

function drawBackground(context, { width, height }, source) {
  const { backgroundColor, borderRadius } = getComputedStyle(source);
  context.fillStyle = backgroundColor;
  context.beginPath();
  context.roundRect(0, 0, width, height, parseFloat(borderRadius) || 0);
  context.fill();
}

function drawLabel(context, { width, height }, element) {
  const { font, color } = getComputedStyle(element);
  context.font = font;
  context.fillStyle = color;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(element.textContent.trim(), width / 2, height / 2, width - LABEL_INSET);
}

export default function drawDragPreview(element, background = element) {
  const size = element.getBoundingClientRect();
  const preview = createScaledCanvas(size);
  const context = preview.getContext('2d');
  drawBackground(context, size, background);
  drawLabel(context, size, element);
  return preview;
}
