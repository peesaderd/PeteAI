// ============================================================
// ERP MCP API Client — เชื่อมต่อ NoteForge กับ ERP Core
// ============================================================

export interface ErpConfig {
  baseUrl: string;
  tenantId: string;
  token: string | null;
}

const STORAGE_KEY = 'noteforge-erp-config';

const DEFAULT_CONFIG: ErpConfig = {
  baseUrl: 'http://89.167.82.205:52601',
  tenantId: '',
  token: null,
};

let config: ErpConfig = { ...DEFAULT_CONFIG };

export function loadErpConfig(): ErpConfig {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      config = { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    }
  } catch (e) {
    console.error('Failed to load ERP config:', e);
  }
  return config;
}

export function saveErpConfig(updates: Partial<ErpConfig>): ErpConfig {
  config = { ...config, ...updates };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save ERP config:', e);
  }
  return config;
}

export function getErpConfig(): ErpConfig {
  return config;
}

// ---- MCP Tool Call ----

export async function callMCP(tool: string, args: Record<string, any>): Promise<any> {
  const { baseUrl, token } = config;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}/api/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ tool, args: { ...args, tenantId: config.tenantId } }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ERP API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// ---- Auth ----

export async function erpLogin(email: string, password: string) {
  const res = await fetch(`${config.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error('Login failed');
  const data = await res.json();
  saveErpConfig({ token: data.token, tenantId: data.user?.tenant_id || data.tenantId || '' });
  return data;
}

export async function erpRegister(tenantName: string, tenantSlug: string, email: string, name: string, password: string) {
  const res = await fetch(`${config.baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantName, tenantSlug, email, name, password }),
  });
  if (!res.ok) throw new Error('Registration failed');
  const data = await res.json();
  saveErpConfig({ token: data.user?.token || '', tenantId: data.tenant?.id || '' });
  return data;
}

// ---- Products ----

export async function getProducts(params?: { categoryId?: string; status?: string; search?: string; limit?: number }) {
  return callMCP('list_products', params || {});
}

export async function getProduct(productId: string) {
  return callMCP('get_product', { productId });
}

export async function createProduct(data: {
  name: string; description?: string; sku?: string; price: number;
  costPrice?: number; quantity?: number; categoryId?: string; tags?: string[];
}) {
  return callMCP('create_product', data);
}

// ---- Orders ----

export async function getOrders(params?: { status?: string; startDate?: number; endDate?: number; limit?: number }) {
  return callMCP('list_orders', params || {});
}

export async function getOrder(orderId: string) {
  return callMCP('get_order', { orderId });
}

// ---- Analytics ----

export async function getDashboardSummary(params?: { startDate?: number; endDate?: number }) {
  return callMCP('get_dashboard_summary', params || {});
}

export async function getSalesReport(period: '7d' | '30d' | '90d' | '1y' = '30d') {
  return callMCP('get_sales_report', { period });
}

export async function getTopProducts(params?: { startDate?: number; endDate?: number; limit?: number }) {
  return callMCP('get_top_products', params || { limit: 10 });
}

export async function getChannelBreakdown(params?: { startDate?: number; endDate?: number }) {
  return callMCP('get_channel_breakdown', params || {});
}

export async function getInventory(params?: { lowStockOnly?: boolean; threshold?: number }) {
  return callMCP('get_inventory', params || {});
}

// ---- Knowledge Base ----

export async function getKBCollections() {
  return callMCP('list_kb_collections', {});
}

export async function getKBDocuments(params?: { collectionId?: string; search?: string }) {
  return callMCP('list_kb_documents', params || {});
}

export async function getKBDocument(documentId: string) {
  return callMCP('get_kb_document', { documentId });
}

export async function createKBDocument(data: {
  collectionId: string; title: string; content: string; tags?: string[];
}) {
  return callMCP('create_kb_document', data);
}

// ---- Customers ----

export async function getCustomers(params?: { search?: string; limit?: number }) {
  return callMCP('list_customers', params || {});
}

export async function getCustomerInsights() {
  return callMCP('get_customer_insights', {});
}

// ---- Production ----

