import { v4 as uuidv4 } from 'uuid';
import type { TramaProduct, TramaCollection, TramaCart, TramaImage, TramaPrice } from 'trama-types';

export interface WebflowPrice { value: number; unit: string }

export interface WebflowImage {
  fileId?: string;
  url: string;
  alt?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface RawWebflowSkuFieldData {
  name: string;
  slug?: string;
  price: WebflowPrice;
  'compare-at-price'?: WebflowPrice | null;
  quantity?: number | null;
  sku?: string | null;
  'track-inventory'?: boolean;
  'main-image'?: WebflowImage | null;
  [key: string]: unknown;
}

export interface RawWebflowSku {
  id: string;
  createdOn: string;
  lastUpdated: string;
  fieldData: RawWebflowSkuFieldData;
}

export interface RawWebflowProductFieldData {
  name: string;
  slug: string;
  description?: string | null;
  shippable?: boolean;
  'main-image'?: WebflowImage | null;
  'more-images'?: WebflowImage[];
  categories?: string[];
  [key: string]: unknown;
}

export interface RawWebflowProduct {
  id: string;
  createdOn: string;
  lastUpdated: string;
  fieldData: RawWebflowProductFieldData;
  skus: RawWebflowSku[];
}

export interface RawWebflowCategory {
  id: string;
  createdOn: string;
  lastUpdated: string;
  fieldData: {
    name: string;
    slug: string;
    description?: string | null;
    'main-image'?: WebflowImage | null;
  };
}

export interface RawWebflowCartLine {
  id: string;
  count: number;
  variantId: string;
  productId: string;
  productName: string;
  variantName?: string | null;
  price: WebflowPrice;
  mainImage?: WebflowImage | null;
  rowTotal: WebflowPrice;
}

export interface RawWebflowCart {
  id: string;
  sessionId?: string | null;
  status?: string;
  lineItems: RawWebflowCartLine[];
  subtotal: WebflowPrice;
  total: WebflowPrice;
  checkoutUrl: string;
  createdOn: string;
  updatedOn?: string | null;
}

function webflowPrice(p: WebflowPrice | null | undefined): TramaPrice {
  if (!p) return { amount: 0, currency: 'USD', formatted: '' };
  return {
    amount: p.value,
    currency: p.unit,
    formatted: `${(p.value / 100).toFixed(2)} ${p.unit}`,
  };
}

function webflowImage(img: WebflowImage | null | undefined): TramaImage | null {
  if (!img?.url) return null;
  return {
    id: img.fileId ?? uuidv4(),
    url: img.url,
    altText: img.alt ?? null,
    width: img.width ?? null,
    height: img.height ?? null,
  };
}

export function normalizeWebflowProduct(p: RawWebflowProduct): TramaProduct {
  const fd = p.fieldData;
  const skus = p.skus ?? [];

  const variants = skus.map((sku) => {
    const sfd = sku.fieldData;
    const qty = sfd.quantity ?? null;
    return {
      id: uuidv4(),
      platformId: sku.id,
      name: sfd.name,
      options: parseSkuOptions(sfd.name),
      price: webflowPrice(sfd.price),
      stock: {
        status: (qty != null && qty > 0
          ? (qty <= 5 ? ('limited' as const) : ('in_stock' as const))
          : ('out_of_stock' as const)),
        quantity: qty,
        trackInventory: sfd['track-inventory'] ?? false,
      },
      sku: sfd.sku ?? null,
    };
  });

  const mainImageSrc = fd['main-image'];
  const moreImages = (fd['more-images'] ?? []).map(webflowImage).filter((i): i is TramaImage => i !== null);
  const mainImage = webflowImage(mainImageSrc);
  const images = mainImage ? [mainImage, ...moreImages] : moreImages;

  const firstSku = skus[0]?.fieldData;
  const totalStock = variants.reduce(
    (acc, v) => (v.stock.quantity != null ? acc + v.stock.quantity : acc),
    0,
  );

  return {
    id: uuidv4(),
    platformId: p.id,
    platform: 'webflow',
    name: fd.name,
    slug: fd.slug,
    description: fd.description ?? null,
    shortDescription: null,
    price: webflowPrice(firstSku?.price),
    compareAtPrice: firstSku?.['compare-at-price']
      ? webflowPrice(firstSku['compare-at-price'])
      : null,
    images,
    mainImage: images[0] ?? null,
    variants,
    collections: fd.categories ?? [],
    tags: [],
    sku: firstSku?.sku ?? null,
    stock: {
      status: variants.some((v) => v.stock.status !== 'out_of_stock') ? 'in_stock' : 'out_of_stock',
      quantity: totalStock > 0 ? totalStock : null,
      trackInventory: variants.some((v) => v.stock.trackInventory),
    },
    seo: { title: null, description: null, keywords: [] },
    metadata: p as unknown as Record<string, unknown>,
    createdAt: p.createdOn,
    updatedAt: p.lastUpdated,
  };
}

export function normalizeWebflowCategory(c: RawWebflowCategory): TramaCollection {
  return {
    id: uuidv4(),
    platformId: c.id,
    name: c.fieldData.name,
    slug: c.fieldData.slug,
    description: c.fieldData.description ?? null,
    image: webflowImage(c.fieldData['main-image']),
    productCount: 0,
  };
}

export function normalizeWebflowCart(c: RawWebflowCart): TramaCart {
  const currency = c.total.unit;
  const lineItems = (c.lineItems ?? []).map((line) => ({
    id: line.id,
    productId: line.productId,
    variantId: line.variantId,
    name: line.variantName ? `${line.productName} — ${line.variantName}` : line.productName,
    image: webflowImage(line.mainImage),
    price: webflowPrice(line.rowTotal),
    quantity: line.count,
    catalogReference: {
      appId: 'webflow',
      catalogItemId: line.productId,
      options: { variantId: line.variantId },
    },
  }));

  return {
    id: uuidv4(),
    platformCartId: c.id,
    tenantId: '',
    lineItems,
    subtotal: webflowPrice(c.subtotal),
    total: webflowPrice(c.total),
    checkoutUrl: c.checkoutUrl,
    currency,
    createdAt: c.createdOn,
    updatedAt: c.updatedOn ?? c.createdOn,
  };
}

function parseSkuOptions(name: string): Record<string, string> {
  const parts = name.split(' / ').map((s) => s.trim());
  if (parts.length === 1 && parts[0] === 'Default') return {};
  return Object.fromEntries(parts.map((v, i) => [`Option ${i + 1}`, v]));
}
