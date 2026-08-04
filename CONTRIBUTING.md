# Contributing to trama-connectors

Thanks for considering a contribution. The connector layer is the part of Trama that touches your customers' commerce credentials, so we hold it to a high bar.

## What we accept

- **New platform connectors** — BigCommerce, WooCommerce, Magento, Squarespace, Shopline, and any other commerce backend with a public API. See "Building a new connector" below.
- **Bug fixes** for existing connectors when a platform API changes.
- **Type improvements** that don't change runtime behavior.
- **More test fixtures** — we want every normalizer to round-trip 10+ real-world payloads.
- **Documentation** — clearer examples, better error messages, typo fixes.

## What we don't accept (without discussion first)

- Adding fetching libraries beyond `fetch`. Keep the bundle slim.
- Adding a state store (database, Redis client, etc.) inside the package. Use the `TokenStore` interface and let callers provide an impl.
- Custom checkout flows. Always use the platform's native checkout URL — most platform ToS require it, and bypassing is a legal landmine.
- Mapping intelligence, scoring, drift detection. Those live in the closed-source Trama hosted service and are deliberately not in this package.

## Building a new connector

1. Read [`platform-connector.ts`](./src/platform-connector.ts) — that's the entire surface you need to implement.
2. Add a normalizer in `src/normalizers/<platform>.ts` that converts the raw API shape to `TramaProduct` / `TramaCart` / `TramaCollection`.
3. Add the connector class in `src/connectors/<platform>.ts`. Use `CircuitBreaker` for resilience and `Logger` for observability — see `wix.ts` for the pattern.
4. Export both from the appropriate barrel files.
5. Add at least 10 normalizer test fixtures using real captured API responses (sanitised).
6. Update the README's "Quick start" section with a snippet for your platform.

## Local setup

```bash
pnpm install
pnpm --filter trama-connectors build
pnpm --filter trama-connectors dev   # tsup --watch
```

## PR checklist

- [ ] Build passes (`pnpm build`)
- [ ] Type-check passes (`pnpm type-check`)
- [ ] New public APIs have JSDoc with at least one example
- [ ] Normalizer changes include test fixtures
- [ ] CHANGELOG entry under `## Unreleased`

## Security disclosure

Found a security issue? **Do not open a public issue.** Email `security@gotrama.com` (PGP key on the website). We aim to respond within 48 hours.

## License

By contributing you agree your contributions are licensed under MIT.
