import type { WixOAuthToken } from 'trama-types';

export interface TokenStore {
  get(projectId: string): Promise<WixOAuthToken | null>;
  set(projectId: string, token: WixOAuthToken): Promise<void>;
}

export class InMemoryTokenStore implements TokenStore {
  private readonly tokens = new Map<string, WixOAuthToken>();

  async get(projectId: string): Promise<WixOAuthToken | null> {
    return this.tokens.get(projectId) ?? null;
  }

  async set(projectId: string, token: WixOAuthToken): Promise<void> {
    this.tokens.set(projectId, token);
  }
}
