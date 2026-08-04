# Changelog

All notable changes will be documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

## [0.1.0] — 2026-05-08
### Added
- Initial public release.
- `PlatformConnector` interface — contract for any commerce backend.
- `WixConnector` — Wix Stores REST connector with refreshable OAuth token handling.
- `ShopifyConnector` — Shopify Storefront GraphQL connector.
- `WebflowConnector` — Webflow Data API v2 connector.
- Pure normalizers for each platform (raw API → `TramaProduct` / `TramaCart` / `TramaCollection`).
- `CircuitBreaker` utility — three-state breaker shared across connectors.
- `Logger` and `TokenStore` interfaces — pluggable defaults provided.
- `ConnectorError` with typed error codes.
