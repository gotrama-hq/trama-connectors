import { v4 as uuidv4 } from 'uuid';
import type { TramaProduct, TramaCollection, TramaCart, TramaImage, TramaPrice } from 'trama-types';

export interface ShopifyMoney {
  amount: string;
  currencyCode: string;
}

export interface ShopifyImage {
  url: string;
  altText?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface RawShopifyVariant {
  id: string;
  title: string;
  sku?: string | null;
  availableForSale: boolean;
  quantityAvailable?: number | null;
  price: ShopifyMoney;
  compareAtPrice?: ShopifyMoney | null;
  selectedOptions: Array<{ name: string; value: string }>;
  image?: ShopifyImage | null;
}

export interface RawShopifyProduct {
  id: string;
  title: string;
  handle: string;
  description?: string | null;
  tags: string[];
  availableForSale: boolean;
  priceRange: { minVariantPrice: ShopifyMoney };
  compareAtPriceRange?: { minVariantPrice?: ShopifyMoney | null } | null;
  images: { edges: Array<{ node: ShopifyImage }> };
  variants: { edges: Array<{ node: RawShopifyVariant }> };
  collections?: { edges: Array<{ node: { id: string } }> };
  createdAt: string;
  updatedAt: string;
  seo?: { title?: string | null; description?: string | null } | null;
}

export interface RawShopifyCollection {
  id: string;
  title: string;
  handle: string;
  description?: string | null;
  image?: ShopifyImage | null;
  products?: { totalCount?: number | null; edges?: Array<{ node: { id: string } }> };
}

export interface RawShopifyCartLine {
  id: string;
  quantity: number;
  cost: { totalAmount: ShopifyMoney; subtotalAmount: ShopifyMoney };
  merchandise: {
    __typename: 'ProductVariant';
    id: string;
    title: string;
    image?: ShopifyImage | null;
    price: ShopifyMoney;
    product: { id: string; title: string };
  };
}

export interface RawShopifyCart {
  id: string;
  lines: { edges: Array<{ node: RawShopifyCartLine }> };
  cost: { subtotalAmount: ShopifyMoney; totalAmount: ShopifyMoney };
  checkoutUrl: string;
  createdAt: string;
  updatedAt: string;
}

export function decodeGid(gid: string): string {
  return gid.split('/').at(-1) ?? gid;
}

function shopifyPrice(money: ShopifyMoney | null | undefined): TramaPrice {
  const parsed = parseFloat(money?.amount ?? '0');
  const ccy = money?.currencyCode ?? 'USD';
  return {
    amount: Math.round(parsed * 100),
    currency: ccy,
    formatted: money ? `${parsed.toFixed(2)} ${ccy}` : '',
  };
}

function shopifyImage(img: ShopifyImage | null | undefined): TramaImage | null {
  if (!img?.url) return null;
  return {
    id: uuidv4(),
    url: img.url,
    altText: img.altText ?? null,
    width: img.width ?? null,
    height: img.height ?? null,
  };
}

export function normalizeShopifyProduct(p: RawShopifyProduct): TramaProduct {
  const variantNodes = (p.variants.edges ?? []).map(({ node }) => node);
  const imageNodes   = (p.images.edges ?? []).map(({ node }) => node);
  const images = imageNodes.map(shopifyImage).filter((img): img is TramaImage => img !== null);

  const variants = variantNodes.map((v) => ({
    id: uuidv4(),
    platformId: v.id,
    name: v.title,
    options: Object.fromEntries((v.selectedOptions ?? []).map((o) => [o.name, o.value])),
    price: shopifyPrice(v.price),
    stock: {
      status: v.availableForSale
        ? (v.quantityAvailable != null && v.quantityAvailable > 0 && v.quantityAvailable <= 5
            ? ('limited' as const)
            : ('in_stock' as const))
        : ('out_of_stock' as const),
      quantity: v.quantityAvailable ?? null,
      trackInventory: v.quantityAvailable != null,
    },
    sku: v.sku ?? null,
  }));

  const totalStock = variants.reduce(
    (acc, v) => (v.stock.quantity != null ? acc + v.stock.quantity : acc),
    0,
  );

  return {
    id: uuidv4(),
    platformId: p.id,
    platform: 'shopify',
    name: p.title,
    slug: p.handle,
    description: p.description ?? null,
    shortDescription: null,
    price: shopifyPrice(p.priceRange.minVariantPrice),
    compareAtPrice: p.compareAtPriceRange?.minVariantPrice
      ? shopifyPrice(p.compareAtPriceRange.minVariantPrice)
      : null,
    images,
    mainImage: images[0] ?? null,
    variants,
    collections: (p.collections?.edges ?? []).map(({ node }) => node.id),
    tags: p.tags ?? [],
    sku: variantNodes[0]?.sku ?? null,
    stock: {
      status: p.availableForSale ? 'in_stock' : 'out_of_stock',
      quantity: totalStock > 0 ? totalStock : null,
      trackInventory: variantNodes.some((v) => v.quantityAvailable != null),
    },
    seo: {
      title: p.seo?.title ?? null,
      description: p.seo?.description ?? null,
      keywords: p.tags ?? [],
    },
    metadata: p as unknown as Record<string, unknown>,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export function normalizeShopifyCollection(c: RawShopifyCollection): TramaCollection {
  return {
    id: uuidv4(),
    platformId: c.id,
    name: c.title,
    slug: c.handle,
    description: c.description ?? null,
    image: shopifyImage(c.image),
    productCount: c.products?.edges?.length ?? c.products?.totalCount ?? 0,
  };
}

export function normalizeShopifyCart(c: RawShopifyCart): TramaCart {
  const currency = c.cost.totalAmount.currencyCode;
  const lineItems = (c.lines.edges ?? []).map(({ node: line }) => ({
    id: line.id,
    productId: line.merchandise.product.id,
    variantId: line.merchandise.id,
    name: `${line.merchandise.product.title} — ${line.merchandise.title}`,
    image: shopifyImage(line.merchandise.image ?? null),
    price: shopifyPrice(line.cost.totalAmount),
    quantity: line.quantity,
    catalogReference: {
      appId: 'shopify',
      catalogItemId: decodeGid(line.merchandise.product.id),
      options: { variantId: line.merchandise.id },
    },
  }));

  return {
    id: uuidv4(),
    platformCartId: c.id,
    tenantId: '',
    lineItems,
    subtotal: shopifyPrice(c.cost.subtotalAmount),
    total: shopifyPrice(c.cost.totalAmount),
    checkoutUrl: c.checkoutUrl,
    currency,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}
