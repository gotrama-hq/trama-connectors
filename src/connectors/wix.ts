import type {
  TramaProduct, TramaCollection, TramaCart, CartItemInput, WixOAuthToken, FetchProductsOptions,
} from 'trama-types';
import type { PlatformConnector } from '../platform-connector.js';
import type { Logger } from '../logger.js';
import type { TokenStore } from '../token-store.js';
import { silentLogger } from '../logger.js';
import { InMemoryTokenStore } from '../token-store.js';
import { CircuitBreaker } from '../circuit-breaker.js';
import { ConnectorError } from '../errors.js';
import {
  WIX_STORES_APP_ID,
  normalizeWixProduct,
  normalizeWixCart,
  normalizeWixCollection,
  type RawWixProduct,
  type RawWixCart,
  type RawWixCollection,
} from '../normalizers/wix.js';

const WIX_API_BASE = 'https://www.wixapis.com';
const TOKEN_REFRESH_LEAD_MS = 5 * 60_000;

interface RawWixVariant {
  _id?: string;
  variant?: { sku?: string; price?: number };
  choices?: Record<string, string>;
  stock?: { inStock?: boolean; quantity?: number; trackQuantity?: boolean };
}

export interface WixConnectorOptions {
  
  clientId?: string;
  clientSecret?: string;
  
  projectId?: string;
  logger?: Logger;
  tokenStore?: TokenStore;
  
  apiBase?: string;
}

export class WixConnector implements PlatformConnector {
  private readonly breaker = new CircuitBreaker();
  private readonly logger: Logger;
  private readonly tokenStore: TokenStore;
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly projectId: string;
  private readonly apiBase: string;
  private currentToken: WixOAuthToken;

  constructor(token: WixOAuthToken, options: WixConnectorOptions = {}) {
    this.currentToken = token;
    this.logger       = options.logger     ?? silentLogger;
    this.tokenStore   = options.tokenStore ?? new InMemoryTokenStore();
    this.clientId     = options.clientId;
    this.clientSecret = options.clientSecret;
    this.projectId    = options.projectId  ?? 'default';
    this.apiBase      = options.apiBase    ?? WIX_API_BASE;
  }

  private async ensureFreshToken(): Promise<string> {
    const expiresAt = new Date(this.currentToken.expiresAt).getTime();
    if (Date.now() < expiresAt - TOKEN_REFRESH_LEAD_MS) {
      return this.currentToken.accessToken;
    }
    if (!this.clientId || !this.clientSecret) {
      return this.currentToken.accessToken;
    }

    const fresh = await this.refreshTokens(this.currentToken.refreshToken);
    this.currentToken = fresh;
    await this.tokenStore.set(this.projectId, fresh);
    this.logger.info({ projectId: this.projectId }, 'Wix token refreshed');
    return fresh.accessToken;
  }

