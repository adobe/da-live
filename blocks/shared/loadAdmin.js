import { daFetch } from './utils.js';
import { origin } from './constants.js';

let adminJson;
export default function loadAdmin(name) {
  adminJson = adminJson || new Promise((resolve) => {
    if (name === 'browse') {
      daFetch(`${origin}/list`).then((resp) => {
        if (!resp.ok) return;
        resp.json().then((json) => {
          adminJson = json;
          resolve(adminJson);
        });
      });
    }
  });
  return adminJson;
}
