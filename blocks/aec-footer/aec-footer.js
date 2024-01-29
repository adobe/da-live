export default async function init(el) {
  // Shamelessly delay the footer to prevent CLS while fetching data async in the main blocks
  setTimeout(async () => {
    const resp = await fetch('/fragments/footer.plain.html');
    if (!resp.ok) return;
    const html = await resp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const section = doc.body.querySelector('div');
    section.className = 'footer-inner';
    el.append(section);
  }, 3000);
}
