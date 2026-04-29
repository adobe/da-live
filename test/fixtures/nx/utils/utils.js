export const loadStyle = async () => {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync('');
  return sheet;
};

export const DA_ADMIN = 'https://admin.da.live';
