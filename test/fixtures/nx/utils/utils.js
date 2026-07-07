export const loadStyle = async () => {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync('');
  return sheet;
};

export const loadScript = async () => {};

export const DA_ADMIN = 'https://admin.da.live';
