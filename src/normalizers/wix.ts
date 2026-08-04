import { v4 as uuidv4 } from 'uuid';
import type { TramaProduct, TramaCollection, TramaCart, TramaImage, TramaPrice } from 'trama-types';

export const WIX_STORES_APP_ID = '1380b703-ce81-ff05-f115-39571d94dfcd';

export interface RawWixProduct {
  _id?: string;
  name?: string;
  slug?: string;
  description?: string;
  priceData?: {
    price?: number;
    currency?: string;
    discountedPrice?: number;
    formatted?: { price?: string; discountedPrice?: string };
  };
  media?: {
    mainMedia?: { image?: { url?: string; altText?: string; width?: number; height?: number } };
    items?: Array<{ _id?: string; image?: { url?: string; altText?: string; width?: number; height?: number } }>;
  };
  stock?: { inStock?: boolean; quantity?: number; trackQuantity?: boolean };
  collectionIds?: string[];
  seoData?: { tags?: Array<{ type?: string; value?: string }> };
  _createdDate?: string | Date;
  _updatedDate?: string | Date;
}

export interface RawWixCart {
  _id?: string;
  lineItems?: Array<{
    _id?: string;
    productName?: { original?: string };
    image?: string;
    price?: { amount?: string; convertedAmount?: string; formattedAmount?: string };
    quantity?: number;
    catalogReference?: {
      appId?: string;
      catalogItemId?: string;
      options?: Record<string, string>;
    };
  }>;
  priceSummary?: {
    subtotal?: { amount?: string; formattedAmount?: string };
    total?: { amount?: string; formattedAmount?: string };
  };
  currency?: string;
  _createdDate?: string;
  _updatedDate?: string;
}

export interface RawWixCollection {
  _id?: string;
  name?: string;
  slug?: string;
  description?: string;
  media?: { mainMedia?: { image?: { url?: string } } };
  numberOfProducts?: number;
}

export function normalizePrice(amount: number | undefined, currency: string | undefined, formatted: string | undefined): TramaPrice {
  return {
    amount: Math.round((amount ?? 0) * 100),
    currency: currency ?? 'USD',
    formatted: formatted ?? '',
  };
}

export function normalizeImage(img: { url?: string; altText?: string; width?: number; height?: number } | undefined): TramaImage | null {
  if (!img?.url) return null;
  return {
    id: uuidv4(),
    url: img.url,
    altText: img.altText ?? null,
    width: img.width ?? null,
    height: img.height ?? null,
  };
}

export function normalizeWixProduct(p: RawWixProduct): TramaProduct {
  return {
    id: uuidv4(),
    platformId: p._id ?? '',
    platform: 'wix',
    name: p.name ?? '',
    slug: p.slug ?? '',
    description: p.description ?? null,
    shortDescription: null,
    price: normalizePrice(p.priceData?.price, p.priceData?.currency, p.priceData?.formatted?.price),
    compareAtPrice: p.priceData?.discountedPrice
      ? normalizePrice(p.priceData.discountedPrice, p.priceData.currency, p.priceData.formatted?.discountedPrice)
      : null,
    images: (p.media?.items ?? [])
      .map((item) => normalizeImage(item.image))
      .filter((img): img is TramaImage => img !== null),
    mainImage: normalizeImage(p.media?.mainMedia?.image),
    variants: [],
    collections: p.collectionIds ?? [],
    tags: [],
    sku: null,
    stock: {
      status: p.stock?.inStock ? 'in_stock' : 'out_of_stock',
      quantity: p.stock?.quantity ?? null,
      trackInventory: p.stock?.trackQuantity ?? false,
    },
    seo: {
      title: p.seoData?.tags?.find((t) => t.type === 'title')?.value ?? null,
      description: p.seoData?.tags?.find((t) => t.type === 'description')?.value ?? null,
      keywords: [],
    },
    metadata: p as Record<string, unknown>,
    createdAt: p._createdDate ? new Date(p._createdDate).toISOString() : new Date().toISOString(),
    updatedAt: p._updatedDate ? new Date(p._updatedDate).toISOString() : new Date().toISOString(),
  };
}

export function normalizeWixCart(c: RawWixCart): TramaCart {
  const currency = c.currency ?? 'USD';
  return {
    id: uuidv4(),
    platformCartId: c._id ?? '',
    tenantId: '',
    lineItems: (c.lineItems ?? []).map((item) => ({
      id: item._id ?? uuidv4(),
      productId: item.catalogReference?.catalogItemId ?? '',
      variantId: item.catalogReference?.options?.['variantId'] ?? null,
      name: item.productName?.original ?? '',
      image: item.image
        ? { id: uuidv4(), url: item.image, altText: null, width: null, height: null }
        : null,
      price: {
        amount: Math.round(parseFloat(item.price?.amount ?? '0') * 100),
        currency,
        formatted: item.price?.formattedAmount ?? '',
      },
      quantity: item.quantity ?? 1,
      catalogReference: {
        appId: item.catalogReference?.appId ?? WIX_STORES_APP_ID,
        catalogItemId: item.catalogReference?.catalogItemId ?? '',
        options: item.catalogReference?.options,
      },
    })),
    subtotal: {
      amount: Math.round(parseFloat(c.priceSummary?.subtotal?.amount ?? '0') * 100),
      currency,
      formatted: c.priceSummary?.subtotal?.formattedAmount ?? '',
    },
    total: {
      amount: Math.round(parseFloat(c.priceSummary?.total?.amount ?? '0') * 100),
      currency,
      formatted: c.priceSummary?.total?.formattedAmount ?? '',
    },
    checkoutUrl: '',
    currency,
    createdAt: c._createdDate ?? new Date().toISOString(),
    updatedAt: c._updatedDate ?? new Date().toISOString(),
  };
}

export function normalizeWixCollection(c: RawWixCollection): TramaCollection {
  return {
    id: uuidv4(),
    platformId: c._id ?? '',
    name: c.name ?? '',
    slug: c.slug ?? '',
    description: c.description ?? null,
    image: c.media?.mainMedia?.image?.url
      ? { id: uuidv4(), url: c.media.mainMedia.image.url, altText: null, width: null, height: null }
      : null,
    productCount: c.numberOfProducts ?? 0,
  };
}
