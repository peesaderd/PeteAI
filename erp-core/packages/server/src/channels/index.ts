// ============================================================
// Multi-Channel Connector Framework
// Amazon, Shopify, Etsy (existing), eBay (later)
// ============================================================

import { getDatabase } from '../db/database.js';

export interface ChannelConnectionInput {
  tenantId: string;
  channelType: 'amazon' | 'shopify' | 'etsy' | 'ebay';
  label: string;
  credentials: Record<string, string>;
  config?: Record<string, any>;
}

export interface ChannelListingInput {
  tenantId: string;
  channelConnectionId: string;
  productId: string;
  channelListingId: string;
  channelSku?: string;
  channelPrice?: number;
  channelQuantity?: number;
  listingData?: Record<string, any>;
}

export class ChannelManager {
  private db = getDatabase();

  // ============================================================
  // Connection Management
  // ============================================================

  createConnection(input: ChannelConnectionInput) {
    const now = Math.floor(Date.now() / 1000);
    const id = crypto.randomUUID();

    this.db.prepare(`
      INSERT INTO channel_connections (id, tenant_id, channel_type, label, credentials, config, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, input.tenantId, input.channelType, input.label,
      JSON.stringify(input.credentials), input.config ? JSON.stringify(input.config) : null, now, now);

    return this.getConnection(id);
  }

  getConnection(id: string) {
    const conn = this.db.prepare('SELECT * FROM channel_connections WHERE id = ?').get(id) as any;
    if (!conn) return null;
    return {
      ...conn,
      credentials: safeParseJSON(conn.credentials),
      config: safeParseJSON(conn.config),
    };
  }

  listConnections(tenantId: string, channelType?: string) {
    let sql = 'SELECT * FROM channel_connections WHERE tenant_id = ?';
    const params: any[] = [tenantId];
    if (channelType) {
      sql += ' AND channel_type = ?';
      params.push(channelType);
    }
    sql += ' ORDER BY updated_at DESC';
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(r => ({
      ...r,
      credentials: safeParseJSON(r.credentials),
      config: safeParseJSON(r.config),
    }));
  }

  updateConnection(id: string, updates: Partial<ChannelConnectionInput & { isActive: boolean }>) {
    const now = Math.floor(Date.now() / 1000);
    const fields: string[] = ['updated_at = ?'];
    const params: any[] = [now];

    if (updates.label !== undefined) { fields.push('label = ?'); params.push(updates.label); }
    if (updates.credentials !== undefined) { fields.push('credentials = ?'); params.push(JSON.stringify(updates.credentials)); }
    if (updates.config !== undefined) { fields.push('config = ?'); params.push(JSON.stringify(updates.config)); }
    if (updates.isActive !== undefined) { fields.push('is_active = ?'); params.push(updates.isActive ? 1 : 0); }

    params.push(id);
    this.db.prepare(`UPDATE channel_connections SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    return this.getConnection(id);
  }

  deleteConnection(id: string) {
    this.db.prepare('DELETE FROM channel_listings WHERE channel_connection_id = ?').run(id);
    this.db.prepare('DELETE FROM channel_orders WHERE channel_connection_id = ?').run(id);
    this.db.prepare('DELETE FROM channel_connections WHERE id = ?').run(id);
    return { success: true };
  }

  // ============================================================
  // Listing Management
  // ============================================================

  createListing(input: ChannelListingInput) {
    const now = Math.floor(Date.now() / 1000);
    const id = crypto.randomUUID();

    this.db.prepare(`
      INSERT INTO channel_listings (id, tenant_id, channel_connection_id, product_id, channel_listing_id, channel_sku, channel_price, channel_quantity, status, listing_data, last_sync_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
    `).run(id, input.tenantId, input.channelConnectionId, input.productId,
      input.channelListingId, input.channelSku || null, input.channelPrice || null,
      input.channelQuantity || null, input.listingData ? JSON.stringify(input.listingData) : null, now, now, now);

    return this.getListing(id);
  }

  getListing(id: string) {
    const listing = this.db.prepare(`
      SELECT cl.*, p.name as product_name, p.sku as product_sku, p.quantity as stock_quantity,
        cc.channel_type, cc.label as channel_label
      FROM channel_listings cl
      JOIN products p ON p.id = cl.product_id
      JOIN channel_connections cc ON cc.id = cl.channel_connection_id
      WHERE cl.id = ?
    `).get(id) as any;
    if (!listing) return null;
    return { ...listing, listing_data: safeParseJSON(listing.listing_data) };
  }

  listListings(tenantId: string, channelConnectionId?: string, productId?: string) {
    let sql = `
      SELECT cl.*, p.name as product_name, p.sku as product_sku, p.quantity as stock_quantity,
        cc.channel_type, cc.label as channel_label
      FROM channel_listings cl
      JOIN products p ON p.id = cl.product_id
      JOIN channel_connections cc ON cc.id = cl.channel_connection_id
      WHERE cl.tenant_id = ?
    `;
    const params: any[] = [tenantId];
    if (channelConnectionId) { sql += ' AND cl.channel_connection_id = ?'; params.push(channelConnectionId); }
    if (productId) { sql += ' AND cl.product_id = ?'; params.push(productId); }
    sql += ' ORDER BY cl.updated_at DESC';
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(r => ({ ...r, listing_data: safeParseJSON(r.listing_data) }));
  }

  updateListing(id: string, updates: Partial<ChannelListingInput & { status: string }>) {
    const now = Math.floor(Date.now() / 1000);
    const fields: string[] = ['updated_at = ?'];
    const params: any[] = [now];
    const fieldMap: Record<string, string> = {
      channelSku: 'channel_sku',
      channelPrice: 'channel_price',
      channelQuantity: 'channel_quantity',
      status: 'status',
      listingData: 'listing_data',
    };
    for (const [key, col] of Object.entries(fieldMap)) {
      if ((updates as any)[key] !== undefined) {
        fields.push(`${col} = ?`);
        params.push((updates as any)[key]);
      }
    }
    params.push(id);
    this.db.prepare(`UPDATE channel_listings SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    return this.getListing(id);
  }

  // ============================================================
  // Channel Order Sync
  // ============================================================

  recordChannelOrder(input: {
    tenantId: string;
    channelConnectionId: string;
    channelOrderId: string;
    channelStatus: string;
    localOrderId?: string;
    rawData?: Record<string, any>;
  }) {
    const now = Math.floor(Date.now() / 1000);
    const id = crypto.randomUUID();

    this.db.prepare(`
      INSERT INTO channel_orders (id, tenant_id, channel_connection_id, channel_order_id, order_id, channel_status, raw_data, synced_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.tenantId, input.channelConnectionId, input.channelOrderId,
      input.localOrderId || null, input.channelStatus,
      input.rawData ? JSON.stringify(input.rawData) : null, now, now, now);

    return this.db.prepare('SELECT * FROM channel_orders WHERE id = ?').get(id);
  }

  listChannelOrders(tenantId: string, channelConnectionId?: string, limit = 50) {
    let sql = `
      SELECT co.*, cc.channel_type, cc.label as channel_label
      FROM channel_orders co
      JOIN channel_connections cc ON cc.id = co.channel_connection_id
      WHERE co.tenant_id = ?
    `;
    const params: any[] = [tenantId];
    if (channelConnectionId) { sql += ' AND co.channel_connection_id = ?'; params.push(channelConnectionId); }
    sql += ' ORDER BY co.created_at DESC LIMIT ?';
    params.push(limit);
    return this.db.prepare(sql).all(...params);
  }

  // ============================================================
  // Inventory Sync
  // ============================================================

  getInventorySyncStatus(tenantId: string) {
    const listings = this.db.prepare(`
      SELECT cl.id, cl.channel_listing_id, cl.channel_quantity as listed_quantity,
        p.quantity as actual_quantity, p.name as product_name, p.sku,
        cc.channel_type, cc.label as channel_label,
        (cl.channel_quantity != p.quantity) as needs_sync
      FROM channel_listings cl
      JOIN products p ON p.id = cl.product_id
      JOIN channel_connections cc ON cc.id = cl.channel_connection_id
      WHERE cl.tenant_id = ? AND cl.status = 'active'
    `).all(tenantId) as any[];

    return {
      total: listings.length,
      needsSync: listings.filter((l: any) => l.needs_sync).length,
      listings,
    };
  }
}

function safeParseJSON(str: string | null): any {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return str; }
}
