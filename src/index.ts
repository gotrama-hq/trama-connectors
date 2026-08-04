export type { PlatformConnector } from './platform-connector.js';
export type { Logger } from './logger.js';
export { silentLogger, consoleLogger } from './logger.js';
export type { TokenStore } from './token-store.js';
export { InMemoryTokenStore } from './token-store.js';
export { CircuitBreaker, type CircuitBreakerOptions } from './circuit-breaker.js';
export { ConnectorError, type ConnectorErrorCode } from './errors.js';

export {
  WixConnector,
  type WixConnectorOptions,
} from './connectors/wix.js';
export {
  ShopifyConnector,
  type ShopifyConnectorOptions,
  type ShopifyStoredToken,
} from './connectors/shopify.js';
export {
  WebflowConnector,
  type WebflowConnectorOptions,
  type WebflowStoredToken,
} from './connectors/webflow.js';

export {
  normalizeWixProduct, normalizeWixCart, normalizeWixCollection, WIX_STORES_APP_ID,
  type RawWixProduct, type RawWixCart, type RawWixCollection,
} from './normalizers/wix.js';
export {
  normalizeShopifyProduct, normalizeShopifyCollection, normalizeShopifyCart, decodeGid,
  type RawShopifyProduct, type RawShopifyCollection, type RawShopifyCart,
  type RawShopifyVariant, type ShopifyMoney, type ShopifyImage,
} from './normalizers/shopify.js';
export {
  normalizeWebflowProduct, normalizeWebflowCategory, normalizeWebflowCart,
  type RawWebflowProduct, type RawWebflowCategory, type RawWebflowCart,
  type RawWebflowSku, type RawWebflowSkuFieldData, type RawWebflowProductFieldData,
  type WebflowPrice, type WebflowImage,
} from './normalizers/webflow.js';
