const SIDEKICK_ID = 'igkmdomcgoebiipaifhmpfjhbjccggml';

export const NO_SIDEKICK = 'no-sidekick';

/**
 * Gets the Sidekick ID from localStorage or uses the default.
 * @returns {string} The Sidekick ID.
 */
export function getSidekickId() {
  return localStorage.getItem('aem-sidekick-id')?.trim() || SIDEKICK_ID;
}

/**
 * Sends a message to the Sidekick extension.
 * @param {Object} message The message
 * @param {Function} [callback] The callback function
 * @param {number} [timeout=200] The number of milliseconds to wait for a response
 */
export async function messageSidekick(message, callback, timeout = 200) {
  return new Promise((resolve) => {
    const { chrome } = window;
    if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
      let messageResolved = false;
      chrome.runtime.sendMessage(
        getSidekickId(),
        message,
        (response) => {
          if (response) {
            if (callback) {
              callback(response);
            }
            messageResolved = true;
            resolve(response);
          }
        },
      );

      setTimeout(() => {
        if (!messageResolved) {
          resolve(NO_SIDEKICK);
        }
      }, timeout);
    } else {
      resolve(NO_SIDEKICK);
    }
  });
}
