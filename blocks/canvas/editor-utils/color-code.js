/** Does `str` look like a CSS color (hex, rgb/rgba, or a gradient function)? */
export function isColorCode(str) {
  const hexColorRegex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
  const rgbColorRegex = /^rgba?\(\s*(\d{1,3}\s*,\s*){2}\d{1,3}(\s*,\s*(0|1|0?\.\d+))?\s*\)$/;
  return hexColorRegex.test(str) || rgbColorRegex.test(str) || !!str?.includes('-gradient(');
}
