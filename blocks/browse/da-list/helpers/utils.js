export default function aem2clipboard(items) {
  const aemUrls = items.reduce((acc, item) => {
    if (item.ext) {
      const path = item.path.replace('.html', '');
      const [org, repo, ...pathParts] = path.substring(1).split('/');
      const pageName = pathParts.pop();
      pathParts.push(pageName === 'index' ? '' : pageName);
      acc.push(`https://main--${repo}--${org}.aem.page/${pathParts.join('/')}`);
    }
    return acc;
  }, []);
  const blob = new Blob([aemUrls.join('\n')], { type: 'text/plain' });
  const data = [new ClipboardItem({ [blob.type]: blob })];
  navigator.clipboard.write(data);
}
