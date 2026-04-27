// ============================================================
// Etsy Data Sync - Sync Etsy data to ERP Core
// ============================================================

import { EtsyOAuth, EtsyToken } from './oauth.js';

export interface SyncOptions {
  tenantId: string;
  accessToken: string;
  shopId: number;
}

export class EtsySync {
  private etsy: EtsyOAuth;

  constructor(etsy: EtsyOAuth) {
    this.etsy = etsy;
  }

  /**
   * Sync all listings (products) from Etsy
   */
  async syncListings(options: SyncOptions) {
    const { accessToken, shopId } = options;
    const data = await this.etsy.apiCall<any>('GET', `/application/shops/${shopId}/listings?limit=100`, accessToken);
    return data.results || [];
  }

  /**
   * Sync all receipts (orders) from Etsy
   */
  async syncReceipts(options: SyncOptions, minCreated?: number) {
    const { accessToken, shopId } = options;
    let url = `/application/shops/${shopId}/receipts?limit=100`;
    if (minCreated) url += `&min_created=${minCreated}`;
    const data = await this.etsy.apiCall<any>('GET', url, accessToken);
    return data.results || [];
  }

  /**
   * Sync payments from Etsy
   */
  async syncPayments(options: SyncOptions) {
    const { accessToken, shopId } = options;
    const data = await this.etsy.apiCall<any>('GET', `/application/shops/${shopId}/payments`, accessToken);
    return data.results || [];
  }

  /**
   * Sync reviews from Etsy
   */
  async syncReviews(options: SyncOptions) {
    const { accessToken, shopId } = options;
    const data = await this.etsy.apiCall<any>('GET', `/application/shops/${shopId}/reviews`, accessToken);
    return data.results || [];
  }

  /**
   * Get shop info
   */
  async getShop(options: SyncOptions) {
    const { accessToken, shopId } = options;
    return this.etsy.apiCall<any>('GET', `/application/shops/${shopId}`, accessToken);
  }

  /**
   * Get detailed listing info
   */
  async getListing(options: SyncOptions & { listingId: number }) {
    const { accessToken, listingId } = options;
    return this.etsy.apiCall<any>('GET', `/application/listings/${listingId}`, accessToken);
  }

  /**
   * Get receipt detail
   */
  async getReceipt(options: SyncOptions & { receiptId: number }) {
    const { accessToken, receiptId } = options;
    return this.etsy.apiCall<any>('GET', `/application/receipts/${receiptId}`, accessToken);
  }

  /**
   * Get shop's shipping profiles
   */
  async getShippingProfiles(options: SyncOptions) {
    const { accessToken, shopId } = options;
    return this.etsy.apiCall<any>('GET', `/application/shops/${shopId}/shipping-profiles`, accessToken);
  }

  /**
   * Get shop's production partners
   */
  async getProductionPartners(options: SyncOptions) {
    const { accessToken, shopId } = options;
    return this.etsy.apiCall<any>('GET', `/application/shops/${shopId}/production-partners`, accessToken);
  }
}
