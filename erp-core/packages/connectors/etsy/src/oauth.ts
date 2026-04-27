// ============================================================
// Etsy OAuth 2.0 + PKCE
// ============================================================

import crypto from 'crypto';

const ETSY_AUTH_URL = 'https://www.etsy.com/oauth/connect';
const ETSY_TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';
const ETSY_API_BASE = 'https://api.etsy.com/v3';

export interface EtsyToken {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface EtsyConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export class EtsyOAuth {
  private config: EtsyConfig;

  constructor(config: EtsyConfig) {
    this.config = config;
  }

  /**
   * Generate PKCE code verifier and challenge
   */
  generatePKCE() {
    const verifier = crypto.randomBytes(32)
      .toString('base64url')
      .replace(/[^a-zA-Z0-9._~-]/g, '');

    const challenge = crypto.createHash('sha256')
      .update(verifier)
      .digest('base64url');

    const state = crypto.randomBytes(16).toString('hex');

    return { verifier, challenge, state };
  }

  /**
   * Build authorization URL
   */
  getAuthorizationUrl(verifier: string, challenge: string, state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(' '),
      client_id: this.config.clientId,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    return `${ETSY_AUTH_URL}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async getTokenFromCode(code: string, verifier: string): Promise<EtsyToken> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.config.redirectUri,
      code,
      code_verifier: verifier,
    });

    const response = await fetch(ETSY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Etsy token exchange failed: ${err}`);
    }

    return response.json();
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<EtsyToken> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: refreshToken,
    });

    const response = await fetch(ETSY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Etsy token refresh failed: ${err}`);
    }

    return response.json();
  }

  /**
   * Make authenticated API call to Etsy
   */
  async apiCall<T = any>(
    method: string,
    path: string,
    accessToken: string,
    body?: any,
  ): Promise<T> {
    const url = `${ETSY_API_BASE}${path}`;
    const headers: Record<string, string> = {
      'x-api-key': this.config.clientId,
      'Authorization': `Bearer ${accessToken}`,
    };

    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Etsy API error (${response.status}): ${err}`);
    }

    return response.json();
  }
}
