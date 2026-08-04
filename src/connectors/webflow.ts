import type {
  TramaProduct, TramaCollection, TramaCart, CartItemInput, WixOAuthToken, FetchProductsOptions,
} from 'trama-types';
import type { PlatformConnector } from '../platform-connector.js';
import type { Logger } from '../logger.js';
import { silentLogger } from '../logger.js';
import { CircuitBreaker } from '../circuit-breaker.js';
import { ConnectorError } from '../errors.js';
import {
  normalizeWebflowProduct, normalizeWebflowCart, normalizeWebflowCategory,
  type RawWebflowProduct, type RawWebflowCart, type RawWebflowCategory,
} from '../normalizers/webflow.js';

const WEBFLOW_BASE = 'https://api.webflow.com/v2';

export interface WebflowStoredToken extends WixOAuthToken {
  
  siteId: string;
  
  siteDomain?: string;
}

export interface WebflowConnectorOptions {
  projectId?: string;
  logger?: Logger;
  apiBase?: string;
}

export class WebflowConnector implements PlatformConnector {
  private readonly breaker = new CircuitBreaker();
  private readonly logger: Logger;
  private readonly accessToken: string;
  private readonly siteId: string;
  private readonly siteDomain: string;
  private readonly projectId: string;
  private readonly apiBase: string;

  constructor(token: WixOAuthToken, options: WebflowConnectorOptions = {}) {
    const stored = token as WebflowStoredToken;
    this.accessToken = token.accessToken;
    this.siteId      = stored.siteId ?? '';
    this.siteDomain  = stored.siteDomain ?? '';
    this.logger      = options.logger ?? silentLogger;
    this.projectId   = options.projectId ?? 'default';
    this.apiBase     = options.apiBase ?? WEBFLOW_BASE;

    if (!this.siteId) {
      this.logger.warn({ projectId: this.projectId }, 'WebflowConnector: missing siteId — all queries will fail');
    }
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.siteId) {
      throw new ConnectorError('CONNECTOR_NOT_CONFIGURED', 'WebflowConnector requires siteId', { platform: 'webflow' });
    }
    return this.breaker.execute(async () => {
      const res = await fetch(`${this.apiBase}${path}`, {
        ...init,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...init.headers,
        },
      });
      if (res.status === 401) {
        throw new ConnectorError('CONNECTOR_AUTH', 'Webflow token rejected', { status: 401, platform: 'webflow' });
      }
      if (res.status === 429) {
        throw new ConnectorError('CONNECTOR_RATE_LIMIT', 'Webflow rate limit hit', { status: 429, platform: 'webflow' });
      }
      if (!res.ok) {
        throw new ConnectorError('CONNECTOR_UPSTREAM', `Webflow API error: ${res.status}`, { status: res.status, platform: 'webflow' });
      }
      return res.json() as Promise<T>;
    });
  }

  private async resolveSkuId(productId: string, variantId?: string): Promise<string> {
    if (variantId) return variantId;
    const data = await this.request<{ skus: Array<{ id: string }> }>(`/sites/${this.siteId}/products/${productId}`);
    const first = data.skus?.[0]?.id;
    if (!first) throw new ConnectorError('CONNECTOR_VALIDATION', `Product ${productId} has no SKUs`, { platform: 'webflow' });
    return first;
  }

  async fetchProducts(options: FetchProductsOptions): Promise<TramaProduct[]> {
    const limit = Math.min(options.limit ?? 100, 100);
    const offset = options.page ? Math.max(0, (options.page - 1) * limit) : 0;
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });

    const data = await this.request<{ items: RawWebflowProduct[] }>(`/sites/${this.siteId}/products?${params}`);
    let items = data.items ?? [];
    if (options.collectionId) {
      items = items.filter((p) => p.fieldData.categories?.includes(options.collectionId!));
    }
    return items.map(normalizeWebflowProduct);
  }

  async fetchProduct(id: string): Promise<TramaProduct | null> {
    try {
      const data = await this.request<RawWebflowProduct>(`/sites/${this.siteId}/products/${id}`);
      return normalizeWebflowProduct(data);
    } catch {
      return null;
    }
  }

  async fetchCollections(): Promise<TramaCollection[]> {
    const data = await this.request<{ items: RawWebflowCategory[] }>(`/sites/${this.siteId}/product-categories?limit=100`);
    return (data.items ?? []).map(normalizeWebflowCategory);
  }

  async getCart(cartId: string): Promise<TramaCart | null> {
    try {
      const data = await this.request<RawWebflowCart>(`/carts/${cartId}`);
      return normalizeWebflowCart(data);
    } catch {
      return null;
    }
  }

  async createCart(items: CartItemInput[]): Promise<TramaCart> {
    const lineItems = await Promise.all(
      items.map(async (item) => ({
        variantId: await this.resolveSkuId(item.productId, item.variantId),
        quantity: item.quantity,
      })),
    );
    const data = await this.request<RawWebflowCart>(`/sites/${this.siteId}/carts`, {
      method: 'POST',
      body: JSON.stringify({ lineItems }),
    });
    return normalizeWebflowCart(data);
  }

  async addToCart(cartId: string, item: CartItemInput): Promise<TramaCart> {
    const variantId = await this.resolveSkuId(item.productId, item.variantId);
    const data = await this.request<RawWebflowCart>(`/carts/${cartId}/add-items`, {
      method: 'POST',
      body: JSON.stringify({ lineItems: [{ variantId, quantity: item.quantity }] }),
    });
    return normalizeWebflowCart(data);
  }

  async updateCartItem(cartId: string, lineItemId: string, quantity: number): Promise<TramaCart> {
    const data = await this.request<RawWebflowCart>(`/carts/${cartId}/update-item`, {
      method: 'PATCH',
      body: JSON.stringify({ lineItemId, quantity }),
    });
    return normalizeWebflowCart(data);
  }

  async removeCartItem(cartId: string, lineItemId: string): Promise<TramaCart> {
    const data = await this.request<RawWebflowCart>(`/carts/${cartId}/remove-item`, {
      method: 'DELETE',
      body: JSON.stringify({ lineItemId }),
    });
    return normalizeWebflowCart(data);
  }

  async getCheckoutUrl(cartId: string): Promise<string> {
    const data = await this.request<{ id: string; checkoutUrl?: string }>(`/carts/${cartId}`);
    if (data.checkoutUrl) return data.checkoutUrl;
    if (this.siteDomain) return `https://${this.siteDomain}/checkout?sessionToken=${cartId}`;
    throw new ConnectorError('CONNECTOR_UPSTREAM', 'No checkoutUrl available', { platform: 'webflow' });
  }

  async fetchCmsItems(collectionId: string): Promise<unknown[]> {
    try {
      const data = await this.request<{ items: Array<{ id: string; createdOn: string; lastUpdated: string; fieldData: Record<string, unknown> }> }>(
        `/collections/${collectionId}/items?limit=100`,
      );
      return (data.items ?? []).map((item) => ({
        id: item.id,
        createdOn: item.createdOn,
        lastUpdated: item.lastUpdated,
        ...item.fieldData,
      }));
    } catch {
      return [];
    }
  }
}