  private async refreshTokens(refreshToken: string): Promise<WixOAuthToken> {
    const res = await fetch(`${this.apiBase}/oauth/access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
      }),
    });
    if (!res.ok) {
      throw new ConnectorError('CONNECTOR_AUTH', `Wix token refresh failed: ${res.status}`, { status: res.status, platform: 'wix' });
    }
    const data = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
    };
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    return this.breaker.execute(async () => {
      const accessToken = await this.ensureFreshToken();
      const res = await fetch(`${this.apiBase}${path}`, {
        ...init,
        headers: {
          'Authorization': accessToken,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...init.headers,
        },
      });
      if (res.status === 401) {
        throw new ConnectorError('CONNECTOR_AUTH', 'Wix returned 401 — token rejected', { status: 401, platform: 'wix' });
      }
      if (res.status === 429) {
        throw new ConnectorError('CONNECTOR_RATE_LIMIT', 'Wix rate limit hit', { status: 429, platform: 'wix' });
      }
      if (!res.ok) {
        throw new ConnectorError('CONNECTOR_UPSTREAM', `Wix API error: ${res.status}`, { status: res.status, platform: 'wix' });
      }
      return res.json() as Promise<T>;
    });
  }

  async fetchProducts(options: FetchProductsOptions): Promise<TramaProduct[]> {
    const limit = Math.min(options.limit ?? 100, 100);
    const page  = options.page ?? 1;
    const offset = Math.max(0, (page - 1) * limit);

    const query: Record<string, unknown> = { paging: { limit, offset } };
    if (options.collectionId) {
      query['filter'] = JSON.stringify({ collectionIds: { $hasSome: [options.collectionId] } });
    }

    const data = await this.request<{ products: RawWixProduct[] }>('/stores/v1/products/query', {
      method: 'POST',
      body: JSON.stringify({ query }),
    });

    const products = (data.products ?? []).map(normalizeWixProduct);

    return Promise.all(
      products.map(async (p) => {
        if (!p.platformId) return p;
        const variants = await this.safeFetchVariants(p.platformId);
        return { ...p, variants };
      }),
    );
  }

  async fetchProduct(id: string): Promise<TramaProduct | null> {
    try {
      const data = await this.request<{ product: RawWixProduct }>(`/stores/v1/products/${id}`);
      const product = normalizeWixProduct(data.product);
      if (product.platformId) {
        product.variants = await this.safeFetchVariants(product.platformId);
      }
      return product;
    } catch (err) {
      this.logger.warn({ id, err }, 'fetchProduct failed');
      return null;
    }
  }

  private async safeFetchVariants(productId: string): Promise<TramaProduct['variants']> {
    try {
      const data = await this.request<{ variants?: RawWixVariant[] }>(
        `/stores/v1/products/${productId}/variants/query`,
        { method: 'POST', body: JSON.stringify({ query: {} }) },
      );
      return (data.variants ?? []).map((v) => ({
        id: v._id ?? '',
        platformId: v._id ?? '',
        name: Object.values(v.choices ?? {}).join(' / ') || 'Default',
        options: v.choices ?? {},
        price: { amount: Math.round((v.variant?.price ?? 0) * 100), currency: 'USD', formatted: '' },
        stock: {
          status: v.stock?.inStock ? 'in_stock' : 'out_of_stock',
          quantity: v.stock?.quantity ?? null,
          trackInventory: v.stock?.trackQuantity ?? false,
        },
        sku: v.variant?.sku ?? null,
      }));
    } catch {
      return [];
    }
  }

  async fetchCollections(): Promise<TramaCollection[]> {
    const data = await this.request<{ collections: RawWixCollection[] }>(
      '/stores/v1/collections/query',
      { method: 'POST', body: JSON.stringify({ query: {} }) },
    );
    return (data.collections ?? []).map(normalizeWixCollection);
  }

  async getCart(cartId: string): Promise<TramaCart | null> {
    try {
      const data = await this.request<{ cart: RawWixCart }>(`/ecom/v1/carts/${cartId}`);
      return normalizeWixCart(data.cart);
    } catch {
      return null;
    }
  }

  async createCart(items: CartItemInput[]): Promise<TramaCart> {
    const lineItems = items.map((item) => ({
      catalogReference: {
        appId: WIX_STORES_APP_ID,
        catalogItemId: item.productId,
        options: item.variantId ? { variantId: item.variantId } : undefined,
      },
      quantity: item.quantity,
    }));
    const data = await this.request<{ cart: RawWixCart }>('/ecom/v1/carts', {
      method: 'POST',
      body: JSON.stringify({ cart: { lineItems } }),
    });
    return normalizeWixCart(data.cart);
  }

  async addToCart(cartId: string, item: CartItemInput): Promise<TramaCart> {
    const lineItems = [{
      catalogReference: {
        appId: WIX_STORES_APP_ID,
        catalogItemId: item.productId,
        options: item.variantId ? { variantId: item.variantId } : undefined,
      },
      quantity: item.quantity,
    }];
    const data = await this.request<{ cart: RawWixCart }>(`/ecom/v1/carts/${cartId}/add-to-cart`, {
      method: 'POST',
      body: JSON.stringify({ lineItems }),
    });
    return normalizeWixCart(data.cart);
  }

  async updateCartItem(cartId: string, lineItemId: string, quantity: number): Promise<TramaCart> {
    const data = await this.request<{ cart: RawWixCart }>(`/ecom/v1/carts/${cartId}/update-line-items-quantity`, {
      method: 'POST',
      body: JSON.stringify({ lineItems: [{ id: lineItemId, quantity }] }),
    });
    return normalizeWixCart(data.cart);
  }

  async removeCartItem(cartId: string, lineItemId: string): Promise<TramaCart> {
    const data = await this.request<{ cart: RawWixCart }>(`/ecom/v1/carts/${cartId}/remove-line-items`, {
      method: 'POST',
      body: JSON.stringify({ lineItemIds: [lineItemId] }),
    });
    return normalizeWixCart(data.cart);
  }

  async getCheckoutUrl(cartId: string): Promise<string> {
    const data = await this.request<{ checkout: { _id: string } }>(`/ecom/v1/carts/${cartId}/create-checkout`, {
      method: 'POST',
      body: JSON.stringify({ channelType: 'WEB' }),
    });
    return `https://www.wix.com/checkout/${data.checkout._id}`;
  }

  async fetchCmsItems(collectionId: string): Promise<unknown[]> {
    try {
      const data = await this.request<{ dataItems: unknown[] }>(`/wix-data/v2/items/query`, {
        method: 'POST',
        body: JSON.stringify({ dataCollectionId: collectionId, query: {} }),
      });
      return data.dataItems ?? [];
    } catch {
      return [];
    }
  }
}
