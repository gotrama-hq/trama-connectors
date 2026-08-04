import type {
  TramaProduct, TramaCollection, TramaCart, CartItemInput, WixOAuthToken, FetchProductsOptions,
} from 'trama-types';
import type { PlatformConnector } from '../platform-connector.js';
import type { Logger } from '../logger.js';
import { silentLogger } from '../logger.js';
import { CircuitBreaker } from '../circuit-breaker.js';
import { ConnectorError } from '../errors.js';
import {
  normalizeShopifyProduct, normalizeShopifyCollection, normalizeShopifyCart,
  type RawShopifyProduct, type RawShopifyCollection, type RawShopifyCart,
} from '../normalizers/shopify.js';

const SHOPIFY_API_VERSION = '2024-07';

export interface ShopifyConnectorOptions {
  
  shopDomain?: string;
  projectId?: string;
  logger?: Logger;
}

export interface ShopifyStoredToken extends WixOAuthToken {
  
  shopDomain: string;
}

const PRODUCT_FIELDS = `
  id title handle description tags availableForSale
  priceRange { minVariantPrice { amount currencyCode } }
  compareAtPriceRange { minVariantPrice { amount currencyCode } }
  images(first: 10) { edges { node { url altText width height } } }
  variants(first: 100) {
    edges { node {
      id title sku availableForSale quantityAvailable
      price { amount currencyCode }
      compareAtPrice { amount currencyCode }
      selectedOptions { name value }
      image { url altText width height }
    }}
  }
  collections(first: 10) { edges { node { id } } }
  createdAt updatedAt
  seo { title description }
`;

const CART_FIELDS = `
  id checkoutUrl createdAt updatedAt
  lines(first: 100) { edges { node {
    id quantity
    cost {
      totalAmount    { amount currencyCode }
      subtotalAmount { amount currencyCode }
    }
    merchandise {
      ... on ProductVariant {
        __typename id title
        image { url altText width height }
        price { amount currencyCode }
        product { id title }
      }
    }
  }}}
  cost { subtotalAmount { amount currencyCode } totalAmount { amount currencyCode } }
`;

export class ShopifyConnector implements PlatformConnector {
  private readonly breaker = new CircuitBreaker();
  private readonly logger: Logger;
  private readonly storefrontToken: string;
  private readonly storefrontEndpoint: string;
  private readonly projectId: string;

  constructor(token: WixOAuthToken, options: ShopifyConnectorOptions = {}) {
    const stored = token as ShopifyStoredToken;
    this.storefrontToken    = token.accessToken;
    this.storefrontEndpoint = (options.shopDomain ?? stored.shopDomain)
      ? `https://${options.shopDomain ?? stored.shopDomain}/api/${SHOPIFY_API_VERSION}/graphql.json`
      : '';
    this.logger    = options.logger ?? silentLogger;
    this.projectId = options.projectId ?? 'default';

    if (!this.storefrontEndpoint) {
      this.logger.warn({ projectId: this.projectId }, 'ShopifyConnector: missing shopDomain — all queries will fail');
    }
  }

