# trama-connectors

> Open-source platform connectors that map **Wix**, **Shopify**, and **Webflow** APIs to a single canonical schema. The connector layer behind [Trama](https://gotrama.com) — public so you can audit it, extend it, or self-host it.

[![npm](https://img.shields.io/npm/v/trama-connectors.svg)](https://www.npmjs.com/package/trama-connectors)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Build](https://github.com/gotrama-hq/trama-connectors/actions/workflows/ci.yml/badge.svg)](https://github.com/gotrama-hq/trama-connectors/actions)

## What this is

A platform-agnostic **e-commerce connector library**. One TypeScript interface, three reference implementations, the same canonical types out the back:

```ts
interface PlatformConnector {
  fetchProducts(opts): Promise<TramaProduct[]>
  fetchProduct(id):    Promise<TramaProduct | null>
  fetchCollections():  Promise<TramaCollection[]>
  getCart(id):         Promise<TramaCart | null>
  createCart(items):   Promise<TramaCart>
  addToCart(id, item): Promise<TramaCart>
  // …cart mutations + checkout URL
}
```

Pick a platform. Get a `TramaProduct`. Build whatever you want on top.

## Why it exists

Every commerce backend has its own quirks — Wix returns prices as numbers; Shopify returns them as strings inside `Money` objects; Webflow uses cents directly. **Your frontend shouldn't care.** This library is the boundary that makes it not care.

It's also the layer your customers' Wix credentials *flow through*. Open-sourcing it means anyone can read the code that touches their store. That's the point.

## Install

```bash
npm install trama-connectors trama-types
```

## Quick start — Wix

```ts
import { WixConnector } from 'trama-connectors';

const connector = new WixConnector(
  {
    accessToken:  process.env.WIX_ACCESS_TOKEN!,
    refreshToken: process.env.WIX_REFRESH_TOKEN!,
    expiresAt:    process.env.WIX_TOKEN_EXPIRES_AT!,
  },
  {
    clientId:     process.env.WIX_CLIENT_ID,
    clientSecret: process.env.WIX_CLIENT_SECRET,
    projectId:    'my-store',
  },
);

const products = await connector.fetchProducts({ limit: 50 });
console.log(products[0].price);
// → { amount: 2999, currency: 'USD', formatted: '29.99 USD' }
```

## Quick start — Shopify

```ts
import { ShopifyConnector } from 'trama-connectors';

const connector = new ShopifyConnector(
  {
    accessToken:  'shpat_…',                 // Storefront access token
    refreshToken: '',                         // unused
    expiresAt:    '2099-01-01T00:00:00Z',
    shopDomain:   'my-store.myshopify.com',
  },
  { projectId: 'my-store' },
);

const products = await connector.fetchProducts({ limit: 24 });
const cart     = await connector.createCart([{ productId: products[0].id, quantity: 1 }]);
const checkout = await connector.getCheckoutUrl(cart.platformCartId);
```

## Quick start — Webflow

```ts
import { WebflowConnector } from 'trama-connectors';

const connector = new WebflowConnector(
  {
    accessToken:  process.env.WEBFLOW_ACCESS_TOKEN!,
    refreshToken: '',
    expiresAt:    '2099-01-01T00:00:00Z',
    siteId:       process.env.WEBFLOW_SITE_ID!,
    siteDomain:   'mystore.webflow.io',
  },
);

const collections = await connector.fetchCollections();
```

## Just want the normalizers?

Each platform exports pure functions you can drop into your own pipeline:

```ts
import { normalizeShopifyProduct } from 'trama-connectors/normalizers';

const raw = await myShopifyClient.products.get('gid://shopify/Product/123');
const wbProduct = normalizeShopifyProduct(raw);
```

No connector, no fetch, no IO. Just translation.

## Hardening built in

Every connector ships with:

- **Circuit breaker** — opens after 5 consecutive failures, retries after 30s. Fails fast when an upstream API is degraded so your callers don't pile up.
- **Typed errors** — `ConnectorError` with codes (`CONNECTOR_AUTH`, `CONNECTOR_RATE_LIMIT`, `CONNECTOR_UPSTREAM`, …) so you can branch cleanly.
- **Pluggable logger** — defaults to silent; pass `{ logger: pino }` (or any compatible) to see what's happening.
- **Pluggable token store** — for Wix's expiring OAuth flow. In-memory by default; swap for Redis in production.

## Building a new connector

Want BigCommerce, Squarespace, Magento? Implement the interface:

```ts
import type { PlatformConnector } from 'trama-connectors';

export class BigCommerceConnector implements PlatformConnector {
  async fetchProducts(opts) { /* …call BC API, return TramaProduct[] */ }
  async fetchProduct(id)    { /* … */ }
  // …etc
}
```

Submit a PR. Every new connector expands the addressable market for everyone using this library.

## What this isn't

This package is the **transport + translation** layer. It does not:

- Cache results (use [`trama-sdk`](../sdk) or your own caching layer)
- Score or auto-detect frontend mappings (that's the closed-source [Trama](https://gotrama.com) hosted service — the part where the moat actually lives)
- Auto-heal when an upstream API changes shape (also hosted-service)
- Persist anything (TokenStore is the only IO contract — and you provide it)

You can build a fully working headless storefront with just this package. Trama's hosted product layers caching, mapping intelligence, drift detection, and a dashboard on top.

## Architecture

```
   Your code
       ↓
PlatformConnector (this package)
       ↓
  WixConnector / ShopifyConnector / WebflowConnector
       ↓
  fetch() → upstream API → normalizer → TramaProduct / TramaCart / TramaCollection
```

The canonical types live in [`trama-types`](../types). Read those if you want to understand the schema.

## Contributing

PRs welcome — especially:

- New platform connectors (BigCommerce, WooCommerce, Magento, Squarespace, Shopline, …)
- Bug fixes for existing connectors when an API endpoint changes
- Better tests (we want every normalizer to have ≥10 fixtures)
- Performance: fewer round trips, smarter pagination

See [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a PR.

## License

MIT — see [LICENSE](./LICENSE). You can fork it, sell it, fold it into a closed product. We just ask that you don't claim you wrote it.

## Related packages

- [`trama-sdk`](https://www.npmjs.com/package/trama-sdk) — React hooks that consume the Trama hosted API
- [`trama-types`](https://www.npmjs.com/package/trama-types) — canonical TypeScript types

## Maintained by

[Trama](https://gotrama.com) — the hosted commerce-bridge platform. We open-sourced the connector layer because trust beats marketing.
