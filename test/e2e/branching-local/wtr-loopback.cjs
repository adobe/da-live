// WTR advertises localhost but its HTTP server otherwise listens on all interfaces.
// Restrict only the package script's port; do not alter any unrelated listener.
const net = require('node:net');
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  if (args[0] === 2000) {
    if (typeof args[1] === 'string') args[1] = '127.0.0.1';
    else args.splice(1, 0, '127.0.0.1');
  } else if (args[0] && typeof args[0] === 'object' && args[0].port === 2000) {
    args[0] = { ...args[0], host: '127.0.0.1' };
  }
  return listen.apply(this, args);
};