export async function getProductionOrders(params?: { status?: string; limit?: number }) {
  return callMCP('list_production_orders', params || {});
}

// ---- Helper: format currency ----

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

// ---- ERP Embedding: parse !erp.xxx syntax in notes ----

export interface ErpEmbed {
  type: 'products' | 'orders' | 'inventory' | 'summary' | 'channels' | 'product' | 'order';
  params: Record<string, string>;
  raw: string;
}

const ERP_EMBED_REGEX = /!erp\.(\w+)(\(([^)]*)\))?/g;

export function parseErpEmbeds(content: string): ErpEmbed[] {
  const embeds: ErpEmbed[] = [];
  let match;
  while ((match = ERP_EMBED_REGEX.exec(content)) !== null) {
    const type = match[1] as ErpEmbed['type'];
    const params: Record<string, string> = {};
    if (match[3]) {
      match[3].split(',').forEach(p => {
        const [k, v] = p.split('=').map(s => s.trim());
        if (k && v) params[k] = v;
      });
    }
    embeds.push({ type, params, raw: match[0] });
  }
  return embeds;
}

export async function resolveErpEmbed(embed: ErpEmbed): Promise<string> {
  try {
    switch (embed.type) {
      case 'products':
        return renderEmbedTable(await getProducts({ limit: Number(embed.params.limit) || 10 }), ['name', 'price', 'quantity']);
      case 'orders':
        return renderEmbedTable(await getOrders({ limit: Number(embed.params.limit) || 10 }), ['customer_name', 'total', 'status']);
      case 'inventory':
        return renderEmbedTable(await getInventory({ lowStockOnly: embed.params.lowStock === 'true' }), ['name', 'sku', 'quantity']);
      case 'summary': {
        const s = await getDashboardSummary();
        const d = s?.content?.[0]?.text ? JSON.parse(s.content[0].text) : s;
        return [
          `**ERP Dashboard Summary**`,
          `- Revenue: ${formatCurrency(Number(d.totalRevenue) || 0)}`,
          `- Orders: ${d.totalOrders || 0}`,
          `- Products: ${d.totalProducts || 0}`,
          `- Customers: ${d.totalCustomers || 0}`,
        ].join('\n');
      }
      case 'channels': {
        const c = await getChannelBreakdown();
        const channels = c?.channels || c?.content?.[0]?.text ? JSON.parse(c.content[0].text).channels : [];
        if (!Array.isArray(channels)) return 'No channel data';
        return channels.map((ch: any) => `- ${ch.channel || ch.name}: ${formatCurrency(Number(ch.revenue) || 0)}`).join('\n');
      }
      case 'product': {
        const p = await getProduct(embed.params.id || '');
        const d = p?.content?.[0]?.text ? JSON.parse(p.content[0].text) : p;
        return [
          `**${d.name || 'Product'}**`,
          `- Price: ${formatCurrency(Number(d.price) || 0)}`,
          `- SKU: ${d.sku || '—'}`,
          `- Quantity: ${d.quantity || 0}`,
        ].join('\n');
      }
      case 'order': {
        const o = await getOrder(embed.params.id || '');
        const d = o?.content?.[0]?.text ? JSON.parse(o.content[0].text) : o;
        return [
          `**Order ${d.id || ''}**`,
          `- Customer: ${d.customer_name || d.customerName || '—'}`,
          `- Total: ${formatCurrency(Number(d.total) || 0)}`,
          `- Status: ${d.status || '—'}`,
        ].join('\n');
      }
      default:
        return `*Unknown ERP embed: ${embed.type}*`;
    }
  } catch (err: any) {
    return `*Error loading ${embed.type}: ${err.message}*`;
  }
}

function renderEmbedTable(data: any, fields: string[]): string {
  const items = data?.products || data?.orders || data || [];
  const list = Array.isArray(items) ? items : Array.isArray(data?.content?.[0]?.text) ? data.content[0].text : [];
  if (!Array.isArray(list) || list.length === 0) return '*No data*';
  return list.slice(0, 10).map((item: any) => {
    return fields.map(f => `${f}: ${item[f] ?? item.replace?.(/_/g, ' ') ?? '—'}`).join(', ');
  }).join('\n');
}
