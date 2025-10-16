import DA_SDK from 'https://da.live/nx/utils/sdk.js';

/**
 * AuthService
 * Centralized, app-wide auth status for DA SDK-backed flows.
 */
export class AuthService {
  constructor(context = {}) {
    this._context = context || {};
  }

  /** Returns { authenticated: boolean } using DA_SDK.token. */
  async getStatus() {
    try {
      const token = await this.getToken();
      return { authenticated: !!token };
    } catch {
      return { authenticated: false };
    }
  }

  /** Returns the raw DA SDK token or null. */
  async getToken() {
    try {
      const { token } = await DA_SDK;
      return token || null;
    } catch {
      return null;
    }
  }
}

export default AuthService;


