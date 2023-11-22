const SHEETS = {};

export default async function getSheet(url) {
  if (SHEETS[url]) return SHEETS[url];
  const resp = await fetch(url);
  const text = await resp.text();
  const sheet = new CSSStyleSheet();
  sheet.replace(text);
  SHEETS[url] = sheet;
  return sheet;
}
