import type { TramaProduct, TramaCollection, TramaCart, CartItemInput, FetchProductsOptions } from 'trama-types';

export interface PlatformConnector {
  
  fetchProducts(options: FetchProductsOptions): Promise<TramaProduct[]>;
  
  fetchProduct(id: string): Promise<TramaProduct | null>;
  
  fetchCollections(): Promise<TramaCollection[]>;

  
  getCart(cartId: string): Promise<TramaCart | null>;
  
  createCart(items: CartItemInput[]): Promise<TramaCart>;
  
  addToCart(cartId: string, item: CartItemInput): Promise<TramaCart>;
  
  updateCartItem(cartId: string, lineItemId: string, quantity: number): Promise<TramaCart>;
  
  removeCartItem(cartId: string, lineItemId: string): Promise<TramaCart>;
  
  getCheckoutUrl(cartId: string): Promise<string>;

  
  fetchCmsItems(collectionId: string): Promise<unknown[]>;
}