  private async gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    if (!this.storefrontEndpoint) {
      throw new ConnectorError('CONNECTOR_NOT_CONFIGURED', 'ShopifyConnector requires shopDomain', { platform: 'shopify' });
    }
    return this.breaker.execute(async () => {
      const res = await fetch(this.storefrontEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': this.storefrontToken,
          'Accept': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
      });
      if (!res.ok) {
        throw new ConnectorError('CONNECTOR_UPSTREAM', `Shopify GraphQL HTTP ${res.status}`, { status: res.status, platform: 'shopify' });
      }
      const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
      if (json.errors && json.errors.length > 0) {
        this.logger.warn({ errors: json.errors }, 'Shopify GraphQL errors');
        throw new ConnectorError('CONNECTOR_UPSTREAM', json.errors[0]!.message, { platform: 'shopify' });
      }
      if (!json.data) {
        throw new ConnectorError('CONNECTOR_UPSTREAM', 'Shopify GraphQL: empty response', { platform: 'shopify' });
      }
      return json.data;
    });
  }

  private async resolveVariantId(productId: string, variantId?: string): Promise<string> {
    if (variantId) return variantId;
    const data = await this.gql<{ product: { variants: { edges: Array<{ node: { id: string } }> } } | null }>(
      `query ProductFirstVariant($id: ID!) { product(id: $id) { variants(first: 1) { edges { node { id } } } } }`,
      { id: productId },
    );
    const first = data.product?.variants.edges[0]?.node.id;
    if (!first) throw new ConnectorError('CONNECTOR_VALIDATION', `No variant found for product ${productId}`, { platform: 'shopify' });
    return first;
  }

  async fetchProducts(options: FetchProductsOptions): Promise<TramaProduct[]> {
    const limit = Math.min(options.limit ?? 50, 250);

    if (options.collectionId) {
      const data = await this.gql<{
        collection: { products: { edges: Array<{ node: RawShopifyProduct }> } } | null;
      }>(
        `query ProductsByCollection($id: ID!, $first: Int!) {
          collection(id: $id) { products(first: $first) { edges { node { ${PRODUCT_FIELDS} } } } }
        }`,
        { id: options.collectionId, first: limit },
      );
      if (!data.collection) return [];
      return data.collection.products.edges.map(({ node }) => normalizeShopifyProduct(node));
    }

    const data = await this.gql<{ products: { edges: Array<{ node: RawShopifyProduct }> } }>(
      `query Products($first: Int!) { products(first: $first) { edges { node { ${PRODUCT_FIELDS} } } } }`,
      { first: limit },
    );
    return data.products.edges.map(({ node }) => normalizeShopifyProduct(node));
  }

  async fetchProduct(id: string): Promise<TramaProduct | null> {
    try {
      const data = await this.gql<{ product: RawShopifyProduct | null }>(
        `query Product($id: ID!) { product(id: $id) { ${PRODUCT_FIELDS} } }`,
        { id },
      );
      return data.product ? normalizeShopifyProduct(data.product) : null;
    } catch {
      return null;
    }
  }

  async fetchCollections(): Promise<TramaCollection[]> {
    const data = await this.gql<{ collections: { edges: Array<{ node: RawShopifyCollection }> } }>(
      `query Collections($first: Int!) {
        collections(first: $first) {
          edges { node {
            id title handle description
            image { url altText width height }
            products(first: 250) { edges { node { id } } }
          }}
        }
      }`,
      { first: 250 },
    );
    return data.collections.edges.map(({ node }) => normalizeShopifyCollection(node));
  }

  async getCart(cartId: string): Promise<TramaCart | null> {
    try {
      const data = await this.gql<{ cart: RawShopifyCart | null }>(
        `query Cart($cartId: ID!) { cart(id: $cartId) { ${CART_FIELDS} } }`,
        { cartId },
      );
      return data.cart ? normalizeShopifyCart(data.cart) : null;
    } catch {
      return null;
    }
  }

  async createCart(items: CartItemInput[]): Promise<TramaCart> {
    const lines = await Promise.all(
      items.map(async (item) => ({
        merchandiseId: await this.resolveVariantId(item.productId, item.variantId),
        quantity: item.quantity,
      })),
    );
    const data = await this.gql<{ cartCreate: { cart: RawShopifyCart | null; userErrors: Array<{ message: string }> } }>(
      `mutation CartCreate($lines: [CartLineInput!]!) {
        cartCreate(input: { lines: $lines }) { cart { ${CART_FIELDS} } userErrors { field message } }
      }`,
      { lines },
    );
    if (data.cartCreate.userErrors.length > 0 || !data.cartCreate.cart) {
      throw new ConnectorError('CONNECTOR_UPSTREAM', data.cartCreate.userErrors[0]?.message ?? 'cartCreate failed', { platform: 'shopify' });
    }
    return normalizeShopifyCart(data.cartCreate.cart);
  }

  async addToCart(cartId: string, item: CartItemInput): Promise<TramaCart> {
    const merchandiseId = await this.resolveVariantId(item.productId, item.variantId);
    const data = await this.gql<{ cartLinesAdd: { cart: RawShopifyCart | null; userErrors: Array<{ message: string }> } }>(
      `mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
        cartLinesAdd(cartId: $cartId, lines: $lines) { cart { ${CART_FIELDS} } userErrors { field message } }
      }`,
      { cartId, lines: [{ merchandiseId, quantity: item.quantity }] },
    );
    if (data.cartLinesAdd.userErrors.length > 0 || !data.cartLinesAdd.cart) {
      throw new ConnectorError('CONNECTOR_UPSTREAM', data.cartLinesAdd.userErrors[0]?.message ?? 'cartLinesAdd failed', { platform: 'shopify' });
    }
    return normalizeShopifyCart(data.cartLinesAdd.cart);
  }

  async updateCartItem(cartId: string, lineItemId: string, quantity: number): Promise<TramaCart> {
    const data = await this.gql<{ cartLinesUpdate: { cart: RawShopifyCart | null; userErrors: Array<{ message: string }> } }>(
      `mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
        cartLinesUpdate(cartId: $cartId, lines: $lines) { cart { ${CART_FIELDS} } userErrors { field message } }
      }`,
      { cartId, lines: [{ id: lineItemId, quantity }] },
    );
    if (!data.cartLinesUpdate.cart) {
      throw new ConnectorError('CONNECTOR_UPSTREAM', data.cartLinesUpdate.userErrors[0]?.message ?? 'cartLinesUpdate failed', { platform: 'shopify' });
    }
    return normalizeShopifyCart(data.cartLinesUpdate.cart);
  }

  async removeCartItem(cartId: string, lineItemId: string): Promise<TramaCart> {
    const data = await this.gql<{ cartLinesRemove: { cart: RawShopifyCart | null; userErrors: Array<{ message: string }> } }>(
      `mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
        cartLinesRemove(cartId: $cartId, lineIds: $lineIds) { cart { ${CART_FIELDS} } userErrors { field message } }
      }`,
      { cartId, lineIds: [lineItemId] },
    );
    if (!data.cartLinesRemove.cart) {
      throw new ConnectorError('CONNECTOR_UPSTREAM', data.cartLinesRemove.userErrors[0]?.message ?? 'cartLinesRemove failed', { platform: 'shopify' });
    }
    return normalizeShopifyCart(data.cartLinesRemove.cart);
  }

  async getCheckoutUrl(cartId: string): Promise<string> {
    const data = await this.gql<{ cart: { checkoutUrl: string } | null }>(
      `query CartCheckoutUrl($cartId: ID!) { cart(id: $cartId) { checkoutUrl } }`,
      { cartId },
    );
    if (!data.cart?.checkoutUrl) {
      throw new ConnectorError('CONNECTOR_UPSTREAM', 'No checkoutUrl on cart', { platform: 'shopify' });
    }
    return data.cart.checkoutUrl;
  }

  async fetchCmsItems(collectionId: string): Promise<unknown[]> {
    try {
      const data = await this.gql<{
        metaobjects: { edges: Array<{ node: { id: string; handle: string; type: string; fields: Array<{ key: string; jsonValue: unknown }> } }> };
      }>(
        `query Metaobjects($type: String!, $first: Int!) {
          metaobjects(type: $type, first: $first) { edges { node { id handle type fields { key jsonValue } } } }
        }`,
        { type: collectionId, first: 250 },
      );
      return data.metaobjects.edges.map(({ node }) => ({
        id: node.id,
        handle: node.handle,
        type: node.type,
        fields: Object.fromEntries(node.fields.map((f) => [f.key, f.jsonValue])),
      }));
    } catch {
      return [];
    }
  }
}
